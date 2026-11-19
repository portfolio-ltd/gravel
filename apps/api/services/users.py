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
    """Deactivate the account and everything that can act as it: sessions, API tokens, local runners."""
    from datetime import datetime, timezone

    from sqlalchemy import select, update

    from models.api_token import ApiToken
    from models.engineer import EngineerRuntime
    from models.refresh_token import RefreshToken
    from services import runners

    user.is_active = False
    db.add(user)
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id).values(revoked=True))
    await db.execute(update(ApiToken).where(ApiToken.user_id == user.id, ApiToken.revoked_at.is_(None))
                     .values(revoked_at=datetime.now(timezone.utc)))
    for runtime in (await db.execute(select(EngineerRuntime).where(
            EngineerRuntime.owner_user_id == user.id, EngineerRuntime.is_active.is_(True)))).scalars():
        await runners.stop(db, runtime)
        runtime.runtime_token_hash = None


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
