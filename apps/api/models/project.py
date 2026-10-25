import enum

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from config import settings
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
        SAEnum(ProjectStatus, native_enum=False, length=50), nullable=False, default=ProjectStatus.setup
    )
    prd_file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # owner_id is "created by"; organization_id scopes access
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    default_model: Mapped[str] = mapped_column(String(100), default=settings.DEFAULT_MODEL, nullable=False)
    repo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    default_branch: Mapped[str] = mapped_column(String(100), default="main", nullable=False)
    workflow_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("workflows.id", ondelete="SET NULL"), nullable=True
    )
    # GitHub Issues sync: "owner/repo" to import from, and whether stage
    # results are posted back to the issue as comments
    issues_repo: Mapped[str | None] = mapped_column(String(300), nullable=True)
    post_issue_comments: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

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
