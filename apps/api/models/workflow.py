from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import BaseModel


class Workflow(BaseModel):
    __tablename__ = "workflows"
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_workflows_owner_name"),)

    # owner_id is "created by"; organization_id scopes access
    owner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Built-in template this workflow was created from (services/sdlc.py), if any
    template_key: Mapped[str | None] = mapped_column(String(60), nullable=True)

    stages: Mapped[list["WorkflowStage"]] = relationship(
        "WorkflowStage",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="WorkflowStage.stage_order",
    )
    loops: Mapped[list["WorkflowLoop"]] = relationship(
        "WorkflowLoop",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="WorkflowLoop.created_at",
    )


class WorkflowStage(BaseModel):
    __tablename__ = "workflow_stages"

    workflow_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    stage_order: Mapped[int] = mapped_column(Integer, nullable=False)
    # Methodology role (services/sdlc.py STAGE_ROLES): default instructions,
    # which documents the stage produces, and how its result is interpreted
    role: Mapped[str] = mapped_column(String(40), nullable=False, default="custom")
    # Park completed runs while the task still has open blocking questions
    block_on_open_questions: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    assigned_engineer_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("engineers.id", ondelete="SET NULL"), nullable=True
    )
    requires_human_approval: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_ai_executable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    stage_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Model override for this stage's runs; None inherits engineer → project →
    # DEFAULT_MODEL (services/llm.py resolve_model)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    max_rework_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    rework_target_stage_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("workflow_stages.id", use_alter=True, name="fk_stage_rework_target", ondelete="SET NULL"),
        nullable=True,
    )

    # Success edge: where a completed stage goes next. None → the next stage by
    # stage_order. Together with rework_target_stage_id (the failure edge) this
    # makes a workflow a graph that can branch and loop.
    next_stage_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # Agent harness for this stage's runs; None → the org default, then the
    # built-in harness for the stage's role (services/harness.py)
    harness_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("agent_harnesses.id", ondelete="SET NULL"), nullable=True
    )

    workflow: Mapped["Workflow"] = relationship("Workflow", back_populates="stages")


LOOP_ON_EXHAUSTED = ("ask_human", "proceed")


class WorkflowLoop(BaseModel):
    """A named, bounded cycle of stages (loop engineering).

    A task runs from the entry stage to the check stage; that is one pass. When
    the check stage passes, the task leaves the loop along the check stage's
    success edge. When it fails (a failed/blocked run, or a review that
    requests changes) the task starts another pass at the entry stage, carrying
    the checker's feedback, until max_iterations passes or the cost budget are
    used up. Then on_exhausted decides: ask a human, or proceed anyway.
    A loop replaces the check stage's rework edge while it exists.
    """
    __tablename__ = "workflow_loops"
    __table_args__ = (UniqueConstraint("workflow_id", "check_stage_id", name="uq_workflow_loops_check"),)

    workflow_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Plain-language exit condition the check stage judges against
    goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    entry_stage_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workflow_stages.id", ondelete="CASCADE"), nullable=False
    )
    check_stage_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workflow_stages.id", ondelete="CASCADE"), nullable=False
    )
    max_iterations: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    # Estimated spend cap for one round of passes; None = no cap
    max_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    # LOOP_ON_EXHAUSTED: park for a human, or carry on down the success edge
    on_exhausted: Mapped[str] = mapped_column(String(20), nullable=False, default="ask_human")
    # Post the checker's findings to the task thread so the next pass sees them
    carry_feedback: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    workflow: Mapped["Workflow"] = relationship("Workflow", back_populates="loops")
