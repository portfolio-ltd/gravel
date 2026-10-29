from datetime import datetime

from pydantic import BaseModel, field_validator

from models.task import TaskPriority, TaskStatus, TaskType
from schemas.tag import TagOut


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: TaskPriority = TaskPriority.medium
    type: TaskType = TaskType.feature
    position: int = 0
    acceptance_criteria: list[str] | None = None
    depends_on: list[str] | None = None  # ids of tasks in the same project


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    type: TaskType | None = None
    depends_on: list[str] | None = None  # replaces the list; [] clears it


class TaskReorderItem(BaseModel):
    id: str
    position: int


class CriterionIn(BaseModel):
    id: str | None = None
    text: str
    done: bool = False


class CriteriaUpdate(BaseModel):
    items: list[CriterionIn]


class TaskOut(BaseModel):
    id: str
    project_id: str
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    type: TaskType
    position: int
    branch_name: str | None = None
    pr_url: str | None = None
    deploy_url: str | None = None
    workflow_stage_id: str | None = None
    rework_count: int = 0
    acceptance_criteria: list[dict] = []
    external_source: str | None = None
    external_id: str | None = None
    external_url: str | None = None
    depends_on: list[str] = []
    tags: list[TagOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("acceptance_criteria", "depends_on", mode="before")
    @classmethod
    def _none_as_empty(cls, v):
        return v or []
