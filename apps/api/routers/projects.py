from fastapi import APIRouter, BackgroundTasks, HTTPException

from config import settings
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


async def _map_repo(db, project, user_id: str, background_tasks: BackgroundTasks) -> None:
    """Build the code graph for a GitHub repo in the background (services/code_graph.py)."""
    from services import code_graph
    from services.github import normalize_repo
    if not settings.CODE_GRAPH_AUTO_BUILD or not project.repo_url:
        return
    try:
        normalize_repo(project.repo_url)
    except ValueError:
        return  # not GitHub — nothing to map
    await code_graph.mark_pending(db, project)
    await db.commit()
    background_tasks.add_task(code_graph.build, project.id, user_id)


@router.post("", response_model=ProjectOut, status_code=201)
async def create(body: ProjectCreate, background_tasks: BackgroundTasks,
                 current_user: CurrentUser, org: CurrentOrg, db: DB):
    project = await create_project(db, body, current_user, organization_id=org.id)
    await _map_repo(db, project, current_user.id, background_tasks)
    return project


@router.get("/{project_id}", response_model=ProjectDetail)
async def detail(project_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    p = await get_project(db, project_id, organization_id=org.id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.patch("/{project_id}", response_model=ProjectOut)
async def update(project_id: str, body: ProjectUpdate, background_tasks: BackgroundTasks,
                 current_user: CurrentUser, org: CurrentOrg, db: DB):
    p = await get_project(db, project_id, organization_id=org.id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    old_repo = p.repo_url
    p = await update_project(db, p, body)
    if p.repo_url != old_repo:
        await _map_repo(db, p, current_user.id, background_tasks)
    return p


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
