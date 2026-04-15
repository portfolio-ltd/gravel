from __future__ import annotations
from pydantic import BaseModel
from datetime import datetime
from models.project import ProjectStatus
from schemas.task import TaskOut
from schemas.changelog import ChangelogOut


class ProjectCreate(BaseModel):
    name: str
    default_model: str = "claude-sonnet-4-6"


class ProjectUpdate(BaseModel):
    name: str | None = None
    default_model: str | None = None


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
    created_at: datetime
    updated_at: datetime
    design_files: list[DesignFileOut] = []

    model_config = {"from_attributes": True}


class ProjectDetail(ProjectOut):
    tasks: list[TaskOut] = []
    changelog: list[ChangelogOut] = []
