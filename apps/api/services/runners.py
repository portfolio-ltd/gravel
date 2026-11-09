"""Local runners: engineer runtimes people start on their own machines.

`gravel work` (apps/runtime) registers a runner with the user's API token and
then speaks the ordinary runtime protocol (poll → execute → report) with the
runtime token it gets back. The AI work runs through whatever CLI the person
is signed in to locally (Claude Code, Codex), so their credentials never
reach the server.

A local runner is personal by default: it takes runs only from projects its
owner owns (scope "mine"); `--team` makes it serve the whole organization.
A runner that stops heartbeating counts as offline after RUNNER_STALE.

Accounts: `gravel work --account work` labels a runner with the AI account its
CLI is signed in to. A project pinned to an account (`Project.runner_account`)
is only worked on by runners with that label; nothing else — Docker
runtimes, other runners, the in-process executor — takes its runs.

Keyless projects: when a user has no API key for a model but has a runner
online, server-side model calls (in-process stages, PRD parsing and chat,
code-graph summaries) become LlmJobs that the runner executes
(`llm_keys` + services/llm.py's "runner" provider).
"""
import asyncio
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.session import AsyncSessionLocal
from dependencies import hash_runtime_token
from models.api_token import LlmJob
from models.engineer import Engineer, EngineerRuntime, EngineerStatus
from models.user import User

RUNNER_STALE = timedelta(seconds=180)
EXECUTOR_PROVIDERS = {"claude-code": "anthropic", "codex": "openai", "opencode": "anthropic"}


def normalize_account(label: str | None) -> str | None:
    """Account labels compare case-insensitively: "Work " and "work" are the same account."""
    label = " ".join((label or "").split()).lower()[:100]
    return label or None


def _aware(dt: datetime | None) -> datetime | None:
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


def is_online(runtime: EngineerRuntime, now: datetime | None = None) -> bool:
    """Docker runtimes are online while active; local ones also need a recent heartbeat."""
    if not runtime.is_active:
        return False
    if runtime.kind != "local":
        return True
    beat = _aware(runtime.last_heartbeat_at) or _aware(runtime.started_at)
    return beat is not None and (now or datetime.now(timezone.utc)) - beat <= RUNNER_STALE


def serves_owner(runtime: EngineerRuntime, project_owner_id: str | None) -> bool:
    return runtime.kind != "local" or runtime.scope != "mine" or runtime.owner_user_id == project_owner_id


async def register(db: AsyncSession, user: User, organization_id: str, *, host_label: str,
                   executor: str, scope: str, engineer_id: str | None = None,
                   engineer_name: str | None = None, account: str | None = None) -> tuple[EngineerRuntime, Engineer, str]:
    """Create a local runtime (and its engineer when needed). Returns (runtime, engineer, plaintext token)."""
    if executor not in EXECUTOR_PROVIDERS:
        raise HTTPException(400, f"Unknown executor '{executor}'. Use one of: {', '.join(EXECUTOR_PROVIDERS)}")
    if scope not in ("mine", "org"):
        raise HTTPException(400, "scope must be 'mine' or 'org'")
    host_label = (host_label or "my machine").strip()[:200]
    if engineer_id:
        engineer = (await db.execute(select(Engineer).where(
            Engineer.id == engineer_id, Engineer.organization_id == organization_id
        ))).scalar_one_or_none()
        if engineer is None:
            raise HTTPException(404, "Engineer not found")
    else:
        name = (engineer_name or f"{user.name.split()[0] if user.name else 'My'}'s {host_label}").strip()[:200]
        engineer = (await db.execute(select(Engineer).where(
            Engineer.organization_id == organization_id, Engineer.owner_id == user.id, Engineer.name == name
        ))).scalar_one_or_none()
        if engineer is None:
            engineer = Engineer(
                name=name, template="fullstack", owner_id=user.id, organization_id=organization_id,
                model_provider=EXECUTOR_PROVIDERS[executor],
                skills_markdown=f"Local runner on {host_label}, executing with {executor}.",
            )
            db.add(engineer)
            await db.flush()

    # Restarting `gravel work` on the same machine retires that machine's old registrations
    # (a killed process never got to say goodbye)
    leftovers = (await db.execute(select(EngineerRuntime).where(
        EngineerRuntime.engineer_id == engineer.id, EngineerRuntime.kind == "local",
        EngineerRuntime.owner_user_id == user.id, EngineerRuntime.host_label == host_label,
        EngineerRuntime.is_active.is_(True),
    ))).scalars().all()
    for old in leftovers:
        await stop(db, old)

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    runtime = EngineerRuntime(
        engineer_id=engineer.id, kind="local", host_label=host_label, owner_user_id=user.id,
        scope=scope, executor=executor, runtime_token_hash=hash_runtime_token(token),
        started_at=now, last_heartbeat_at=now, is_active=True,
        account_label=normalize_account(account),
        status_message=f"Local runner on {host_label} ({executor}"
                       + (f", account {normalize_account(account)})" if normalize_account(account) else ")"),
    )
    db.add(runtime)
    engineer.status = EngineerStatus.running
    await db.flush()
    return runtime, engineer, token


async def stop(db: AsyncSession, runtime: EngineerRuntime) -> None:
    runtime.is_active = False
    runtime.stopped_at = datetime.now(timezone.utc)
    runtime.current_task_run_id = None
    others = (await db.execute(select(EngineerRuntime.id).where(
        EngineerRuntime.engineer_id == runtime.engineer_id, EngineerRuntime.is_active.is_(True),
        EngineerRuntime.id != runtime.id,
    ))).first()
    if others is None:
        engineer = await db.get(Engineer, runtime.engineer_id)
        if engineer:
            engineer.status = EngineerStatus.stopped
    await db.flush()


async def online_local_runner(db: AsyncSession, user_id: str) -> EngineerRuntime | None:
    rows = (await db.execute(select(EngineerRuntime).where(
        EngineerRuntime.kind == "local", EngineerRuntime.owner_user_id == user_id, EngineerRuntime.is_active.is_(True),
    ))).scalars()
    now = datetime.now(timezone.utc)
    return next((r for r in rows if is_online(r, now)), None)


async def has_local_runner(db: AsyncSession, user_id: str) -> bool:
    """Has this user ever set up a local runner? Then their keyless runs wait for it instead of simulating."""
    return (await db.execute(select(EngineerRuntime.id).where(
        EngineerRuntime.kind == "local", EngineerRuntime.owner_user_id == user_id
    ).limit(1))).first() is not None


async def llm_keys(db: AsyncSession, user: User | None) -> dict:
    """The user's provider keys, plus {"runner": user_id} when a local runner of theirs is online."""
    from services.users import get_plain_keys
    keys = dict(get_plain_keys(user)) if user else {}
    if user and await online_local_runner(db, user.id):
        keys["runner"] = user.id
    return keys


# ── LLM jobs ──────────────────────────────────────────────────────────────────

async def run_job(user_id: str, *, model: str, prompt: str, system: str | None,
                  json_schema: dict | None, max_tokens: int) -> LlmJob:
    """Queue a model call for the user's runner and wait for its answer.

    Uses its own sessions so the runner (another request) can see and claim
    the job while the caller's transaction is still open.
    """
    async with AsyncSessionLocal() as db:
        job = LlmJob(user_id=user_id, model=model, prompt=prompt, system=system,
                     json_schema=json_schema, max_tokens=max_tokens, status="pending")
        db.add(job)
        await db.commit()
        job_id = job.id
    deadline = asyncio.get_running_loop().time() + settings.RUNNER_JOB_TIMEOUT_SECONDS
    while asyncio.get_running_loop().time() < deadline:
        await asyncio.sleep(1)
        async with AsyncSessionLocal() as db:
            job = await db.get(LlmJob, job_id)
            if job is not None and job.status in ("done", "failed"):
                return job
    async with AsyncSessionLocal() as db:
        job = await db.get(LlmJob, job_id)
        if job is not None and job.status in ("pending", "claimed"):
            job.status = "failed"
            job.error = f"No answer from your runner within {settings.RUNNER_JOB_TIMEOUT_SECONDS}s"
            await db.commit()
        return job


async def claim_job(db: AsyncSession, runtime: EngineerRuntime) -> LlmJob | None:
    """The oldest pending job of this runner's owner. Only local runners take jobs."""
    if runtime.kind != "local" or not runtime.owner_user_id:
        return None
    q = (select(LlmJob).where(LlmJob.user_id == runtime.owner_user_id, LlmJob.status == "pending")
         .order_by(LlmJob.created_at).limit(1))
    if db.bind and db.bind.dialect.name == "postgresql":
        q = q.with_for_update(skip_locked=True)
    job = (await db.execute(q)).scalar_one_or_none()
    if job is None:
        return None
    job.status = "claimed"
    job.runtime_id = runtime.id
    job.claimed_at = datetime.now(timezone.utc)
    runtime.last_heartbeat_at = job.claimed_at
    await db.flush()
    return job


async def complete_job(db: AsyncSession, runtime: EngineerRuntime, job_id: str, *, text: str | None,
                       error: str | None, tokens_in: int | None, tokens_out: int | None) -> LlmJob:
    job = await db.get(LlmJob, job_id)
    if job is None or job.runtime_id != runtime.id or job.status != "claimed":
        raise HTTPException(404, "Job not found for this runner")
    job.status = "failed" if error or not text else "done"
    job.result_text = text
    job.error = error or (None if text else "The runner returned no text")
    job.tokens_in, job.tokens_out = tokens_in, tokens_out
    job.completed_at = datetime.now(timezone.utc)
    await db.flush()
    return job


def serves_account(runtime: EngineerRuntime, runner_account: str | None) -> bool:
    """May this runtime take runs of a project pinned to `runner_account`?"""
    return runner_account is None or (runtime.kind == "local" and runtime.account_label == runner_account)


async def account_online(db: AsyncSession, organization_id: str, project_owner_id: str | None, account: str) -> bool:
    """Is a runner signed in to `account` online and allowed to take this owner's runs?"""
    rows = (await db.execute(
        select(EngineerRuntime).join(Engineer, Engineer.id == EngineerRuntime.engineer_id).where(
            Engineer.organization_id == organization_id, EngineerRuntime.kind == "local",
            EngineerRuntime.is_active.is_(True), EngineerRuntime.account_label == account,
        )
    )).scalars()
    now = datetime.now(timezone.utc)
    return any(is_online(r, now) and serves_owner(r, project_owner_id) for r in rows)


def runtime_filter_for_owner(project_owner_id: str | None):
    """SQL condition: runtimes that may take runs from a project owned by `project_owner_id`."""
    return or_(EngineerRuntime.kind != "local", EngineerRuntime.scope != "mine",
               EngineerRuntime.owner_user_id == project_owner_id)
