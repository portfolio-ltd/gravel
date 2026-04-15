from __future__ import annotations
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class GitIntegrationCreate(BaseModel):
    provider: str          # "github" | "gitlab" | "bitbucket" | "gitea"
    name: str
    base_url: Optional[str] = None
    access_token: Optional[str] = None
    default_branch: str = "main"


class GitIntegrationUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    access_token: Optional[str] = None   # new token replaces old
    default_branch: Optional[str] = None
    is_active: Optional[bool] = None


class GitIntegrationOut(BaseModel):
    id: str
    owner_id: str
    provider: str
    name: str
    base_url: Optional[str]
    default_branch: str
    is_active: bool
    has_token: bool   # true if a token is stored (never expose the token itself)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Deploy environments ────────────────────────────────────────────────────────

class DeployEnvCreate(BaseModel):
    name: str
    provider: str          # "aws" | "gcp" | "azure" | "custom"
    region: Optional[str] = None
    project_id: Optional[str] = None
    config: Optional[dict] = None   # provider-specific fields (stored encrypted)


class DeployEnvUpdate(BaseModel):
    name: Optional[str] = None
    region: Optional[str] = None
    config: Optional[dict] = None
    is_active: Optional[bool] = None


class DeployEnvOut(BaseModel):
    id: str
    owner_id: str
    project_id: Optional[str]
    name: str
    provider: str
    region: Optional[str]
    is_active: bool
    has_config: bool   # true if encrypted config is stored
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
