"""Personal API tokens and device login for non-browser clients.

A token is `grv_` + 43 url-safe characters; only its SHA-256 is stored. Device
login follows the OAuth device-grant shape: the client gets a secret device
code and a short user code, the user approves the user code in the web app,
and the client's next poll receives a freshly minted token, once.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.api_token import ApiToken, DeviceAuthorization
from models.user import User

TOKEN_PREFIX = "grv_"
DEVICE_TTL = timedelta(minutes=10)
DEVICE_POLL_SECONDS = 5
_USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789"  # no vowels or look-alikes


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _aware(dt: datetime | None) -> datetime | None:
    # SQLite hands back naive datetimes; every timestamp here is UTC
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


async def mint(db: AsyncSession, user: User, name: str, expires_in_days: int | None = None) -> tuple[ApiToken, str]:
    """Create a token. Returns (row, plaintext) — the plaintext is never stored or shown again."""
    plaintext = TOKEN_PREFIX + secrets.token_urlsafe(32)
    row = ApiToken(
        user_id=user.id,
        name=(name or "API token").strip()[:200],
        prefix=plaintext[:12],
        token_hash=_hash(plaintext),
        expires_at=datetime.now(timezone.utc) + timedelta(days=expires_in_days) if expires_in_days else None,
    )
    db.add(row)
    await db.flush()
    return row, plaintext


async def user_for_token(db: AsyncSession, plaintext: str) -> User | None:
    row = (await db.execute(select(ApiToken).where(ApiToken.token_hash == _hash(plaintext)))).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if row is None or row.revoked_at is not None or (row.expires_at and _aware(row.expires_at) <= now):
        return None
    last = _aware(row.last_used_at)
    if last is None or now - last > timedelta(minutes=5):  # don't write on every request
        row.last_used_at = now
        await db.flush()
    user = await db.get(User, row.user_id)
    return user if user and user.is_active else None


async def list_tokens(db: AsyncSession, user: User) -> list[ApiToken]:
    rows = await db.execute(
        select(ApiToken).where(ApiToken.user_id == user.id, ApiToken.revoked_at.is_(None))
        .order_by(ApiToken.created_at.desc())
    )
    return list(rows.scalars())


async def revoke(db: AsyncSession, user: User, token_id: str) -> None:
    row = await db.get(ApiToken, token_id)
    if row is None or row.user_id != user.id or row.revoked_at is not None:
        raise HTTPException(404, "Token not found")
    row.revoked_at = datetime.now(timezone.utc)
    await db.flush()


# ── Device login ──────────────────────────────────────────────────────────────

def _user_code() -> str:
    raw = "".join(secrets.choice(_USER_CODE_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


def normalize_user_code(code: str) -> str:
    raw = "".join(ch for ch in (code or "").upper() if ch.isalnum())
    return f"{raw[:4]}-{raw[4:8]}" if len(raw) == 8 else raw


async def start_device(db: AsyncSession, client_name: str) -> tuple[DeviceAuthorization, str]:
    device_code = secrets.token_urlsafe(32)
    row = DeviceAuthorization(
        device_code_hash=_hash(device_code),
        user_code=_user_code(),
        client_name=(client_name or "Gravel client").strip()[:100],
        status="pending",
        expires_at=datetime.now(timezone.utc) + DEVICE_TTL,
    )
    db.add(row)
    await db.flush()
    return row, device_code


async def find_by_user_code(db: AsyncSession, user_code: str) -> DeviceAuthorization:
    row = (await db.execute(
        select(DeviceAuthorization).where(DeviceAuthorization.user_code == normalize_user_code(user_code))
        .order_by(DeviceAuthorization.created_at.desc())
    )).scalars().first()
    if row is None or _aware(row.expires_at) <= datetime.now(timezone.utc) or row.status not in ("pending", "approved", "denied"):
        raise HTTPException(404, "This code is unknown or has expired — start the login again")
    return row


async def decide(db: AsyncSession, user: User, user_code: str, approve: bool) -> DeviceAuthorization:
    row = await find_by_user_code(db, user_code)
    if row.status != "pending":
        raise HTTPException(409, f"This login was already {row.status}")
    row.status = "approved" if approve else "denied"
    row.user_id = user.id
    await db.flush()
    return row


async def poll_device(db: AsyncSession, device_code: str) -> dict:
    """The client's poll: pending | denied | expired, or approved with a new token (once)."""
    row = (await db.execute(
        select(DeviceAuthorization).where(DeviceAuthorization.device_code_hash == _hash(device_code))
    )).scalar_one_or_none()
    if row is None or row.status == "consumed" or _aware(row.expires_at) <= datetime.now(timezone.utc):
        return {"status": "expired"}
    if row.status != "approved":
        return {"status": row.status}
    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        return {"status": "denied"}
    _, token = await mint(db, user, f"{row.client_name} (device login)")
    row.status = "consumed"
    await db.flush()
    return {"status": "approved", "access_token": token, "token_type": "bearer"}
