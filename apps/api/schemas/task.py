from pydantic import BaseModel
from datetime import datetime
from models.task import TaskStatus, TaskPriority, TaskType


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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
