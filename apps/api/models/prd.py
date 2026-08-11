import enum

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import BaseModel
from models.tag import prd_tags
from models.task_run import CommentAuthorType


class PRDStatus(str, enum.Enum):
    draft = "draft"
    in_review = "in_review"
    approved = "approved"
    converted = "converted"
    archived = "archived"


class PRD(BaseModel):
    __tablename__ = "prds"

    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[PRDStatus] = mapped_column(SAEnum(PRDStatus, native_enum=False, length=50), nullable=False, default=PRDStatus.draft)
    created_by_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    comments: Mapped[list["PRDComment"]] = relationship(
        "PRDComment", back_populates="prd", cascade="all, delete-orphan",
        order_by="PRDComment.created_at",
    )
    tags = relationship("Tag", secondary=prd_tags, lazy="selectin")


class PRDComment(BaseModel):
    __tablename__ = "prd_comments"

    prd_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("prds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    author_type: Mapped[CommentAuthorType] = mapped_column(
        SAEnum(CommentAuthorType, native_enum=False, length=50), nullable=False, default=CommentAuthorType.human
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    prd: Mapped["PRD"] = relationship("PRD", back_populates="comments")
