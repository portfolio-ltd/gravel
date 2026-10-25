from datetime import datetime

from pydantic import BaseModel, EmailStr

from models.user import UserRole


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    is_active: bool
    email_verified_at: datetime | None = None
    preferences: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name: str | None = None
    role: UserRole | None = None


class PreferencesIn(BaseModel):
    preferences: dict


class ApiKeysIn(BaseModel):
    openai: str | None = None
    anthropic: str | None = None
    groq: str | None = None


class ApiKeysMasked(BaseModel):
    openai: str | None = None
    anthropic: str | None = None
    groq: str | None = None


class InviteUserRequest(BaseModel):
    name: str
    email: EmailStr
    role: UserRole = UserRole.developer
