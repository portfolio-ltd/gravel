import enum
from sqlalchemy import String, Boolean, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from db.base import BaseModel


class UserRole(str, enum.Enum):
    admin = "admin"
    developer = "developer"
    qa = "qa"
    product = "product"
    devops = "devops"


class User(BaseModel):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), nullable=False, default=UserRole.developer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Fernet-encrypted JSON blob: {"openai": "sk-...", "anthropic": "sk-ant-...", "groq": "gsk_..."}
    api_keys_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
