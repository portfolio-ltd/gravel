from fastapi import APIRouter, HTTPException

from dependencies import DB, CurrentOrg, CurrentUser
from schemas.project import ProjectCreate, ProjectDetail, ProjectOut, ProjectUpdate
from services.projects import (
    advance_project,
    create_project,
    delete_project,
    get_project,
    list_projects,
    update_project,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_all(current_user: CurrentUser, org: CurrentOrg, db: DB):
    return await list_projects(db, organization_id=org.id)


@router.post("", response_model=ProjectOut, status_code=201)
async def create(body: ProjectCreate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    return await create_project(db, body, current_user, organization_id=org.id)


@router.get("/{project_id}", response_model=ProjectDetail)
async def detail(project_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    p = await get_project(db, project_id, organization_id=org.id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.patch("/{project_id}", response_model=ProjectOut)
async def update(project_id: str, body: ProjectUpdate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    p = await get_project(db, project_id, organization_id=org.id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return await update_project(db, p, body)


@router.delete("/{project_id}", status_code=204)
async def delete(project_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    p = await get_project(db, project_id, organization_id=org.id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    await delete_project(db, p)


@router.get("/{project_id}/token-summary")
async def project_token_summary(project_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    p = await get_project(db, project_id, organization_id=org.id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    from services.token_usage import summary_for_project
    return await summary_for_project(db, project_id)


@router.post("/{project_id}/advance", response_model=ProjectOut)
async def advance(project_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    from services import ws_manager
    p = await get_project(db, project_id, organization_id=org.id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    p = await advance_project(db, p, current_user)
    await db.commit()
    await ws_manager.broadcast(project_id, {
        "type": "project.status_changed",
        "status": p.status.value,
    })
    return p
