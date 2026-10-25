"""
Docker lifecycle for engineer runtimes.

RUNTIME_MODE=docker launches a real container per runtime (built from
apps/runtime). RUNTIME_MODE=simulated skips Docker entirely — the runtime row
exists in the DB and the in-process agent loop executes runs instead.

Every launch mints a one-time bearer token for the runtime; only its SHA-256
hash is stored. The plaintext goes into the container environment and is
never persisted or logged.
"""
import asyncio
import json
import logging
import secrets
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from dependencies import hash_runtime_token
from models.engineer import Engineer, EngineerRuntime
from models.integration import DeployEnvironment, GitIntegration
from models.user import User
from services.users import get_plain_keys

logger = logging.getLogger(__name__)

PROVIDER_ENV_VARS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "groq": "GROQ_API_KEY",
}


def _docker_client():
    try:
        import docker
        client = docker.from_env()
        client.ping()
        return client
    except Exception as exc:
        raise HTTPException(
            503,
            f"Docker is not available for engineer runtimes ({exc}). "
            "Set RUNTIME_MODE=simulated to run without containers.",
        )


def _default_context_path() -> str:
    if settings.RUNTIME_IMAGE_CONTEXT_PATH:
        return settings.RUNTIME_IMAGE_CONTEXT_PATH
    # apps/api/services/runtime_manager.py → apps/ → apps/runtime
    return str(Path(__file__).resolve().parents[2] / "runtime")


def container_name_for(runtime: EngineerRuntime) -> str:
    return f"gravel-engineer-{runtime.engineer_id[:8]}-{runtime.id[:8]}"


async def _collect_secrets(db: AsyncSession, owner: User, engineer: Engineer) -> dict[str, str]:
    """Decrypt the launch-time secrets for the container environment."""
    env: dict[str, str] = {}

    keys = get_plain_keys(owner)
    provider_env = PROVIDER_ENV_VARS.get(engineer.model_provider)
    provider_key = keys.get(engineer.model_provider, "")
    if not provider_key:
        raise HTTPException(
            400,
            f"No {engineer.model_provider} API key configured. "
            "Add one in Settings → API Keys before launching this engineer.",
        )
    if provider_env:
        env[provider_env] = provider_key

    git_row = (await db.execute(
        select(GitIntegration).where(
            GitIntegration.organization_id == engineer.organization_id,
            GitIntegration.provider == "github",
            GitIntegration.is_active.is_(True),
        )
    )).scalars().first()
    if git_row and git_row.access_token_encrypted:
        env["GRAVEL_GITHUB_TOKEN"] = settings.fernet.decrypt(
            git_row.access_token_encrypted.encode()
        ).decode()

    deploy_row = (await db.execute(
        select(DeployEnvironment).where(
            DeployEnvironment.organization_id == engineer.organization_id,
            DeployEnvironment.provider == "aws",
            DeployEnvironment.is_active.is_(True),
        )
    )).scalars().first()
    if deploy_row and deploy_row.config_encrypted:
        try:
            cfg = json.loads(settings.fernet.decrypt(deploy_row.config_encrypted.encode()).decode())
            env["AWS_ACCESS_KEY_ID"] = cfg.get("access_key_id", "")
            env["AWS_SECRET_ACCESS_KEY"] = cfg.get("secret_access_key", "")
            env["AWS_DEFAULT_REGION"] = deploy_row.region or cfg.get("region", settings.AWS_DEFAULT_REGION)
        except Exception:
            logger.warning("Could not decode deploy environment config for owner %s", owner.id)

    return env


def _ensure_image(client) -> None:
    import docker
    try:
        client.images.get(settings.RUNTIME_IMAGE)
    except docker.errors.ImageNotFound:
        context = _default_context_path()
        logger.info("Building runtime image %s from %s", settings.RUNTIME_IMAGE, context)
        client.images.build(path=context, tag=settings.RUNTIME_IMAGE, rm=True)


def _run_container(client, name: str, env: dict[str, str]) -> str:
    kwargs: dict = {
        "detach": True,
        "name": name,
        "environment": env,
        "labels": {"gravel.managed": "true"},
        "restart_policy": {"Name": "unless-stopped"},
    }
    if settings.RUNTIME_DOCKER_NETWORK:
        kwargs["network"] = settings.RUNTIME_DOCKER_NETWORK
    else:
        # Local dev: let the container reach the host API
        kwargs["extra_hosts"] = {"host.docker.internal": "host-gateway"}

    # Remove any stale container with the same name
    try:
        old = client.containers.get(name)
        old.remove(force=True)
    except Exception:
        pass

    container = client.containers.run(settings.RUNTIME_IMAGE, **kwargs)
    return container.id


async def start_runtime(db: AsyncSession, engineer: Engineer, runtime: EngineerRuntime, owner: User) -> str:
    """Provision the runtime: mint its token, and start its container in docker mode.

    Returns the plaintext runtime token (only ever returned once).
    """
    token = secrets.token_urlsafe(32)
    runtime.runtime_token_hash = hash_runtime_token(token)
    runtime.container_name = container_name_for(runtime)

    if settings.RUNTIME_MODE != "docker":
        runtime.status_message = "Simulated runtime (no container)"
        await db.flush()
        return token

    env = await _collect_secrets(db, owner, engineer)
    env.update({
        "GRAVEL_API_BASE_URL": settings.RUNTIME_API_BASE_URL,
        "GRAVEL_ENGINEER_ID": engineer.id,
        "GRAVEL_RUNTIME_ID": runtime.id,
        "GRAVEL_RUNTIME_TOKEN": token,
        "GRAVEL_MODEL_PROVIDER": engineer.model_provider,
        "GRAVEL_MODEL_NAME": engineer.model_name,
        "GRAVEL_EXECUTOR": settings.RUNTIME_EXECUTOR,
        "GRAVEL_POLL_INTERVAL_SECONDS": str(settings.RUNTIME_POLL_INTERVAL_SECONDS),
        "GRAVEL_HEARTBEAT_INTERVAL_SECONDS": str(settings.RUNTIME_HEARTBEAT_INTERVAL_SECONDS),
    })

    client = _docker_client()
    try:
        await asyncio.to_thread(_ensure_image, client)
        container_id = await asyncio.to_thread(_run_container, client, runtime.container_name, env)
        runtime.container_id = container_id
        runtime.status_message = "Container started"
    except HTTPException:
        raise
    except Exception as exc:
        runtime.status_message = f"Launch failed: {exc}"
        await db.flush()
        raise HTTPException(500, f"Failed to launch runtime container: {exc}")

    await db.flush()
    return token


async def stop_runtime_container(runtime: EngineerRuntime) -> None:
    """Best-effort container teardown; DB bookkeeping happens in the caller."""
    if settings.RUNTIME_MODE != "docker" or not (runtime.container_id or runtime.container_name):
        return
    try:
        client = _docker_client()
    except HTTPException:
        logger.warning("Docker unavailable while stopping runtime %s; skipping teardown", runtime.id)
        return

    def _stop() -> None:
        try:
            container = client.containers.get(runtime.container_id or runtime.container_name)
            container.stop(timeout=10)
            container.remove(force=True)
        except Exception as exc:
            logger.info("Container for runtime %s already gone: %s", runtime.id, exc)

    await asyncio.to_thread(_stop)
