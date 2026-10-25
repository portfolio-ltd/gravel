from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from config import settings
from models.project import ProjectStatus
from schemas.changelog import ChangelogOut
from schemas.task import TaskOut


class ProjectCreate(BaseModel):
    name: str
    default_model: str = settings.DEFAULT_MODEL
    repo_url: str | None = None
    default_branch: str = "main"
    workflow_id: str | None = None
    # Built-in workflow template key (services/sdlc.py); reuses or creates the
    # org's workflow for it. Ignored when workflow_id is given.
    workflow_template: str | None = None
    issues_repo: str | None = None
    post_issue_comments: bool = False


class ProjectUpdate(BaseModel):
    name: str | None = None
    default_model: str | None = None
    repo_url: str | None = None
    default_branch: str | None = None
    workflow_id: str | None = None
    issues_repo: str | None = None
    post_issue_comments: bool | None = None


class DesignFileOut(BaseModel):
    id: str
    filename: str
    file_path: str

    model_config = {"from_attributes": True}


class ProjectOut(BaseModel):
    id: str
    name: str
    status: ProjectStatus
    prd_file_path: str | None
    progress: int
    owner_id: str
    default_model: str
    repo_url: str | None = None
    default_branch: str = "main"
    workflow_id: str | None = None
    issues_repo: str | None = None
    post_issue_comments: bool = False
    created_at: datetime
    updated_at: datetime
    design_files: list[DesignFileOut] = []

    model_config = {"from_attributes": True}


class ProjectDetail(ProjectOut):
    tasks: list[TaskOut] = []
    changelog: list[ChangelogOut] = []
