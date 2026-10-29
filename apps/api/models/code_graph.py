import enum
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from db.base import BaseModel


class CodeGraphStatus(str, enum.Enum):
    pending = "pending"
    building = "building"
    ready = "ready"
    failed = "failed"


class CodeGraph(BaseModel):
    """A map of a project's repository: modules, their import edges, stack and commands.

    One per project; rebuilding replaces it. `graph` holds the structure
    (services/code_graph.py analyze()), `summary_markdown` the architecture
    overview an LLM wrote from it, when a key was available.
    """
    __tablename__ = "code_graphs"

    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    status: Mapped[CodeGraphStatus] = mapped_column(
        SAEnum(CodeGraphStatus, native_enum=False, length=20), nullable=False, default=CodeGraphStatus.pending
    )
    repo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    graph: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    summary_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    built_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
