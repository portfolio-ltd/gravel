from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import services.task_run_service as run_svc
from dependencies import get_current_org, get_current_runtime, get_current_user, get_db
from models.engineer import EngineerRuntime
from models.organization import Organization
from models.task import Task, TaskStatus
from models.task_run import CommentAuthorType, TaskRun, TaskRunPhase
from models.user import User
from schemas.task_run import (
    ApproveReject,
    ArtifactOut,
    CommentCreate,
    CommentOut,
    LogSubmit,
    OutcomeReport,
    TaskRunDetail,
)
from services import agent as agent_svc
from services import orchestrator

router = APIRouter(tags=["task_runs"])


async def _project_for_run(db: AsyncSession, run: TaskRun):
    task = await db.get(Task, run.task_id, options=[selectinload(Task.project)])
    return task, task.project


async def _run_in_org_or_404(db: AsyncSession, run_id: str, org: Organization) -> TaskRun:
    run = await db.get(TaskRun, run_id)
    if run:
        task = await db.get(Task, run.task_id, options=[selectinload(Task.project)])
        if task and task.project and task.project.organization_id == org.id:
            return run
    raise HTTPException(404, "Run not found")


async def _task_in_org_or_404(db: AsyncSession, task_id: str, org: Organization) -> Task:
    task = await db.get(Task, task_id, options=[selectinload(Task.project)])
    if task and task.project and task.project.organization_id == org.id:
        return task
    raise HTTPException(404, "Task not found")


# Task run detail + approval
@router.get("/task-runs/{run_id}", response_model=TaskRunDetail)
async def get_run(run_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    await _run_in_org_or_404(db, run_id, org)
    return await run_svc.get_run(db, run_id)


@router.get("/tasks/{task_id}/runs", response_model=list[TaskRunDetail])
async def list_runs(task_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    await _task_in_org_or_404(db, task_id, org)
    return await run_svc.list_runs(db, task_id)


@router.post("/task-runs/{run_id}/approve", response_model=TaskRunDetail)
async def approve(run_id: str, body: ApproveReject, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    await _run_in_org_or_404(db, run_id, org)
    run = await run_svc.get_run(db, run_id)
    if not run.approval_required or run.approved_at is not None:
        raise HTTPException(400, "This run is not awaiting approval")
    run = await orchestrator.advance_after_approval(db, run, body.note)
    task, project = await _project_for_run(db, run)
    result = await run_svc.get_run(db, run_id)

    # No live runtimes? Let the in-process executor pick up the queued run.
    # Commit first so the drain worker (separate session) can see it.
    if not await orchestrator.has_active_runtimes(db, project.organization_id):
        await db.commit()
        agent_svc.schedule_drain(project.id, project.owner_id)
    return result


@router.post("/task-runs/{run_id}/reject", response_model=TaskRunDetail)
async def reject(run_id: str, body: ApproveReject, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    await _run_in_org_or_404(db, run_id, org)
    run = await run_svc.reject_run(db, run_id, body.note)
    return await run_svc.get_run(db, run_id)


# Runtime-facing endpoints — authenticated by the runtime's launch token
@router.post("/agent/task-runs/{run_id}/heartbeat")
async def agent_heartbeat(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    runtime: EngineerRuntime = Depends(get_current_runtime),
):
    run = await run_svc.record_heartbeat(db, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return {"status": "ok"}


@router.post("/agent/task-runs/{run_id}/logs")
async def agent_logs(
    run_id: str,
    body: LogSubmit,
    db: AsyncSession = Depends(get_db),
    runtime: EngineerRuntime = Depends(get_current_runtime),
):
    log = await run_svc.submit_log(db, run_id, body.message, body.level)
    return {"id": log.id}


@router.post("/agent/task-runs/{run_id}/outcome")
async def agent_outcome(
    run_id: str,
    body: OutcomeReport,
    db: AsyncSession = Depends(get_db),
    runtime: EngineerRuntime = Depends(get_current_runtime),
):
    run = await db.get(TaskRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.outcome is not None:
        raise HTTPException(409, "Run already has an outcome")
    run = await orchestrator.apply_outcome(
        db, run, body.outcome,
        summary=body.summary,
        blocking_reason=body.blocking_reason,
        branch_name=body.branch_name,
        pr_url=body.pr_url,
        deploy_url=body.deploy_url,
    )
    if body.tokens_in or body.tokens_out:
        from services.token_usage import record_usage
        task, project = await _project_for_run(db, run)
        await record_usage(
            db, model=body.model or "unknown",
            tokens_in=body.tokens_in, tokens_out=body.tokens_out,
            user_id=project.owner_id, organization_id=project.organization_id,
            task_id=run.task_id, task_run_id=run.id,
        )
    return {"status": "ok", "outcome": run.outcome}


# Comments
@router.get("/tasks/{task_id}/comments", response_model=list[CommentOut])
async def list_comments(task_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    await _task_in_org_or_404(db, task_id, org)
    return await run_svc.list_comments(db, task_id)


@router.post("/tasks/{task_id}/comments", response_model=CommentOut, status_code=201)
async def add_comment(task_id: str, body: CommentCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    await _task_in_org_or_404(db, task_id, org)
    return await run_svc.add_comment(
        db, task_id, body.body, current_user.id,
        CommentAuthorType.human, body.task_run_id, body.action_flag
    )


@router.delete("/tasks/{task_id}/comments/{comment_id}", status_code=204)
async def delete_comment(task_id: str, comment_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    await _task_in_org_or_404(db, task_id, org)
    ok = await run_svc.delete_comment(db, comment_id)
    if not ok:
        raise HTTPException(404, "Comment not found")


# Task retry — reset and queue a fresh first run (grooming, or the workflow's first stage)
@router.post("/tasks/{task_id}/retry")
async def retry_task(task_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    task = await _task_in_org_or_404(db, task_id, org)
    task.status = TaskStatus.pending
    if task.project.workflow_id:
        stages = await orchestrator.ordered_stages(db, task.project.workflow_id)
        if not stages:
            raise HTTPException(400, "The project's workflow has no stages")
        task.rework_count = 0  # re-arm the rework loop deliberately
        await orchestrator.enter_stage(db, task, stages[0], stages)
    else:
        await orchestrator.create_phase_run(db, task, TaskRunPhase.grooming)
    project_id, owner_id = task.project.id, task.project.owner_id
    if not await orchestrator.has_active_runtimes(db, task.project.organization_id):
        await db.commit()  # make the new run visible to the drain worker's session
        agent_svc.schedule_drain(project_id, owner_id)
    return {"status": "ok", "task_id": task_id}


# Token usage
@router.get("/tasks/{task_id}/token-summary")
async def task_token_summary(task_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    await _task_in_org_or_404(db, task_id, org)
    from services.token_usage import summary_for_task
    return await summary_for_task(db, task_id)


# Artifacts
@router.get("/task-runs/{run_id}/artifacts", response_model=list[ArtifactOut])
async def list_artifacts(run_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    await _run_in_org_or_404(db, run_id, org)
    return await run_svc.list_artifacts(db, run_id)


@router.delete("/artifacts/{artifact_id}", status_code=204)
async def delete_artifact(artifact_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    ok = await run_svc.delete_artifact(db, artifact_id)
    if not ok:
        raise HTTPException(404, "Artifact not found")
