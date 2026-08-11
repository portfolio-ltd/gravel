from fastapi import APIRouter, HTTPException
from sqlalchemy import select

import services.prds as prd_service
from db.base import new_uuid
from dependencies import DB, CurrentOrg, CurrentUser
from models.organization import OrgRole
from models.prd import PRD, PRDComment, PRDStatus
from models.tag import Tag
from models.task_run import CommentAuthorType
from schemas.prd import (
    PRDChatRequest,
    PRDChatResponse,
    PRDCommentCreate,
    PRDCommentOut,
    PRDConvertOut,
    PRDConvertRequest,
    PRDCreate,
    PRDListOut,
    PRDOut,
    PRDSplitOut,
    PRDUpdate,
)
from schemas.tag import TagIdsIn, TagOut

router = APIRouter(prefix="/prds", tags=["prds"])


async def _prd_or_404(db, prd_id: str, org) -> PRD:
    prd = await prd_service.get_prd(db, prd_id, org.id)
    if not prd:
        raise HTTPException(404, "PRD not found")
    return prd


def _list_out(prd: PRD, comment_count: int) -> PRDListOut:
    out = PRDListOut.model_validate(prd)
    out.comment_count = comment_count
    return out


@router.get("", response_model=list[PRDListOut])
async def list_prds(current_user: CurrentUser, org: CurrentOrg, db: DB, status: PRDStatus | None = None):
    rows = await prd_service.list_prds(db, org.id, status)
    return [_list_out(prd, count) for prd, count in rows]


@router.post("", response_model=PRDOut, status_code=201)
async def create_prd(body: PRDCreate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    prd = PRD(
        id=new_uuid(),
        organization_id=org.id,
        title=body.title,
        summary=body.summary,
        body_markdown=body.body_markdown,
        created_by_user_id=current_user.id,
    )
    db.add(prd)
    await db.flush()
    return await _prd_or_404(db, prd.id, org)


@router.get("/{prd_id}", response_model=PRDOut)
async def get_prd(prd_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    return await _prd_or_404(db, prd_id, org)


@router.patch("/{prd_id}", response_model=PRDOut)
async def update_prd(prd_id: str, body: PRDUpdate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    prd = await _prd_or_404(db, prd_id, org)
    for field in ("title", "summary", "body_markdown", "status"):
        value = getattr(body, field)
        if value is not None:
            setattr(prd, field, value)
    await db.flush()
    return await _prd_or_404(db, prd_id, org)


@router.delete("/{prd_id}", status_code=204)
async def delete_prd(prd_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    prd = await _prd_or_404(db, prd_id, org)
    if prd.created_by_user_id != current_user.id:
        from services.organizations import get_membership
        membership = await get_membership(db, org.id, current_user.id)
        if not membership or membership.role != OrgRole.admin:
            raise HTTPException(403, "Only the creator or an org admin can delete a PRD")
    await db.delete(prd)
    await db.flush()


# ── Comments (plain thread ops; chat writes its own pairs) ────────────────────

@router.get("/{prd_id}/comments", response_model=list[PRDCommentOut])
async def list_comments(prd_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    prd = await _prd_or_404(db, prd_id, org)
    return prd.comments


@router.post("/{prd_id}/comments", response_model=PRDCommentOut, status_code=201)
async def add_comment(prd_id: str, body: PRDCommentCreate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    prd = await _prd_or_404(db, prd_id, org)
    return await prd_service.add_comment(db, prd, body.body, CommentAuthorType.human, current_user.id)


@router.delete("/{prd_id}/comments/{comment_id}", status_code=204)
async def delete_comment(prd_id: str, comment_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    await _prd_or_404(db, prd_id, org)
    comment = await db.get(PRDComment, comment_id)
    if not comment or comment.prd_id != prd_id:
        raise HTTPException(404, "Comment not found")
    await db.delete(comment)
    await db.flush()


# ── LLM chat / split / convert ────────────────────────────────────────────────

@router.post("/{prd_id}/chat", response_model=PRDChatResponse)
async def chat(prd_id: str, body: PRDChatRequest, current_user: CurrentUser, org: CurrentOrg, db: DB):
    prd = await _prd_or_404(db, prd_id, org)
    return await prd_service.chat(db, prd, current_user, body.message, body.model)


@router.post("/{prd_id}/split", response_model=PRDSplitOut)
async def split(prd_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    prd = await _prd_or_404(db, prd_id, org)
    titles = await prd_service.split(db, prd, current_user, None)
    return PRDSplitOut(task_titles=titles)


@router.post("/{prd_id}/convert", response_model=PRDConvertOut)
async def convert(prd_id: str, body: PRDConvertRequest, current_user: CurrentUser, org: CurrentOrg, db: DB):
    prd = await _prd_or_404(db, prd_id, org)
    created = await prd_service.convert(db, prd, org.id, body.project_ids, body.task_titles)
    return PRDConvertOut(created_count=created)


# ── Tags ──────────────────────────────────────────────────────────────────────

@router.patch("/{prd_id}/tags", response_model=list[TagOut])
async def set_tags(prd_id: str, body: TagIdsIn, current_user: CurrentUser, org: CurrentOrg, db: DB):
    prd = await _prd_or_404(db, prd_id, org)
    tags = list((await db.scalars(
        select(Tag).where(Tag.id.in_(body.tag_ids), Tag.organization_id == org.id)
    )).all()) if body.tag_ids else []
    if len(tags) != len(set(body.tag_ids)):
        raise HTTPException(400, "One or more tag ids do not exist in this organization")
    prd.tags = tags
    await db.flush()
    return tags


# ── Token usage ───────────────────────────────────────────────────────────────

@router.get("/{prd_id}/token-summary")
async def token_summary(prd_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    await _prd_or_404(db, prd_id, org)
    from services.token_usage import summary_for_prd
    return await summary_for_prd(db, prd_id)
