import enum
from sqlalchemy import String, Text, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from db.base import BaseModel


class ChangelogType(str, enum.Enum):
    added = "added"
    changed = "changed"
    fixed = "fixed"
    infra = "infra"


class ChangelogEntry(BaseModel):
    __tablename__ = "changelog_entries"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[ChangelogType] = mapped_column(SAEnum(ChangelogType), nullable=False, default=ChangelogType.added)
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    author_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)

    project = relationship("Project", back_populates="changelog")
    author = relationship("User")
