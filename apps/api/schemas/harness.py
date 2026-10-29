from datetime import datetime

from pydantic import BaseModel, Field


class HarnessAgent(BaseModel):
    description: str = ""
    prompt: str = Field(min_length=1, max_length=20000)
    tools: list[str] | None = None
    model: str | None = None
    # Stage roles this subagent is offered to (empty = every role)
    roles: list[str] | None = None


class HarnessIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    executor: str = "any"
    roles: list[str] = []
    agents: dict[str, HarnessAgent] = {}
    routing: dict[str, str] = {}
    instructions_markdown: str | None = None
    test_gate: bool = True
    max_review_rounds: int = Field(2, ge=0, le=10)
    max_turns: int = Field(0, ge=0, le=10000)
    allowed_tools: list[str] | None = None
    disallowed_tools: list[str] | None = None
    is_default: bool = False


class HarnessUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    executor: str | None = None
    roles: list[str] | None = None
    agents: dict[str, HarnessAgent] | None = None
    routing: dict[str, str] | None = None
    instructions_markdown: str | None = None
    test_gate: bool | None = None
    max_review_rounds: int | None = Field(None, ge=0, le=10)
    max_turns: int | None = Field(None, ge=0, le=10000)
    allowed_tools: list[str] | None = None
    disallowed_tools: list[str] | None = None
    is_default: bool | None = None


class HarnessOut(BaseModel):
    id: str
    organization_id: str
    owner_id: str | None
    name: str
    description: str | None
    template_key: str | None
    executor: str
    roles: list[str] = []
    agents: dict[str, HarnessAgent] = {}
    routing: dict[str, str] = {}
    instructions_markdown: str | None
    test_gate: bool
    max_review_rounds: int
    max_turns: int
    allowed_tools: list[str] | None
    disallowed_tools: list[str] | None
    is_default: bool
    created_at: datetime
    updated_at: datetime


class HarnessFromTemplate(BaseModel):
    template_key: str
    name: str | None = None
    make_default: bool = False


class HarnessTemplateOut(BaseModel):
    key: str
    name: str
    description: str
    executor: str
    roles: list[str]
    agents: list[str]
    test_gate: bool
    max_turns: int


class HarnessPreviewOut(BaseModel):
    role: str
    files: dict[str, str]
