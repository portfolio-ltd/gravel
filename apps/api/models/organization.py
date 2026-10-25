import enum

from sqlalchemy import JSON, ForeignKey, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import BaseModel


class OrgRole(str, enum.Enum):
    """Per-organization role — separate from the global UserRole."""
    admin = "admin"
    member = "member"


class Organization(BaseModel):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    # Default appearance for members who haven't customized theirs (accent, logo text...)
    appearance: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    members: Mapped[list["OrganizationMember"]] = relationship(
        "OrganizationMember", back_populates="organization", cascade="all, delete-orphan"
    )


class OrganizationMember(BaseModel):
    __tablename__ = "organization_members"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_org_member"),)

    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[OrgRole] = mapped_column(SAEnum(OrgRole, native_enum=False, length=50), nullable=False, default=OrgRole.member)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="members")
    user = relationship("User")
