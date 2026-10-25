from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from db.base import new_uuid
from dependencies import DB, AdminOrg, CurrentOrg, CurrentUser
from models.organization import Organization
from models.tag import Tag
from models.task import Task
from schemas.tag import TagCreate, TagIdsIn, TagOut, TagUpdate
from schemas.task import TaskOut

router = APIRouter(tags=["tags"])


async def _org_tag_or_404(db, tag_id: str, org: Organization) -> Tag:
    tag = await db.get(Tag, tag_id)
    if not tag or tag.organization_id != org.id:
        raise HTTPException(404, "Tag not found")
    return tag


@router.get("/tags", response_model=list[TagOut])
async def list_tags(current_user: CurrentUser, org: CurrentOrg, db: DB):
    rows = await db.scalars(
        select(Tag).where(Tag.organization_id == org.id).order_by(Tag.name)
    )
    return list(rows.all())


@router.post("/tags", response_model=TagOut, status_code=201)
async def create_tag(body: TagCreate, current_user: CurrentUser, org: AdminOrg, db: DB):
    dup = (await db.execute(
        select(Tag.id).where(Tag.organization_id == org.id, Tag.name == body.name)
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(409, f"Tag '{body.name}' already exists in this organization")
    tag = Tag(id=new_uuid(), organization_id=org.id, name=body.name, color=body.color)
    db.add(tag)
    await db.flush()
    return tag


@router.patch("/tags/{tag_id}", response_model=TagOut)
async def update_tag(tag_id: str, body: TagUpdate, current_user: CurrentUser, org: AdminOrg, db: DB):
    tag = await _org_tag_or_404(db, tag_id, org)
    if body.name is not None and body.name != tag.name:
        dup = (await db.execute(
            select(Tag.id).where(Tag.organization_id == org.id, Tag.name == body.name, Tag.id != tag_id)
        )).scalar_one_or_none()
        if dup:
            raise HTTPException(409, f"Tag '{body.name}' already exists in this organization")
        tag.name = body.name
    if body.color is not None:
        tag.color = body.color
    await db.flush()
    return tag


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(tag_id: str, current_user: CurrentUser, org: AdminOrg, db: DB):
    tag = await _org_tag_or_404(db, tag_id, org)
    await db.delete(tag)  # join rows cascade at the DB level
    await db.flush()


@router.patch("/tasks/{task_id}/tags", response_model=TaskOut)
async def set_task_tags(task_id: str, body: TagIdsIn, current_user: CurrentUser, org: CurrentOrg, db: DB):
    """Replace-set semantics: the task's tags become exactly body.tag_ids."""
    from routers.task_runs import _task_in_org_or_404
    task: Task = await _task_in_org_or_404(db, task_id, org)

    tags = list((await db.scalars(
        select(Tag).where(Tag.id.in_(body.tag_ids), Tag.organization_id == org.id)
    )).all()) if body.tag_ids else []
    if len(tags) != len(set(body.tag_ids)):
        raise HTTPException(400, "One or more tag ids do not exist in this organization")

    task.tags = tags
    await db.flush()
    await db.refresh(task)
    return task
