import json
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.user import User, UserRole
from schemas.user import ApiKeysIn, ApiKeysMasked


async def list_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.created_at))
    return list(result.scalars().all())


async def get_user(db: AsyncSession, user_id: str) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def update_user(db: AsyncSession, user: User, name: str | None, role: UserRole | None) -> User:
    if name is not None:
        user.name = name
    if role is not None:
        user.role = role
    db.add(user)
    return user


async def deactivate_user(db: AsyncSession, user: User) -> None:
    user.is_active = False
    db.add(user)


def _mask(key: str | None) -> str | None:
    if not key:
        return None
    if len(key) <= 8:
        return "••••"
    return key[:7] + "••••" + key[-4:]


def save_api_keys(user: User, keys: ApiKeysIn) -> None:
    raw = {}
    if keys.openai:
        raw["openai"] = keys.openai
    if keys.anthropic:
        raw["anthropic"] = keys.anthropic
    if keys.groq:
        raw["groq"] = keys.groq
    blob = json.dumps(raw).encode()
    user.api_keys_encrypted = settings.fernet.encrypt(blob).decode()


def get_masked_keys(user: User) -> ApiKeysMasked:
    if not user.api_keys_encrypted:
        return ApiKeysMasked()
    try:
        raw = json.loads(settings.fernet.decrypt(user.api_keys_encrypted.encode()))
        return ApiKeysMasked(
            openai=_mask(raw.get("openai")),
            anthropic=_mask(raw.get("anthropic")),
            groq=_mask(raw.get("groq")),
        )
    except Exception:
        return ApiKeysMasked()


def get_plain_keys(user: User) -> dict:
    """Returns decrypted keys — used internally by agent service only, never logged."""
    if not user.api_keys_encrypted:
        return {}
    try:
        return json.loads(settings.fernet.decrypt(user.api_keys_encrypted.encode()))
    except Exception:
        return {}
