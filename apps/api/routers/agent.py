import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from dependencies import CurrentUser, DB
from models.task import Task, TaskPriority, TaskType, TaskStatus
from services.projects import get_project
from services.parser import parse_prd
from services.users import get_plain_keys
from services import agent as agent_svc

router = APIRouter(prefix="/agent", tags=["agent"])


class ParseRequest(BaseModel):
    project_id: str
    model: str | None = None
    api_key: str | None = None  # optional override; normally read from user record


class ParseResponse(BaseModel):
    tasks: list[dict]


@router.post("/parse", response_model=ParseResponse)
async def parse_prd_endpoint(body: ParseRequest, current_user: CurrentUser, db: DB):
    p = await get_project(db, body.project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if not p.prd_file_path:
        raise HTTPException(status_code=400, detail="Upload a PRD file first.")

    keys = get_plain_keys(current_user)
    model = body.model or p.default_model

    raw_tasks = await parse_prd(p.prd_file_path, model, keys)

    # Persist extracted tasks (clear existing pending tasks first)
    from sqlalchemy import delete
    await db.execute(
        delete(Task).where(Task.project_id == body.project_id, Task.status == TaskStatus.pending)
    )
    for i, t in enumerate(raw_tasks):
        try:
            priority = TaskPriority(t.get("priority", "medium"))
        except ValueError:
            priority = TaskPriority.medium
        try:
            task_type = TaskType(t.get("type", "feature"))
        except ValueError:
            task_type = TaskType.feature

        task = Task(
            project_id=body.project_id,
            title=t.get("title", "Untitled")[:300],
            description=t.get("description", ""),
            priority=priority,
            type=task_type,
            position=i,
        )
        db.add(task)

    await db.flush()
    return ParseResponse(tasks=raw_tasks)


@router.post("/run/{project_id}", status_code=202)
async def run_agent(project_id: str, background_tasks: BackgroundTasks, current_user: CurrentUser, db: DB):
    p = await get_project(db, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if agent_svc.is_running(project_id):
        raise HTTPException(status_code=409, detail="Agent already running for this project.")

    # Advance project to running if still in setup
    from models.project import ProjectStatus
    if p.status == ProjectStatus.setup:
        p.status = ProjectStatus.running
        db.add(p)
        await db.commit()

    background_tasks.add_task(agent_svc.run_agent, project_id, current_user.id)
    return {"detail": "Agent started", "project_id": project_id}


@router.get("/status/{project_id}")
async def agent_status(project_id: str, current_user: CurrentUser, db: DB):
    p = await get_project(db, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    running = agent_svc.is_running(project_id)
    active_task = next((t for t in p.tasks if t.status.value == "in_progress"), None)
    return {
        "running": running,
        "project_status": p.status.value,
        "progress": p.progress,
        "active_task": {"id": active_task.id, "title": active_task.title} if active_task else None,
    }
