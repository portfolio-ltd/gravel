import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import BaseModel

if TYPE_CHECKING:
    from models.user import User  # noqa: F401


class EngineerStatus(str, enum.Enum):
    idle = "idle"
    running = "running"
    stopped = "stopped"
    error = "error"


class Engineer(BaseModel):
    __tablename__ = "engineers"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    template: Mapped[str] = mapped_column(String(100), nullable=False, default="fullstack")
    skills_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[EngineerStatus] = mapped_column(
        SAEnum(EngineerStatus, native_enum=False, length=50), nullable=False, default=EngineerStatus.idle
    )
    owner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    model_provider: Mapped[str] = mapped_column(String(50), nullable=False, default="anthropic")
    model_name: Mapped[str] = mapped_column(String(100), nullable=False, default="claude-sonnet-4-6")

    owner: Mapped["User"] = relationship("User", back_populates="engineers")
    runtimes: Mapped[list["EngineerRuntime"]] = relationship(
        "EngineerRuntime", back_populates="engineer", cascade="all, delete-orphan",
        order_by="EngineerRuntime.started_at.desc()"
    )


class EngineerRuntime(BaseModel):
    __tablename__ = "engineer_runtimes"

    engineer_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("engineers.id", ondelete="CASCADE"), nullable=False
    )
    container_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    container_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    runtime_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    current_task_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)

    engineer: Mapped["Engineer"] = relationship("Engineer", back_populates="runtimes")
