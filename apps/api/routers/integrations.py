import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from config import settings
from dependencies import DB, CurrentOrg, CurrentUser
from models.integration import DeployEnvironment, GitIntegration
from schemas.integration import (
    DeployEnvCreate,
    DeployEnvOut,
    DeployEnvUpdate,
    GitIntegrationCreate,
    GitIntegrationOut,
    GitIntegrationUpdate,
)
from services import github as github_svc

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
async def list_git(user: CurrentUser, org: CurrentOrg, db: DB):
    rows = await db.scalars(select(GitIntegration).where(GitIntegration.organization_id == org.id))
    return [_git_out(r) for r in rows.all()]


@router.post("/git", response_model=GitIntegrationOut, status_code=201)
async def create_git(body: GitIntegrationCreate, user: CurrentUser, org: CurrentOrg, db: DB):
    row = GitIntegration(
        owner_id=user.id,
        organization_id=org.id,
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
async def update_git(integration_id: str, body: GitIntegrationUpdate, user: CurrentUser, org: CurrentOrg, db: DB):
    row = await db.get(GitIntegration, integration_id)
    if not row or row.organization_id != org.id:
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
async def delete_git(integration_id: str, user: CurrentUser, org: CurrentOrg, db: DB):
    row = await db.get(GitIntegration, integration_id)
    if not row or row.organization_id != org.id:
        raise HTTPException(404, "Integration not found")
    await db.delete(row)
    await db.commit()


# ── Deploy environments ────────────────────────────────────────────────────────

@router.get("/deploy", response_model=list[DeployEnvOut])
async def list_deploy(user: CurrentUser, org: CurrentOrg, db: DB):
    rows = await db.scalars(select(DeployEnvironment).where(DeployEnvironment.organization_id == org.id))
    return [_deploy_out(r) for r in rows.all()]


@router.post("/deploy", response_model=DeployEnvOut, status_code=201)
async def create_deploy(body: DeployEnvCreate, user: CurrentUser, org: CurrentOrg, db: DB):
    row = DeployEnvironment(
        owner_id=user.id,
        organization_id=org.id,
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
async def update_deploy(env_id: str, body: DeployEnvUpdate, user: CurrentUser, org: CurrentOrg, db: DB):
    row = await db.get(DeployEnvironment, env_id)
    if not row or row.organization_id != org.id:
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
async def delete_deploy(env_id: str, user: CurrentUser, org: CurrentOrg, db: DB):
    row = await db.get(DeployEnvironment, env_id)
    if not row or row.organization_id != org.id:
        raise HTTPException(404, "Environment not found")
    await db.delete(row)
    await db.commit()


# ── GitHub helpers ──────────────────────────────────────────────────────────────

class BranchRequest(BaseModel):
    repo_url: str
    branch_name: str
    base_branch: str = "main"


class PRRequest(BaseModel):
    repo_url: str
    title: str
    body: str
    head: str
    base: str = "main"


@router.get("/git/{integration_id}/verify")
async def verify_github(integration_id: str, user: CurrentUser, org: CurrentOrg, db: DB, repo_url: str | None = None):
    row = await db.get(GitIntegration, integration_id)
    if not row or row.organization_id != org.id:
        raise HTTPException(404, "Integration not found")
    if not row.access_token_encrypted:
        raise HTTPException(400, "No token configured")
    token = _decrypt(row.access_token_encrypted)
    target = repo_url or row.base_url
    if not target:
        raise HTTPException(400, "No repo URL configured — pass ?repo_url=https://github.com/owner/repo")
    return await github_svc.verify_access(target, token)


@router.post("/git/{integration_id}/branch")
async def create_branch(integration_id: str, body: BranchRequest, user: CurrentUser, org: CurrentOrg, db: DB):
    row = await db.get(GitIntegration, integration_id)
    if not row or row.organization_id != org.id:
        raise HTTPException(404, "Integration not found")
    token = _decrypt(row.access_token_encrypted)
    return await github_svc.create_branch(body.repo_url, token, body.branch_name, body.base_branch)


@router.post("/git/{integration_id}/pr")
async def create_pr(integration_id: str, body: PRRequest, user: CurrentUser, org: CurrentOrg, db: DB):
    row = await db.get(GitIntegration, integration_id)
    if not row or row.organization_id != org.id:
        raise HTTPException(404, "Integration not found")
    token = _decrypt(row.access_token_encrypted)
    return await github_svc.create_pull_request(body.repo_url, token, body.title, body.body, body.head, body.base)


# ── AWS deployment ──────────────────────────────────────────────────────────────

class DeployRequest(BaseModel):
    build_path: str
    prefix: str = ""
    invalidate_paths: list[str] | None = None


@router.post("/deploy/{environment_id}/deploy")
async def deploy_environment(environment_id: str, body: DeployRequest, user: CurrentUser, org: CurrentOrg, db: DB):
    """Upload a local build directory to the environment's S3 bucket and
    invalidate its CloudFront distribution (config keys: bucket,
    distribution_id, access_key_id, secret_access_key, region)."""
    from services import deployment as deploy_svc

    row = await db.get(DeployEnvironment, environment_id)
    if not row or row.organization_id != org.id:
        raise HTTPException(404, "Deploy environment not found")
    if not row.config_encrypted:
        raise HTTPException(400, "No deployment config stored for this environment")
    cfg = json.loads(_decrypt(row.config_encrypted))
    bucket = cfg.get("bucket")
    if not bucket:
        raise HTTPException(400, "Deployment config is missing 'bucket'")

    region = row.region or cfg.get("region", "us-east-1")
    result = await deploy_svc.deploy_to_s3(
        body.build_path, bucket,
        cfg.get("access_key_id", ""), cfg.get("secret_access_key", ""),
        region=region, prefix=body.prefix,
    )
    if result.get("ok") and cfg.get("distribution_id"):
        result["invalidation"] = await deploy_svc.invalidate_cloudfront(
            cfg["distribution_id"],
            cfg.get("access_key_id", ""), cfg.get("secret_access_key", ""),
            region=region, paths=body.invalidate_paths,
        )
    return result
