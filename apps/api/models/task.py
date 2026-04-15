import enum
from sqlalchemy import String, Integer, Text, Enum as SAEnum, ForeignKey
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
    status: Mapped[TaskStatus] = mapped_column(SAEnum(TaskStatus), nullable=False, default=TaskStatus.pending)
    priority: Mapped[TaskPriority] = mapped_column(SAEnum(TaskPriority), nullable=False, default=TaskPriority.medium)
    type: Mapped[TaskType] = mapped_column(SAEnum(TaskType), nullable=False, default=TaskType.feature)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    project = relationship("Project", back_populates="tasks")
