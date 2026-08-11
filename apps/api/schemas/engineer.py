from datetime import datetime

from pydantic import BaseModel

from models.engineer import EngineerStatus


class EngineerCreate(BaseModel):
    name: str
    template: str = "fullstack"
    skills_markdown: str | None = None
    model_provider: str = "anthropic"
    model_name: str = "claude-sonnet-4-6"


class EngineerUpdate(BaseModel):
    name: str | None = None
    template: str | None = None
    skills_markdown: str | None = None
    model_provider: str | None = None
    model_name: str | None = None


class RuntimeOut(BaseModel):
    id: str
    container_id: str | None
    container_name: str | None = None
    status_message: str | None = None
    current_task_run_id: str | None = None
    started_at: datetime
    stopped_at: datetime | None
    last_heartbeat_at: datetime | None
    is_active: bool

    model_config = {"from_attributes": True}


class LaunchOut(RuntimeOut):
    # The runtime bearer token — returned exactly once, at launch.
    runtime_token: str


class EngineerOut(BaseModel):
    id: str
    name: str
    template: str
    skills_markdown: str | None
    status: EngineerStatus
    owner_id: str
    model_provider: str
    model_name: str
    created_at: datetime
    runtimes: list[RuntimeOut] = []

    model_config = {"from_attributes": True}
