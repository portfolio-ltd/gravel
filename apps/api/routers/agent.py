from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import DB, CurrentOrg, CurrentUser, get_current_runtime, get_db
from models.code_graph import CodeGraphStatus
from models.engineer import Engineer, EngineerRuntime
from models.task import Task, TaskPriority, TaskStatus, TaskType
from models.task_run import TaskComment
from schemas.task_run import PollResponse
from services import agent as agent_svc
from services import code_graph, orchestrator, sdlc, subagents, task_graph
from services import harness as harness_svc
from services.llm import provider_for_model, resolve_model
from services.parser import parse_prd
from services.projects import get_project
from services.sdlc import merge_ai_criteria
from services.users import get_plain_keys

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/poll-next-task", response_model=PollResponse)
async def poll_next_task(
    db: AsyncSession = Depends(get_db),
    runtime: EngineerRuntime = Depends(get_current_runtime),
):
    """Engineer runtimes claim their next unit of work here."""
    engineer = await db.get(Engineer, runtime.engineer_id)
    if not engineer:
        raise HTTPException(404, "Engineer not found for runtime")

    claimed = await orchestrator.claim_next_run(db, engineer, runtime)
    if not claimed:
        return PollResponse()

    run, task, project = claimed
    comments = list((await db.execute(
        select(TaskComment).where(TaskComment.task_id == task.id).order_by(TaskComment.created_at)
    )).scalars())

    stage = None
    poll_stage = None
    stage_position = None
    if run.workflow_stage_id:
        from models.workflow import WorkflowStage
        from schemas.task_run import PollStage
        stage = await db.get(WorkflowStage, run.workflow_stage_id)
        if stage:
            stages = await orchestrator.ordered_stages(db, stage.workflow_id)
            idx = [s.id for s in stages].index(stage.id)
            stage_position = (idx + 1, len(stages))
            poll_stage = PollStage(
                id=stage.id, name=stage.name, stage_order=stage.stage_order,
                is_first=idx == 0, is_last=idx == len(stages) - 1,
                requires_human_approval=stage.requires_human_approval,
                role=stage.role or "custom",
                produces=[k.value for k in sdlc.role_of(stage)["produces"]],
            )

    bundle = orchestrator.build_task_bundle(
        task, project, engineer, comments, run.phase, stage=stage, stage_position=stage_position
    )
    bundle.update(await sdlc.bundle_files(db, task, project))
    bundle = sdlc.flatten_bundle_wikilinks(bundle, await sdlc.accepted_knowledge(db, project))
    # The graph inside the run: the harness decides subagents, routing, the
    # test gate and executor limits (stage → org default → built-in)
    graph = await code_graph.get_for_project(db, project.id)
    harness = await harness_svc.resolve(db, stage, project.organization_id)
    role = subagents.role_for(stage.role if stage else None, run.phase.value)
    bundle.update(subagents.bundle_files(
        role, graph.graph if graph is not None and graph.status == CodeGraphStatus.ready else None, harness,
    ))
    if harness is not None:
        run.harness_id = harness.id
        if harness.instructions_markdown and harness.instructions_markdown.strip():
            bundle["STAGE_INSTRUCTIONS.md"] = (
                bundle["STAGE_INSTRUCTIONS.md"].rstrip() + "\n\n## Harness instructions\n\n"
                + harness.instructions_markdown.strip() + "\n"
            )
        await db.flush()
    model = resolve_model(stage, engineer, project)
    return PollResponse(
        task_run=run, task=task, project=project, bundle=bundle, workflow_stage=poll_stage,
        model=model, model_provider=provider_for_model(model) or engineer.model_provider,
    )


class ParseRequest(BaseModel):
    project_id: str
    model: str | None = None
    api_key: str | None = None  # optional override; normally read from user record


class ParseResponse(BaseModel):
    tasks: list[dict]


@router.post("/parse", response_model=ParseResponse)
async def parse_prd_endpoint(body: ParseRequest, current_user: CurrentUser, org: CurrentOrg, db: DB):
    p = await get_project(db, body.project_id, organization_id=org.id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if not p.prd_file_path:
        raise HTTPException(status_code=400, detail="Upload a PRD file first.")

    keys = get_plain_keys(current_user)
    model = body.model or p.default_model

    raw_tasks, usage = await parse_prd(p.prd_file_path, model, keys)
    if usage:
        from services.token_usage import record_usage
        await record_usage(
            db, model=usage.model, tokens_in=usage.tokens_in, tokens_out=usage.tokens_out,
            user_id=current_user.id, organization_id=org.id,
        )

    # Persist extracted tasks (clear existing pending tasks first)
    from sqlalchemy import delete
    await db.execute(
        delete(Task).where(Task.project_id == body.project_id, Task.status == TaskStatus.pending)
    )
    created: list[Task] = []
    for i, t in enumerate(raw_tasks):
        try:
            priority = TaskPriority(t.get("priority", "medium"))
        except ValueError:
            priority = TaskPriority.medium
        try:
            task_type = TaskType(t.get("type", "feature"))
        except ValueError:
            task_type = TaskType.feature

        criteria = [str(c) for c in (t.get("acceptance_criteria") or []) if str(c).strip()]
        task = Task(
            project_id=body.project_id,
            title=t.get("title", "Untitled")[:300],
            description=t.get("description", ""),
            priority=priority,
            type=task_type,
            position=i,
            acceptance_criteria=merge_ai_criteria(None, criteria) if criteria else None,
        )
        db.add(task)
        created.append(task)

    await db.flush()
    task_graph.link_by_index(created, raw_tasks)
    await db.flush()
    return ParseResponse(tasks=raw_tasks)


@router.post("/run/{project_id}", status_code=202)
async def run_agent(project_id: str, background_tasks: BackgroundTasks, current_user: CurrentUser, org: CurrentOrg, db: DB):
    p = await get_project(db, project_id, organization_id=org.id)
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
async def agent_status(project_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    p = await get_project(db, project_id, organization_id=org.id)
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
