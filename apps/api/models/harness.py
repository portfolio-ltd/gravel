"""Agent harnesses: how a stage run is wrapped before an agent executes it.

A harness is the editable part of "the graph inside a run": which subagents
the run may delegate to, how work is routed between them, whether the
project's tests gate the run, and the limits the executor applies (turns,
tools). Gravel ships built-in harnesses (services/harness.py TEMPLATES); an
organization can copy and edit them, mark one as its default, and pin a
different one to any workflow stage.
"""
from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db.base import BaseModel

# Which executor the harness is written for. "any" works everywhere: executors
# that cannot honour a setting ignore it.
HARNESS_EXECUTORS = ("any", "claude-code", "opencode", "llm")


class AgentHarness(BaseModel):
    __tablename__ = "agent_harnesses"

    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Built-in template this harness was copied from, if any
    template_key: Mapped[str | None] = mapped_column(String(60), nullable=True)
    executor: Mapped[str] = mapped_column(String(20), nullable=False, default="any")
    # Stage roles the harness is meant for (empty = every role). Only a hint
    # for the picker and the preview; a stage can pin any harness.
    roles: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # {name: {"description": str, "prompt": str, "tools": [str] | None, "model": str | None}}
    agents: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Role → how to route work between the subagents (markdown). A "*" key
    # applies to roles without their own entry.
    routing: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Appended to every run's STAGE_INSTRUCTIONS.md ("always run the linter…")
    instructions_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Run the project's test commands before a code-writing run may finish
    test_gate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Stop rule for the reviewer loop inside a build run
    max_review_rounds: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    # Executor limits: 0 = no turn limit; tool lists use the executor's names
    max_turns: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    allowed_tools: Mapped[list | None] = mapped_column(JSON, nullable=True)
    disallowed_tools: Mapped[list | None] = mapped_column(JSON, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
