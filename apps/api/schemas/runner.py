from pydantic import BaseModel, Field


class RunnerRegister(BaseModel):
    host_label: str = Field(default="my machine", max_length=200)
    executor: str = "claude-code"     # claude-code | codex | opencode
    scope: str = "mine"               # mine = projects I own; org = the whole organization
    engineer_id: str | None = None    # reuse an existing engineer; default: "<name>'s <host>"
    engineer_name: str | None = None


class RunnerRegistered(BaseModel):
    runtime_id: str
    engineer_id: str
    engineer_name: str
    runtime_token: str  # returned exactly once
    scope: str
    poll_interval_seconds: int
    heartbeat_interval_seconds: int


class RunnerJobOut(BaseModel):
    id: str
    model: str | None = None
    system: str | None = None
    prompt: str
    json_schema: dict | None = None
    max_tokens: int


class RunnerJobPoll(BaseModel):
    job: RunnerJobOut | None = None


class RunnerJobResult(BaseModel):
    text: str | None = None
    error: str | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None
