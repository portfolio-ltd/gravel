from fastapi import APIRouter, HTTPException

from dependencies import DB, CurrentOrg, CurrentUser
from schemas.task import TaskCreate, TaskOut, TaskReorderItem, TaskUpdate
from services import ws_manager
from services.projects import get_project
from services.tasks import (
    create_task,
    delete_task,
    get_task,
    list_tasks,
    recalculate_progress,
    reorder_tasks,
    update_task,
)

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["tasks"])


async def _project_or_404(project_id: str, db, org_id: str | None = None):
    p = await get_project(db, project_id, organization_id=org_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.get("", response_model=list[TaskOut])
async def list_all(project_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    await _project_or_404(project_id, db, org.id)
    return await list_tasks(db, project_id)


@router.post("", response_model=TaskOut, status_code=201)
async def create(project_id: str, body: TaskCreate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    await _project_or_404(project_id, db, org.id)
    task = await create_task(db, project_id, body)
    await db.flush()
    await ws_manager.broadcast(project_id, {"type": "task.created", "task": {"id": task.id, "title": task.title}})
    return task


@router.patch("/{task_id}", response_model=TaskOut)
async def update(project_id: str, task_id: str, body: TaskUpdate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    p = await _project_or_404(project_id, db, org.id)
    task = await get_task(db, task_id, project_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if body.status is not None and p.workflow_id and body.status != task.status:
        raise HTTPException(400, "This project uses a workflow — task status is derived from its stage")
    task = await update_task(db, task, body)
    if body.status is not None:
        await db.flush()
        await db.refresh(p, ["tasks"])
        await recalculate_progress(db, p)
    await ws_manager.broadcast(project_id, {"type": "task.updated", "task": {"id": task.id, "status": task.status.value}})
    return task


@router.delete("/{task_id}", status_code=204)
async def delete(project_id: str, task_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    await _project_or_404(project_id, db, org.id)
    task = await get_task(db, task_id, project_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await delete_task(db, task)


@router.post("/reorder", status_code=204)
async def reorder(project_id: str, body: list[TaskReorderItem], current_user: CurrentUser, org: CurrentOrg, db: DB):
    await _project_or_404(project_id, db, org.id)
    await reorder_tasks(db, project_id, body)
