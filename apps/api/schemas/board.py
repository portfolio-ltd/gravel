from pydantic import BaseModel

from schemas.task import TaskOut


class BoardTaskOut(TaskOut):
    open_question_count: int = 0  # open blocking questions
    stage_name: str | None = None
    waiting_on_count: int = 0  # dependencies not done yet (task graph)


class BoardColumn(BaseModel):
    key: str            # unique lane key: "status:<value>" or "stage:<id>"
    label: str          # human lane title
    status: str | None  # set for default status lanes (drag target); None for stage lanes
    stage_id: str | None = None
    tasks: list[BoardTaskOut]


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
    engineer_id: str | None = None    # who did the work now waiting at the gate
    engineer_name: str | None = None
    stage_name: str | None = None

    model_config = {"from_attributes": True}


class WorkspaceMetrics(BaseModel):
    total_projects: int
    engineers_running: int
    total_tasks: int
    blocked_tasks: int
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    # Rolling 7-day windows: "week" is the last 7 days, "prev_week" the 7 before
    runs_active: int = 0                  # runs claimed or queued, not finished
    stages_completed_week: int = 0        # runs that finished their stage successfully
    stages_completed_prev_week: int = 0
    agent_seconds_week: int = 0           # summed claimed → completed time of finished runs
    agent_seconds_prev_week: int = 0
    cost_usd_week: float = 0.0
    cost_usd_prev_week: float = 0.0
    oldest_waiting_since: str | None = None  # ISO datetime of the oldest open human gate


class RunningRunOut(BaseModel):
    """A run that has not reported an outcome yet: claimed by an engineer, or queued."""
    run_id: str
    task_id: str
    task_title: str
    project_id: str
    project_name: str
    engineer_id: str | None
    engineer_name: str | None
    state: str                      # "running" (claimed) or "queued"
    stage_name: str                 # workflow stage name, or the phase ("build")
    stage_index: int | None = None  # 1-based position in the project's pipeline
    stage_count: int | None = None
    attempt_number: int = 1
    queued_at: str                  # ISO: when the run was created
    started_at: str | None = None   # ISO: when an engineer claimed it
    last_heartbeat_at: str | None = None
    stale: bool = False             # claimed, but no sign of life for a while
    typical_seconds: int | None = None  # median duration of recent finished runs of this stage
    runner_account: str | None = None   # account that is running it, or the one the project waits for


class AccountRunnerOut(BaseModel):
    host_label: str | None
    executor: str | None
    online: bool
    scope: str


class AccountUsageOut(BaseModel):
    """Local runners grouped by the AI account they are signed in to (per person)."""
    account: str | None             # None: runners started without --account
    owner_id: str
    owner_name: str
    runners: list[AccountRunnerOut]
    pinned_projects: list[str]      # names of projects pinned to this account (owner's projects)
    runs_week: int = 0              # runs this account finished in the last 7 days
    agent_seconds_week: int = 0
    tokens_week: int = 0
