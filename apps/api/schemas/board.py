from pydantic import BaseModel

from schemas.task import TaskOut


class BoardColumn(BaseModel):
    key: str            # unique lane key: "status:<value>" or "stage:<id>"
    label: str          # human lane title
    status: str | None  # set for default status lanes (drag target); None for stage lanes
    stage_id: str | None = None
    tasks: list[TaskOut]


class BoardOut(BaseModel):
    columns: list[BoardColumn]


class AttentionTaskOut(BaseModel):
    task_id: str
    task_title: str
    project_id: str
    project_name: str
    run_id: str
    outcome: str
    blocking_reason: str | None
    blocked_since: str  # ISO datetime string

    model_config = {"from_attributes": True}


class WorkspaceMetrics(BaseModel):
    total_projects: int
    engineers_running: int
    total_tasks: int
    blocked_tasks: int
    total_tokens: int = 0
    total_cost_usd: float = 0.0
