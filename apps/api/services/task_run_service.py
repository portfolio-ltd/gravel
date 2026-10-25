from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.base import new_uuid
from models.task import Task, TaskStatus
from models.task_run import (
    ArtifactType,
    CommentAuthorType,
    EvidenceArtifact,
    TaskComment,
    TaskRun,
    TaskRunLog,
    TaskRunOutcome,
    TaskRunPhase,
)


async def get_run(db: AsyncSession, run_id: str) -> TaskRun | None:
    result = await db.execute(select(TaskRun).where(TaskRun.id == run_id))
    run = result.scalar_one_or_none()
    if run:
        await db.refresh(run, ["logs", "artifacts"])
    return run


async def list_runs(db: AsyncSession, task_id: str) -> list[TaskRun]:
    result = await db.execute(
        select(TaskRun)
        .where(TaskRun.task_id == task_id)
        .options(selectinload(TaskRun.logs), selectinload(TaskRun.artifacts))
        .order_by(TaskRun.started_at.desc())
    )
    return list(result.scalars().all())


async def create_run(db: AsyncSession, task_id: str, phase: TaskRunPhase, engineer_id: str | None = None) -> TaskRun:
    run = TaskRun(
        id=new_uuid(),
        task_id=task_id,
        engineer_id=engineer_id,
        phase=phase,
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    await db.flush()
    return run


async def reject_run(db: AsyncSession, run_id: str, note: str | None = None,
                     rework: bool | None = None, author_id: str | None = None) -> TaskRun | None:
    """Reject a gated run.

    rework=True ("request changes") records the note as a human comment and
    sends the task back for another pass: a workflow stage re-enters its
    rework target (or itself), a phase re-runs (testing goes back to build).
    rework=False stops the task at pending. None means: rework for workflow
    stages, stop for the legacy phase pipeline.
    """
    from models.workflow import WorkflowStage
    from services import orchestrator

    run = await get_run(db, run_id)
    if not run:
        return None
    run.outcome = TaskRunOutcome.failed
    run.approval_required = False
    run.completed_at = datetime.now(timezone.utc)

    task = (await db.execute(select(Task).where(Task.id == run.task_id))).scalar_one_or_none()
    if note:
        db.add(TaskRunLog(id=new_uuid(), task_run_id=run_id, message=f"Rejected: {note}", level="warn"))
    if rework is None:
        rework = run.workflow_stage_id is not None
    if not task:
        await db.flush()
        return run

    if not rework:
        task.status = TaskStatus.pending
        await db.flush()
        return run

    db.add(TaskComment(
        id=new_uuid(), task_id=task.id, task_run_id=run.id, author_id=author_id,
        author_type=CommentAuthorType.human, action_flag="changes_requested",
        body=f"Changes requested: {note}" if note else "Changes requested.",
    ))
    await db.flush()
    stage = await db.get(WorkflowStage, run.workflow_stage_id) if run.workflow_stage_id else None
    if stage:
        stages = await orchestrator.ordered_stages(db, stage.workflow_id)
        target = next((s for s in stages if s.id == stage.rework_target_stage_id), None) or stage
        await orchestrator.enter_stage(db, task, target, stages)
    else:
        phase = TaskRunPhase.build if run.phase == TaskRunPhase.testing else run.phase
        task.status = orchestrator.PHASE_TASK_STATUS[phase]
        await orchestrator.create_phase_run(db, task, phase)
    await db.flush()
    return run


async def record_heartbeat(db: AsyncSession, run_id: str) -> TaskRun | None:
    run = await get_run(db, run_id)
    if run:
        run.last_heartbeat_at = datetime.now(timezone.utc)
        await db.flush()
    return run


async def submit_log(db: AsyncSession, run_id: str, message: str, level: str = "info") -> TaskRunLog:
    log = TaskRunLog(id=new_uuid(), task_run_id=run_id, message=message, level=level)
    db.add(log)
    await db.flush()
    return log


# Comments
async def list_comments(db: AsyncSession, task_id: str) -> list[TaskComment]:
    result = await db.execute(
        select(TaskComment).where(TaskComment.task_id == task_id).order_by(TaskComment.created_at)
    )
    return list(result.scalars().all())


async def add_comment(db: AsyncSession, task_id: str, body: str,
                      author_id: str | None, author_type: CommentAuthorType,
                      task_run_id: str | None = None, action_flag: str | None = None) -> TaskComment:
    comment = TaskComment(
        id=new_uuid(),
        task_id=task_id,
        task_run_id=task_run_id,
        author_id=author_id,
        author_type=author_type,
        body=body,
        action_flag=action_flag,
    )
    db.add(comment)
    await db.flush()
    return comment


async def delete_comment(db: AsyncSession, task_id: str, comment_id: str) -> bool:
    result = await db.execute(
        select(TaskComment).where(TaskComment.id == comment_id, TaskComment.task_id == task_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        return False
    await db.delete(comment)
    await db.flush()
    return True


# Artifacts
async def list_artifacts(db: AsyncSession, run_id: str) -> list[EvidenceArtifact]:
    result = await db.execute(
        select(EvidenceArtifact).where(EvidenceArtifact.task_run_id == run_id)
    )
    return list(result.scalars().all())


async def create_artifact(db: AsyncSession, run_id: str, artifact_type: ArtifactType,
                          file_path: str, filename: str) -> EvidenceArtifact:
    artifact = EvidenceArtifact(
        id=new_uuid(),
        task_run_id=run_id,
        artifact_type=artifact_type,
        file_path=file_path,
        filename=filename,
    )
    db.add(artifact)
    await db.flush()
    return artifact


async def get_artifact(db: AsyncSession, artifact_id: str) -> EvidenceArtifact | None:
    return (await db.execute(select(EvidenceArtifact).where(EvidenceArtifact.id == artifact_id))).scalar_one_or_none()


async def delete_artifact(db: AsyncSession, artifact_id: str) -> bool:
    art = await get_artifact(db, artifact_id)
    if not art:
        return False
    from services.storage import delete_stored_file
    delete_stored_file(art.file_path)
    await db.delete(art)
    await db.flush()
    return True
