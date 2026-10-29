"""External links: where the rest of a task's or project's world lives.

Design files in Figma, a ticket in another tracker, a dashboard, an RFC in a
wiki, a runbook in Notion — anything with a URL that an engineer (human or
AI) should know about. Links hang off a project, task, PRD or knowledge
entry, appear on the knowledge map, and are handed to runs as LINKS.md.
"""
import enum

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db.base import BaseModel


class LinkEntityType(str, enum.Enum):
    project = "project"
    task = "task"
    prd = "prd"
    knowledge = "knowledge"


class LinkKind(str, enum.Enum):
    docs = "docs"            # documentation, wiki page, RFC
    design = "design"        # Figma, mockups
    ticket = "ticket"        # issue in another tracker
    dashboard = "dashboard"  # metrics, monitoring
    repo = "repo"            # repository, PR, commit
    spec = "spec"            # external specification, API reference
    other = "other"


class ExternalLink(BaseModel):
    __tablename__ = "external_links"

    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entity_type: Mapped[LinkEntityType] = mapped_column(
        SAEnum(LinkEntityType, native_enum=False, length=20), nullable=False
    )
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    kind: Mapped[LinkKind] = mapped_column(SAEnum(LinkKind, native_enum=False, length=20), nullable=False,
                                           default=LinkKind.other)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
