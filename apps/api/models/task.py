import enum

from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import BaseModel


class TaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    qa = "qa"
    done = "done"


class TaskPriority(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"


class TaskType(str, enum.Enum):
    feature = "feature"
    bug = "bug"
    design = "design"
    infra = "infra"


class Task(BaseModel):
    __tablename__ = "tasks"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[TaskStatus] = mapped_column(SAEnum(TaskStatus, native_enum=False, length=50), nullable=False, default=TaskStatus.pending)
    priority: Mapped[TaskPriority] = mapped_column(SAEnum(TaskPriority, native_enum=False, length=50), nullable=False, default=TaskPriority.medium)
    type: Mapped[TaskType] = mapped_column(SAEnum(TaskType, native_enum=False, length=50), nullable=False, default=TaskType.feature)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    branch_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pr_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    deploy_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    workflow_stage_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("workflow_stages.id", ondelete="SET NULL"), nullable=True, index=True
    )
    rework_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # [{"id": str, "text": str, "done": bool, "source": "human" | "ai"}]
    acceptance_criteria: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Imported from an external tracker, e.g. ("github", "owner/repo#123")
    external_source: Mapped[str | None] = mapped_column(String(30), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    external_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Task graph: ids of tasks in the same project that must be done before
    # this one is queued (services/task_graph.py)
    depends_on: Mapped[list | None] = mapped_column(JSON, nullable=True)

    project = relationship("Project", back_populates="tasks")
    tags = relationship("Tag", secondary="task_tags", lazy="selectin")
    runs = relationship("TaskRun", back_populates="task", cascade="all, delete-orphan",
                        order_by="TaskRun.started_at.desc()")
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan",
                            order_by="TaskComment.created_at")
