from fastapi import APIRouter, HTTPException
from dependencies import CurrentUser, DB
from schemas.task import TaskCreate, TaskUpdate, TaskOut, TaskReorderItem
from services.tasks import (
    list_tasks, get_task, create_task, update_task,
    delete_task, reorder_tasks, recalculate_progress,
)
from services.projects import get_project
from services import ws_manager

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["tasks"])


async def _project_or_404(project_id: str, db):
    p = await get_project(db, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.get("", response_model=list[TaskOut])
async def list_all(project_id: str, current_user: CurrentUser, db: DB):
    return await list_tasks(db, project_id)


@router.post("", response_model=TaskOut, status_code=201)
async def create(project_id: str, body: TaskCreate, current_user: CurrentUser, db: DB):
    p = await _project_or_404(project_id, db)
    task = await create_task(db, project_id, body)
    await db.flush()
    await ws_manager.broadcast(project_id, {"type": "task.created", "task": {"id": task.id, "title": task.title}})
    return task


@router.patch("/{task_id}", response_model=TaskOut)
async def update(project_id: str, task_id: str, body: TaskUpdate, current_user: CurrentUser, db: DB):
    p = await _project_or_404(project_id, db)
    task = await get_task(db, task_id, project_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task = await update_task(db, task, body)
    if body.status is not None:
        await db.flush()
        await db.refresh(p, ["tasks"])
        await recalculate_progress(db, p)
    await ws_manager.broadcast(project_id, {"type": "task.updated", "task": {"id": task.id, "status": task.status.value}})
    return task


@router.delete("/{task_id}", status_code=204)
async def delete(project_id: str, task_id: str, current_user: CurrentUser, db: DB):
    task = await get_task(db, task_id, project_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await delete_task(db, task)


@router.post("/reorder", status_code=204)
async def reorder(project_id: str, body: list[TaskReorderItem], current_user: CurrentUser, db: DB):
    await _project_or_404(project_id, db)
    await reorder_tasks(db, project_id, body)
