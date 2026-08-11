from datetime import datetime

from pydantic import BaseModel

from models.task_run import ArtifactType, CommentAuthorType, TaskRunOutcome, TaskRunPhase


class TaskRunOut(BaseModel):
    id: str
    task_id: str
    engineer_id: str | None
    phase: TaskRunPhase
    workflow_stage_id: str | None = None
    attempt_number: int = 1
    outcome: TaskRunOutcome | None
    blocking_reason: str | None
    summary: str | None = None
    approval_required: bool = False
    approved_at: datetime | None = None
    started_at: datetime
    claimed_at: datetime | None = None
    completed_at: datetime | None
    last_heartbeat_at: datetime | None

    model_config = {"from_attributes": True}


class TaskRunLogOut(BaseModel):
    id: str
    task_run_id: str
    message: str
    level: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskRunDetail(TaskRunOut):
    logs: list[TaskRunLogOut] = []
    artifacts: list["ArtifactOut"] = []


class ArtifactOut(BaseModel):
    id: str
    task_run_id: str
    artifact_type: ArtifactType
    file_path: str
    filename: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CommentOut(BaseModel):
    id: str
    task_id: str
    task_run_id: str | None
    author_id: str | None
    author_type: CommentAuthorType
    body: str
    action_flag: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CommentCreate(BaseModel):
    body: str
    action_flag: str | None = None
    task_run_id: str | None = None


class OutcomeReport(BaseModel):
    outcome: TaskRunOutcome
    blocking_reason: str | None = None
    summary: str | None = None
    branch_name: str | None = None
    pr_url: str | None = None
    deploy_url: str | None = None
    # Optional usage self-reporting (older runtimes simply omit these)
    tokens_in: int | None = None
    tokens_out: int | None = None
    model: str | None = None


class PollTask(BaseModel):
    id: str
    title: str
    description: str
    status: str
    priority: str
    branch_name: str | None

    model_config = {"from_attributes": True}


class PollProject(BaseModel):
    id: str
    name: str
    repo_url: str | None
    default_branch: str
    default_model: str

    model_config = {"from_attributes": True}


class PollStage(BaseModel):
    id: str
    name: str
    stage_order: int
    is_first: bool
    is_last: bool
    requires_human_approval: bool

    model_config = {"from_attributes": True}


class PollResponse(BaseModel):
    task_run: TaskRunOut | None = None
    task: PollTask | None = None
    project: PollProject | None = None
    bundle: dict[str, str] | None = None
    workflow_stage: PollStage | None = None


class LogSubmit(BaseModel):
    message: str
    level: str = "info"


class ApproveReject(BaseModel):
    note: str | None = None
