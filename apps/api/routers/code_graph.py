from fastapi import APIRouter, BackgroundTasks, HTTPException

from dependencies import DB, CurrentOrg, CurrentUser
from schemas.code_graph import CodeGraphOut
from services import code_graph
from services.projects import get_project

router = APIRouter(prefix="/projects/{project_id}/code-graph", tags=["code-graph"])


@router.get("", response_model=CodeGraphOut | None)
async def get_code_graph(project_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    """The project's code graph, or null when it has never been built."""
    if not await get_project(db, project_id, organization_id=org.id):
        raise HTTPException(404, "Project not found")
    return await code_graph.get_for_project(db, project_id)


@router.post("/build", response_model=CodeGraphOut, status_code=202)
async def build_code_graph(project_id: str, background_tasks: BackgroundTasks,
                           current_user: CurrentUser, org: CurrentOrg, db: DB):
    """(Re)map the project's repository in the background; watch status or the WS event."""
    p = await get_project(db, project_id, organization_id=org.id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not p.repo_url:
        raise HTTPException(400, "Set the project's repository URL first")
    try:
        from services.github import normalize_repo
        normalize_repo(p.repo_url)
    except ValueError:
        raise HTTPException(400, "Code graphs need a GitHub repository URL")
    row = await code_graph.mark_pending(db, p)
    await db.commit()
    background_tasks.add_task(code_graph.build, project_id, current_user.id)
    return row
