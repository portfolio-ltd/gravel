from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
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
