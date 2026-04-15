import enum
from sqlalchemy import String, Integer, Enum as SAEnum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from db.base import BaseModel


class ProjectStatus(str, enum.Enum):
    setup = "setup"
    running = "running"
    qa = "qa"
    review = "review"
    done = "done"
    deployed = "deployed"


class Project(BaseModel):
    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[ProjectStatus] = mapped_column(
        SAEnum(ProjectStatus), nullable=False, default=ProjectStatus.setup
    )
    prd_file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    default_model: Mapped[str] = mapped_column(String(100), default="claude-sonnet-4-6", nullable=False)

    owner = relationship("User", back_populates="projects")
    design_files = relationship("ProjectDesignFile", back_populates="project", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan", order_by="Task.position")
    changelog = relationship(
        "ChangelogEntry", back_populates="project",
        cascade="all, delete-orphan",
        order_by="ChangelogEntry.created_at.desc()"
    )


class ProjectDesignFile(BaseModel):
    __tablename__ = "project_design_files"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)

    project = relationship("Project", back_populates="design_files")
