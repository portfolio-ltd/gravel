from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db.base import BaseModel


class ApiToken(BaseModel):
    """A personal token for non-browser clients (the CLI, editor extensions).

    Acts as its user, like a session token; only the SHA-256 hash is stored.
    """
    __tablename__ = "api_tokens"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    prefix: Mapped[str] = mapped_column(String(16), nullable=False)  # shown in lists: "grv_ab12cd34"
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DeviceAuthorization(BaseModel):
    """A pending device login: the client holds the device code, the user approves the user code."""
    __tablename__ = "device_authorizations"

    device_code_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    user_code: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    client_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # pending → approved | denied → consumed (token handed out)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LlmJob(BaseModel):
    """A server-side model call handed to the user's own local runner (keyless projects).

    services/runner_jobs.py creates it and waits; the runner claims it, runs the
    prompt through the AI CLI it is signed in to, and posts the text back.
    """
    __tablename__ = "llm_jobs"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # pending → claimed → done | failed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    system: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    json_schema: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    max_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=4000)
    runtime_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    result_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    tokens_in: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column(Integer, nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
