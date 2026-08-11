"""Token usage ledger: record every LLM call, estimate cost, summarize."""
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.base import new_uuid
from models.task import Task
from models.token_usage import TokenUsage

# USD per 1M tokens: model → (input, output). Prefix-matched; unknown models
# cost 0. Edit freely — this is the single pricing edit point.
MODEL_PRICES: dict[str, tuple[float, float]] = {
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-sonnet": (3.00, 15.00),
    "claude-haiku": (1.00, 5.00),
    "claude-opus": (15.00, 75.00),
    "claude": (3.00, 15.00),
    "gpt-5": (1.25, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt": (2.50, 10.00),
    "llama": (0.59, 0.79),
}


def estimate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    for prefix, (price_in, price_out) in MODEL_PRICES.items():
        if model.startswith(prefix):
            return (tokens_in * price_in + tokens_out * price_out) / 1_000_000
    return 0.0


async def record_usage(
    db: AsyncSession,
    *,
    model: str,
    tokens_in: int | None,
    tokens_out: int | None,
    user_id: str | None = None,
    organization_id: str | None = None,
    task_id: str | None = None,
    task_run_id: str | None = None,
    prd_id: str | None = None,
) -> TokenUsage | None:
    tokens_in = tokens_in or 0
    tokens_out = tokens_out or 0
    if not tokens_in and not tokens_out:
        return None
    row = TokenUsage(
        id=new_uuid(),
        user_id=user_id,
        organization_id=organization_id,
        task_id=task_id,
        task_run_id=task_run_id,
        prd_id=prd_id,
        model=model,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost_usd=estimate_cost(model, tokens_in, tokens_out),
    )
    db.add(row)
    await db.flush()
    return row


@dataclass
class TokenSummary:
    tokens_in: int
    tokens_out: int
    cost_usd: float
    calls: int


_SUMS = (
    func.coalesce(func.sum(TokenUsage.tokens_in), 0),
    func.coalesce(func.sum(TokenUsage.tokens_out), 0),
    func.coalesce(func.sum(TokenUsage.cost_usd), 0.0),
    func.count(),
)


def _to_summary(row) -> TokenSummary:
    return TokenSummary(tokens_in=row[0], tokens_out=row[1], cost_usd=round(row[2], 4), calls=row[3])


async def summary_for_task(db: AsyncSession, task_id: str) -> TokenSummary:
    row = (await db.execute(select(*_SUMS).where(TokenUsage.task_id == task_id))).one()
    return _to_summary(row)


async def summary_for_project(db: AsyncSession, project_id: str) -> TokenSummary:
    task_ids = select(Task.id).where(Task.project_id == project_id).scalar_subquery()
    row = (await db.execute(select(*_SUMS).where(TokenUsage.task_id.in_(task_ids)))).one()
    return _to_summary(row)


async def summary_for_org(db: AsyncSession, organization_id: str) -> TokenSummary:
    row = (await db.execute(select(*_SUMS).where(TokenUsage.organization_id == organization_id))).one()
    return _to_summary(row)


async def summary_for_prd(db: AsyncSession, prd_id: str) -> TokenSummary:
    row = (await db.execute(select(*_SUMS).where(TokenUsage.prd_id == prd_id))).one()
    return _to_summary(row)
