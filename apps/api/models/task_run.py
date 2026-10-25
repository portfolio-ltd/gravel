import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import BaseModel

if TYPE_CHECKING:
    from models.task import Task  # noqa: F401


class TaskRunPhase(str, enum.Enum):
    grooming = "grooming"
    build = "build"
    testing = "testing"
    deployment = "deployment"


class TaskRunOutcome(str, enum.Enum):
    grooming_complete = "grooming_complete"
    build_complete = "build_complete"
    testing_complete = "testing_complete"
    deployment_complete = "deployment_complete"
    needs_human_input = "needs_human_input"
    blocked = "blocked"
    failed = "failed"


class CommentAuthorType(str, enum.Enum):
    human = "human"
    ai = "ai"


class ArtifactType(str, enum.Enum):
    screenshot = "screenshot"
    log = "log"
    test_result = "test_result"


class TaskRun(BaseModel):
    __tablename__ = "task_runs"

    task_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    engineer_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("engineers.id", ondelete="SET NULL"), nullable=True
    )
    phase: Mapped[TaskRunPhase] = mapped_column(
        SAEnum(TaskRunPhase, native_enum=False, length=50), nullable=False, default=TaskRunPhase.build
    )
    # Set when this run executes a custom workflow stage (phase stays "build")
    workflow_stage_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("workflow_stages.id", ondelete="SET NULL"), nullable=True, index=True
    )
    attempt_number: Mapped[int] = mapped_column(nullable=False, default=1)
    outcome: Mapped[TaskRunOutcome | None] = mapped_column(
        SAEnum(TaskRunOutcome, native_enum=False, length=50), nullable=True
    )
    blocking_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    approval_required: Mapped[bool] = mapped_column(nullable=False, default=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    task: Mapped["Task"] = relationship("Task", back_populates="runs")
    logs: Mapped[list["TaskRunLog"]] = relationship(
        "TaskRunLog", back_populates="run", cascade="all, delete-orphan",
        order_by="TaskRunLog.created_at"
    )
    artifacts: Mapped[list["EvidenceArtifact"]] = relationship(
        "EvidenceArtifact", back_populates="run", cascade="all, delete-orphan"
    )


class TaskRunLog(BaseModel):
    __tablename__ = "task_run_logs"

    task_run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("task_runs.id", ondelete="CASCADE"), nullable=False
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False, default="info")

    run: Mapped["TaskRun"] = relationship("TaskRun", back_populates="logs")


class TaskComment(BaseModel):
    __tablename__ = "task_comments"

    task_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    task_run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("task_runs.id", ondelete="SET NULL"), nullable=True
    )
    author_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    author_type: Mapped[CommentAuthorType] = mapped_column(
        SAEnum(CommentAuthorType, native_enum=False, length=50), nullable=False, default=CommentAuthorType.human
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    action_flag: Mapped[str | None] = mapped_column(String(100), nullable=True)

    task: Mapped["Task"] = relationship("Task", back_populates="comments")


class EvidenceArtifact(BaseModel):
    __tablename__ = "evidence_artifacts"

    task_run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("task_runs.id", ondelete="CASCADE"), nullable=False
    )
    artifact_type: Mapped[ArtifactType] = mapped_column(
        SAEnum(ArtifactType, native_enum=False, length=50), nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)

    run: Mapped["TaskRun"] = relationship("TaskRun", back_populates="artifacts")
