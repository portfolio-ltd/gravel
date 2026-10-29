"""External links attached to projects, tasks, PRDs and knowledge entries."""
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from db.base import new_uuid
from dependencies import DB, CurrentOrg, CurrentUser
from models.link import ExternalLink, LinkEntityType
from models.prd import PRD
from models.project import Project
from models.sdlc import KnowledgeEntry
from models.task import Task
from schemas.link import LinkIn, LinkOut, LinkUpdate

router = APIRouter(prefix="/links", tags=["links"])


async def _check_owner(db, entity_type: LinkEntityType, entity_id: str, org_id: str) -> None:
    """The linked entity must exist in this organization (existence-hiding 404 otherwise)."""
    if entity_type == LinkEntityType.project:
        row = await db.get(Project, entity_id)
        ok = row is not None and row.organization_id == org_id
    elif entity_type == LinkEntityType.task:
        row = (await db.execute(select(Task).join(Project, Project.id == Task.project_id).where(
            Task.id == entity_id, Project.organization_id == org_id))).scalar_one_or_none()
        ok = row is not None
    elif entity_type == LinkEntityType.prd:
        row = await db.get(PRD, entity_id)
        ok = row is not None and row.organization_id == org_id
    else:
        row = await db.get(KnowledgeEntry, entity_id)
        ok = row is not None and row.organization_id == org_id
    if not ok:
        raise HTTPException(404, f"{entity_type.value.title()} not found")


def _title_for(url: str, title: str) -> str:
    if title.strip():
        return title.strip()
    host = url.split("//", 1)[-1].split("/", 1)[0]
    return host[:300] or url[:300]


@router.get("", response_model=list[LinkOut])
async def list_links(current_user: CurrentUser, org: CurrentOrg, db: DB,
                     entity_type: LinkEntityType | None = None, entity_id: str | None = None):
    q = select(ExternalLink).where(ExternalLink.organization_id == org.id)
    if entity_type:
        q = q.where(ExternalLink.entity_type == entity_type)
    if entity_id:
        q = q.where(ExternalLink.entity_id == entity_id)
    return list((await db.execute(q.order_by(ExternalLink.kind, ExternalLink.title))).scalars())


@router.post("", response_model=LinkOut, status_code=201)
async def create_link(body: LinkIn, current_user: CurrentUser, org: CurrentOrg, db: DB):
    await _check_owner(db, body.entity_type, body.entity_id, org.id)
    link = ExternalLink(
        id=new_uuid(), organization_id=org.id, entity_type=body.entity_type, entity_id=body.entity_id,
        url=body.url.strip(), title=_title_for(body.url, body.title), kind=body.kind,
        description=body.description, created_by_id=current_user.id,
    )
    db.add(link)
    await db.flush()
    return link


async def _one(db, link_id: str, org) -> ExternalLink:
    link = await db.get(ExternalLink, link_id)
    if not link or link.organization_id != org.id:
        raise HTTPException(404, "Link not found")
    return link


@router.patch("/{link_id}", response_model=LinkOut)
async def update_link(link_id: str, body: LinkUpdate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    link = await _one(db, link_id, org)
    fields = body.model_dump(exclude_unset=True)
    for key, value in fields.items():
        if value is None and key != "description":
            continue
        setattr(link, key, value.strip() if isinstance(value, str) and key in ("url", "title") else value)
    if not link.title.strip():
        link.title = _title_for(link.url, "")
    await db.flush()
    return link


@router.delete("/{link_id}", status_code=204)
async def delete_link(link_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    link = await _one(db, link_id, org)
    await db.delete(link)
    await db.flush()
