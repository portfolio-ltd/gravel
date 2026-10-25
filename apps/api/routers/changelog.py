from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from dependencies import DB, CurrentOrg, CurrentUser
from models.changelog import ChangelogEntry
from schemas.changelog import ChangelogCreate, ChangelogOut, PaginatedChangelog
from services.projects import get_project

router = APIRouter(prefix="/projects/{project_id}/changelog", tags=["changelog"])


@router.get("", response_model=PaginatedChangelog)
async def list_changelog(
    project_id: str,
    current_user: CurrentUser,
    org: CurrentOrg,
    db: DB,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    p = await get_project(db, project_id, organization_id=org.id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    offset = (page - 1) * page_size
    count_result = await db.execute(
        select(func.count()).where(ChangelogEntry.project_id == project_id)
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(ChangelogEntry)
        .where(ChangelogEntry.project_id == project_id)
        .order_by(ChangelogEntry.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    items = list(result.scalars().all())
    return PaginatedChangelog(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=ChangelogOut, status_code=201)
async def add_entry(project_id: str, body: ChangelogCreate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    """Internal endpoint — used by agent service and admin users."""
    p = await get_project(db, project_id, organization_id=org.id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    entry = ChangelogEntry(project_id=project_id, **body.model_dump())
    db.add(entry)
    await db.flush()
    return entry
