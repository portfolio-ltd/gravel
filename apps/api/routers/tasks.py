from fastapi import APIRouter, BackgroundTasks, HTTPException

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


@router.post("/{task_id}/start", status_code=202)
async def start(project_id: str, task_id: str, background_tasks: BackgroundTasks,
                current_user: CurrentUser, org: CurrentOrg, db: DB):
    """Queue one pending task on its first stage, without starting the rest of the project.

    A project still in setup moves to running (as `POST /agent/run` does). With
    no engineer runtime online the in-process executor drains the queue.
    """
    from models.project import ProjectStatus
    from models.task import TaskStatus
    from services import agent as agent_svc
    from services import orchestrator, task_graph

    p = await _project_or_404(project_id, db, org.id)
    task = await get_task(db, task_id, project_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != TaskStatus.pending or task.workflow_stage_id:
        raise HTTPException(status_code=409, detail="This task has already started")
    waiting = task_graph.waiting_on(task, await task_graph.project_tasks(db, project_id))
    if waiting:
        raise HTTPException(status_code=409, detail=f"Waiting on {len(waiting)} unfinished task(s): "
                            + ", ".join(t.title for t in waiting[:3]))
    if not await task_graph.queue_task(db, task, p):
        raise HTTPException(status_code=409, detail="This task already has an open run")
    if p.status == ProjectStatus.setup:
        p.status = ProjectStatus.running
    runtimes = await orchestrator.has_active_runtimes(db, p.organization_id, p.owner_id)
    await db.commit()
    await ws_manager.broadcast(project_id, {"type": "task.updated", "task": {"id": task.id, "status": task.status.value}})
    if not runtimes:
        # An existing drain for this project picks the new run up on its next loop
        background_tasks.add_task(agent_svc.drain_project, project_id, current_user.id)
    return {"detail": "Task queued", "task_id": task.id, "executor": "runtime" if runtimes else "in_process"}
