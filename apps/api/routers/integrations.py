import json
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from dependencies import CurrentUser, DB
from models.integration import GitIntegration, DeployEnvironment
from schemas.integration import (
    GitIntegrationCreate, GitIntegrationUpdate, GitIntegrationOut,
    DeployEnvCreate, DeployEnvUpdate, DeployEnvOut,
)
from config import settings

router = APIRouter(prefix="/integrations", tags=["integrations"])


def _encrypt(value: str) -> str:
    return settings.fernet.encrypt(value.encode()).decode()


def _decrypt(value: str) -> str:
    return settings.fernet.decrypt(value.encode()).decode()


def _git_out(row: GitIntegration) -> GitIntegrationOut:
    return GitIntegrationOut(
        id=row.id,
        owner_id=row.owner_id,
        provider=row.provider,
        name=row.name,
        base_url=row.base_url,
        default_branch=row.default_branch,
        is_active=row.is_active,
        has_token=bool(row.access_token_encrypted),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _deploy_out(row: DeployEnvironment) -> DeployEnvOut:
    return DeployEnvOut(
        id=row.id,
        owner_id=row.owner_id,
        project_id=row.project_id,
        name=row.name,
        provider=row.provider,
        region=row.region,
        is_active=row.is_active,
        has_config=bool(row.config_encrypted),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# ── Git integrations ──────────────────────────────────────────────────────────

@router.get("/git", response_model=list[GitIntegrationOut])
async def list_git(user: CurrentUser, db: DB):
    rows = await db.scalars(select(GitIntegration).where(GitIntegration.owner_id == user.id))
    return [_git_out(r) for r in rows.all()]


@router.post("/git", response_model=GitIntegrationOut, status_code=201)
async def create_git(body: GitIntegrationCreate, user: CurrentUser, db: DB):
    row = GitIntegration(
        owner_id=user.id,
        provider=body.provider,
        name=body.name,
        base_url=body.base_url,
        default_branch=body.default_branch,
        access_token_encrypted=_encrypt(body.access_token) if body.access_token else None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _git_out(row)


@router.patch("/git/{integration_id}", response_model=GitIntegrationOut)
async def update_git(integration_id: str, body: GitIntegrationUpdate, user: CurrentUser, db: DB):
    row = await db.get(GitIntegration, integration_id)
    if not row or row.owner_id != user.id:
        raise HTTPException(404, "Integration not found")
    if body.name is not None:           row.name = body.name
    if body.base_url is not None:       row.base_url = body.base_url
    if body.default_branch is not None: row.default_branch = body.default_branch
    if body.is_active is not None:      row.is_active = body.is_active
    if body.access_token is not None:
        row.access_token_encrypted = _encrypt(body.access_token) if body.access_token else None
    await db.commit()
    await db.refresh(row)
    return _git_out(row)


@router.delete("/git/{integration_id}", status_code=204)
async def delete_git(integration_id: str, user: CurrentUser, db: DB):
    row = await db.get(GitIntegration, integration_id)
    if not row or row.owner_id != user.id:
        raise HTTPException(404, "Integration not found")
    await db.delete(row)
    await db.commit()


# ── Deploy environments ────────────────────────────────────────────────────────

@router.get("/deploy", response_model=list[DeployEnvOut])
async def list_deploy(user: CurrentUser, db: DB):
    rows = await db.scalars(select(DeployEnvironment).where(DeployEnvironment.owner_id == user.id))
    return [_deploy_out(r) for r in rows.all()]


@router.post("/deploy", response_model=DeployEnvOut, status_code=201)
async def create_deploy(body: DeployEnvCreate, user: CurrentUser, db: DB):
    row = DeployEnvironment(
        owner_id=user.id,
        project_id=body.project_id,
        name=body.name,
        provider=body.provider,
        region=body.region,
        config_encrypted=_encrypt(json.dumps(body.config)) if body.config else None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _deploy_out(row)


@router.patch("/deploy/{env_id}", response_model=DeployEnvOut)
async def update_deploy(env_id: str, body: DeployEnvUpdate, user: CurrentUser, db: DB):
    row = await db.get(DeployEnvironment, env_id)
    if not row or row.owner_id != user.id:
        raise HTTPException(404, "Environment not found")
    if body.name is not None:   row.name = body.name
    if body.region is not None: row.region = body.region
    if body.is_active is not None: row.is_active = body.is_active
    if body.config is not None:
        row.config_encrypted = _encrypt(json.dumps(body.config)) if body.config else None
    await db.commit()
    await db.refresh(row)
    return _deploy_out(row)


@router.delete("/deploy/{env_id}", status_code=204)
async def delete_deploy(env_id: str, user: CurrentUser, db: DB):
    row = await db.get(DeployEnvironment, env_id)
    if not row or row.owner_id != user.id:
        raise HTTPException(404, "Environment not found")
    await db.delete(row)
    await db.commit()
