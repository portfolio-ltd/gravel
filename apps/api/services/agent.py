"""
In-process agent executor — the fallback engineer.

When a project owner has no active engineer runtimes (Docker containers),
pending TaskRuns are executed here instead: each phase becomes one LLM call
(BYOK keys from the owner's settings) whose outcome feeds the same
orchestrator gate machinery the real runtimes use. Without any API key the
executor produces simulated outcomes so the workflow stays demoable.
"""
import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from db.base import new_uuid
from db.session import AsyncSessionLocal
from models.project import Project
from models.task import Task, TaskStatus
from models.task_run import TaskRun, TaskRunLog, TaskRunOutcome, TaskRunPhase
from models.user import User
from services import orchestrator
from services.llm import LLMResult, call_llm, pick_provider
from services.token_usage import record_usage
from services.users import get_plain_keys

logger = logging.getLogger(__name__)

_running: set[str] = set()


def is_running(project_id: str) -> bool:
    return project_id in _running


async def run_agent(project_id: str, user_id: str) -> None:
    """Entry point for POST /agent/run: queue grooming runs, then drain if needed."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project).options(selectinload(Project.tasks)).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            return

        pending = [t for t in project.tasks if t.status == TaskStatus.pending]
        pending.sort(key=lambda t: ({"high": 0, "medium": 1, "low": 2}[t.priority.value], t.position))
        stages = await orchestrator.ordered_stages(db, project.workflow_id) if project.workflow_id else []
        for task in pending:
            if stages:
                await orchestrator.enter_stage(db, task, stages[0], stages)
            else:
                await orchestrator.create_phase_run(db, task, TaskRunPhase.grooming)
        await db.commit()

        runtimes_active = await orchestrator.has_active_runtimes(db, project.organization_id)

    if not runtimes_active:
        await drain_project(project_id, user_id)


def schedule_drain(project_id: str, user_id: str) -> None:
    """Fire-and-forget in-process execution (used after approvals)."""
    asyncio.get_running_loop().create_task(drain_project(project_id, user_id))


async def drain_project(project_id: str, user_id: str) -> None:
    """Execute unclaimed pending runs for a project until only gated runs remain."""
    if project_id in _running:
        return
    _running.add(project_id)
    try:
        while True:
            async with AsyncSessionLocal() as db:
                row = (await db.execute(
                    select(TaskRun, Task, Project)
                    .join(Task, Task.id == TaskRun.task_id)
                    .join(Project, Project.id == Task.project_id)
                    .where(
                        Project.id == project_id,
                        TaskRun.outcome.is_(None),
                        TaskRun.claimed_at.is_(None),
                    )
                    .order_by(TaskRun.started_at.asc())
                    .limit(1)
                )).first()
                if not row:
                    break
                run, task, project = row

                # If real runtimes came online, leave the queue to them.
                if await orchestrator.has_active_runtimes(db, project.organization_id):
                    break

                # NOTE: the drain deliberately ignores per-stage engineer
                # targeting — it only runs when the owner has zero active
                # runtimes, so there is no engineer to defer to.
                stage = None
                if run.workflow_stage_id:
                    from models.workflow import WorkflowStage
                    stage = await db.get(WorkflowStage, run.workflow_stage_id)

                run.claimed_at = datetime.now(timezone.utc)
                if stage:
                    task.status = orchestrator.stage_task_status(
                        await orchestrator.ordered_stages(db, stage.workflow_id), stage
                    )
                else:
                    task.status = orchestrator.PHASE_TASK_STATUS[run.phase]
                await db.commit()

                user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
                keys = get_plain_keys(user) if user else {}

                if stage:
                    outcome, summary, usage = await _execute_stage(stage, task, project, keys)
                else:
                    outcome, summary, usage = await _execute_phase(run.phase, task, project, keys)

                if usage:
                    await record_usage(
                        db, model=usage.model,
                        tokens_in=usage.tokens_in, tokens_out=usage.tokens_out,
                        user_id=user_id, organization_id=project.organization_id,
                        task_id=task.id, task_run_id=run.id,
                    )

                db.add(TaskRunLog(
                    id=new_uuid(), task_run_id=run.id,
                    message=summary[:4000] if summary else f"{run.phase.value} finished",
                    level="info" if outcome != TaskRunOutcome.failed else "error",
                ))
                await orchestrator.apply_outcome(db, run, outcome, summary=summary)
                await db.commit()
    finally:
        _running.discard(project_id)


PHASE_TASK_PROMPTS = {
    TaskRunPhase.grooming: "Assess whether this task is implementation-ready. List concrete acceptance criteria and implementation steps. Keep it under 200 words.",
    TaskRunPhase.build: "Describe the implementation you would ship for this task: key changes, files touched, and how you verified them. Keep it under 200 words.",
    TaskRunPhase.testing: "Produce a test report for this task: what you tested against the acceptance criteria and the results. Keep it under 200 words.",
    TaskRunPhase.deployment: "Summarize the deployment of this change: build, upload, cache invalidation, and the resulting URL. Keep it under 150 words.",
}


async def _execute_stage(stage, task: Task, project: Project,
                         keys: dict) -> tuple[TaskRunOutcome, str, LLMResult | None]:
    """Execute a custom workflow stage in-process (one LLM call, or simulated)."""
    provider = pick_provider(keys, project.default_model)
    if provider is None:
        await asyncio.sleep(1.0)
        return TaskRunOutcome.build_complete, (
            f"[simulated stage '{stage.name}'] {task.title} — configure an API key in "
            "Settings → API Keys for real LLM execution."
        ), None

    instructions = stage.stage_instructions or (
        f"Complete the workflow stage '{stage.name}' for this task. "
        "Describe the work performed and its result. Keep it under 200 words."
    )
    prompt = (
        f"You are an AI software engineer working on project '{project.name}'.\n\n"
        f"Task: {task.title}\n"
        f"Description: {task.description or 'n/a'}\n\n"
        f"Current workflow stage: {stage.name}\n{instructions}"
    )
    try:
        result = await call_llm(provider, project.default_model, keys, prompt, max_tokens=500)
        return TaskRunOutcome.build_complete, result.text, result
    except Exception as exc:
        logger.warning("LLM call failed for task %s (stage %s): %s", task.id, stage.name, exc)
        return TaskRunOutcome.failed, f"LLM call failed: {exc}", None


async def _execute_phase(phase: TaskRunPhase, task: Task, project: Project,
                         keys: dict) -> tuple[TaskRunOutcome, str, LLMResult | None]:
    provider = pick_provider(keys, project.default_model)
    complete = orchestrator.PHASE_COMPLETE[phase]

    if provider is None:
        await asyncio.sleep(1.0)
        return complete, (
            f"[simulated {phase.value}] {task.title} — configure an API key in "
            "Settings → API Keys for real LLM execution."
        ), None

    prompt = (
        f"You are an AI software engineer working on project '{project.name}'.\n\n"
        f"Task: {task.title}\n"
        f"Description: {task.description or 'n/a'}\n\n"
        f"{PHASE_TASK_PROMPTS[phase]}"
    )
    try:
        result = await call_llm(provider, project.default_model, keys, prompt, max_tokens=500)
        return complete, result.text, result
    except Exception as exc:
        logger.warning("LLM call failed for task %s (%s): %s", task.id, phase.value, exc)
        return TaskRunOutcome.failed, f"LLM call failed: {exc}", None
