"""PRD documents: CRUD, real LLM chat with apply-able edits, convert-to-tasks."""
import json
import logging
import re

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import settings
from db.base import new_uuid
from models.prd import PRD, PRDComment, PRDStatus
from models.project import Project
from models.task import Task, TaskPriority, TaskType
from models.task_run import CommentAuthorType
from models.user import User
from schemas.prd import PRDChatResponse
from services.llm import call_llm, pick_provider
from services.token_usage import record_usage
from services.users import get_plain_keys

logger = logging.getLogger(__name__)

BODY_CAP = 24_000  # chars of PRD body given to the model
HISTORY_LIMIT = 20  # most recent comments used as chat history

CHAT_CONTRACT = (
    'Return ONLY a JSON object (no markdown fences, nothing else) shaped like:\n'
    '{"reply": "<your conversational answer>",\n'
    ' "updated_body": "<the complete revised PRD markdown, or null if you are not proposing edits>"}'
)


async def list_prds(db: AsyncSession, organization_id: str, status: PRDStatus | None = None) -> list[tuple[PRD, int]]:
    q = (
        select(PRD, func.count(PRDComment.id))
        .outerjoin(PRDComment, PRDComment.prd_id == PRD.id)
        .where(PRD.organization_id == organization_id)
        .group_by(PRD.id)
        .order_by(PRD.updated_at.desc())
    )
    if status:
        q = q.where(PRD.status == status)
    return list((await db.execute(q)).all())


async def get_prd(db: AsyncSession, prd_id: str, organization_id: str) -> PRD | None:
    return (await db.execute(
        select(PRD)
        .where(PRD.id == prd_id, PRD.organization_id == organization_id)
        .options(selectinload(PRD.comments))
        .execution_options(populate_existing=True)
    )).scalar_one_or_none()


async def add_comment(db: AsyncSession, prd: PRD, body: str,
                      author_type: CommentAuthorType, author_id: str | None = None) -> PRDComment:
    comment = PRDComment(
        id=new_uuid(), prd_id=prd.id, author_id=author_id,
        author_type=author_type, body=body,
    )
    db.add(comment)
    await db.flush()
    return comment


async def chat(db: AsyncSession, prd: PRD, user: User, message: str, model: str | None) -> PRDChatResponse:
    keys = get_plain_keys(user)
    model = model or settings.DEFAULT_MODEL
    provider = pick_provider(keys, model)
    if provider is None:
        raise HTTPException(400, "No LLM API key configured — add one in Settings → API Keys")

    # Persist the human message BEFORE the call: a failed LLM call loses nothing
    await add_comment(db, prd, message, CommentAuthorType.human, user.id)

    history = "\n\n".join(
        f"{'user' if c.author_type == CommentAuthorType.human else 'assistant'}: {c.body}"
        for c in prd.comments[-HISTORY_LIMIT:]
    )
    prompt = (
        "You are a product-requirements assistant. You are discussing and, when asked, "
        "editing the PRD below. When you propose edits, return the COMPLETE revised "
        "markdown body in updated_body — never a fragment.\n\n"
        f"# PRD: {prd.title}\n"
        + (f"Summary: {prd.summary}\n" if prd.summary else "")
        + f"\n## Current body\n{prd.body_markdown[:BODY_CAP]}\n"
        + f"\n## Conversation so far\n{history}\n"
        + f"\nuser: {message}\n\n{CHAT_CONTRACT}"
    )

    try:
        result = await call_llm(provider, model, keys, prompt, max_tokens=8000)
    except Exception as exc:
        logger.warning("PRD chat LLM call failed: %s", exc)
        raise HTTPException(502, f"LLM call failed: {exc}")

    reply, updated_body = _parse_chat_output(result.text)
    await add_comment(db, prd, reply, CommentAuthorType.ai)
    await record_usage(
        db, model=result.model, tokens_in=result.tokens_in, tokens_out=result.tokens_out,
        user_id=user.id, organization_id=prd.organization_id, prd_id=prd.id,
    )
    return PRDChatResponse(
        reply=reply, updated_body=updated_body,
        model=result.model, tokens_in=result.tokens_in, tokens_out=result.tokens_out,
    )


def _parse_chat_output(text: str) -> tuple[str, str | None]:
    """JSON contract with a plain-text fallback for misbehaving models."""
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            reply = data.get("reply")
            if isinstance(reply, str) and reply.strip():
                updated = data.get("updated_body")
                return reply, updated if isinstance(updated, str) and updated.strip() else None
        except json.JSONDecodeError:
            pass
    return text.strip(), None


async def split(db: AsyncSession, prd: PRD, user: User, model: str | None) -> list[str]:
    """AI proposal of task titles from the PRD body (nothing persisted)."""
    from services.parser import parse_prd_text
    keys = get_plain_keys(user)
    tasks, usage = await parse_prd_text(prd.body_markdown or prd.summary or prd.title,
                                        model or settings.DEFAULT_MODEL, keys)
    if usage:
        await record_usage(
            db, model=usage.model, tokens_in=usage.tokens_in, tokens_out=usage.tokens_out,
            user_id=user.id, organization_id=prd.organization_id, prd_id=prd.id,
        )
    return [t["title"] for t in tasks if t.get("title")]


async def convert(db: AsyncSession, prd: PRD, organization_id: str,
                  project_ids: list[str], task_titles: list[str]) -> int:
    if not project_ids or not task_titles:
        raise HTTPException(400, "Select at least one project and one task title")

    projects = list((await db.scalars(
        select(Project).where(Project.id.in_(project_ids), Project.organization_id == organization_id)
    )).all())
    if len(projects) != len(set(project_ids)):
        raise HTTPException(404, "One or more projects not found")

    description = f"From PRD: {prd.title}\n\n## Requirements\n{prd.body_markdown or prd.summary or ''}"
    created = 0
    for project in projects:
        max_pos = (await db.execute(
            select(func.coalesce(func.max(Task.position), -1)).where(Task.project_id == project.id)
        )).scalar_one()
        for i, title in enumerate(task_titles):
            db.add(Task(
                project_id=project.id,
                title=title[:300],
                description=description,
                priority=TaskPriority.medium,
                type=TaskType.feature,
                position=max_pos + 1 + i,
            ))
            created += 1

    prd.status = PRDStatus.converted
    await db.flush()
    return created
