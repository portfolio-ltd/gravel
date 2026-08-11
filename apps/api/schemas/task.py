from datetime import datetime

from pydantic import BaseModel

from models.task import TaskPriority, TaskStatus, TaskType
from schemas.tag import TagOut


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: TaskPriority = TaskPriority.medium
    type: TaskType = TaskType.feature
    position: int = 0


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    type: TaskType | None = None


class TaskReorderItem(BaseModel):
    id: str
    position: int


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
    tags: list[TagOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
