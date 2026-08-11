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


async def reject_run(db: AsyncSession, run_id: str, note: str | None = None) -> TaskRun | None:
    run = await get_run(db, run_id)
    if not run:
        return None
    run.outcome = TaskRunOutcome.failed
    run.approval_required = False
    run.completed_at = datetime.now(timezone.utc)

    # Reset task to pending
    result = await db.execute(select(Task).where(Task.id == run.task_id))
    task = result.scalar_one_or_none()
    if task:
        task.status = TaskStatus.pending

    if note:
        log = TaskRunLog(id=new_uuid(), task_run_id=run_id, message=f"Rejected: {note}", level="warn")
        db.add(log)
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


async def report_outcome(db: AsyncSession, run_id: str, outcome: TaskRunOutcome, blocking_reason: str | None = None) -> TaskRun | None:
    run = await get_run(db, run_id)
    if not run:
        return None
    run.outcome = outcome
    run.blocking_reason = blocking_reason
    run.completed_at = datetime.now(timezone.utc)

    if outcome in (TaskRunOutcome.build_complete, TaskRunOutcome.deployment_complete):
        result = await db.execute(select(Task).where(Task.id == run.task_id))
        task = result.scalar_one_or_none()
        if task:
            task.status = TaskStatus.done
    await db.flush()
    return run


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


async def delete_comment(db: AsyncSession, comment_id: str) -> bool:
    result = await db.execute(select(TaskComment).where(TaskComment.id == comment_id))
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


async def delete_artifact(db: AsyncSession, artifact_id: str) -> bool:
    result = await db.execute(select(EvidenceArtifact).where(EvidenceArtifact.id == artifact_id))
    art = result.scalar_one_or_none()
    if not art:
        return False
    await db.delete(art)
    await db.flush()
    return True
