from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db.base import BaseModel


class TokenUsage(BaseModel):
    """One LLM call's usage. All FK-ish columns are nullable, plain String(36)
    (no constraints) so ledger rows outlive the entities they reference.
    cost_usd is display-grade (Float) — estimated from services/token_usage.py's
    price map at record time."""
    __tablename__ = "token_usages"

    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    task_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    task_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    prd_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    tokens_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
