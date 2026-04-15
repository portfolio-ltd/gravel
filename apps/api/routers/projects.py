from fastapi import APIRouter, HTTPException
from dependencies import CurrentUser, DB
from schemas.project import ProjectCreate, ProjectUpdate, ProjectOut, ProjectDetail
from services.projects import (
    list_projects, get_project, create_project,
    update_project, delete_project, advance_project,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_all(current_user: CurrentUser, db: DB):
    return await list_projects(db)


@router.post("", response_model=ProjectOut, status_code=201)
async def create(body: ProjectCreate, current_user: CurrentUser, db: DB):
    return await create_project(db, body, current_user)


@router.get("/{project_id}", response_model=ProjectDetail)
async def detail(project_id: str, current_user: CurrentUser, db: DB):
    p = await get_project(db, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.patch("/{project_id}", response_model=ProjectOut)
async def update(project_id: str, body: ProjectUpdate, current_user: CurrentUser, db: DB):
    p = await get_project(db, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return await update_project(db, p, body)


@router.delete("/{project_id}", status_code=204)
async def delete(project_id: str, current_user: CurrentUser, db: DB):
    p = await get_project(db, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    await delete_project(db, p)


@router.post("/{project_id}/advance", response_model=ProjectOut)
async def advance(project_id: str, current_user: CurrentUser, db: DB):
    from services import ws_manager
    p = await get_project(db, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    p = await advance_project(db, p, current_user)
    await db.commit()
    await ws_manager.broadcast(project_id, {
        "type": "project.status_changed",
        "status": p.status.value,
    })
    return p
