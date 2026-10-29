"""
In-process agent executor — the fallback engineer.

When a project owner has no active engineer runtimes (Docker containers),
pending TaskRuns are executed here instead: each phase becomes one LLM call
(BYOK keys from the owner's settings) whose outcome feeds the same
orchestrator gate machinery the real runtimes use. Without any API key the
executor produces simulated outcomes so the workflow stays demoable.
"""
import asyncio
import json
import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from db.base import new_uuid
from db.session import AsyncSessionLocal
from models.engineer import Engineer
from models.project import Project
from models.sdlc import OpenQuestion, QuestionStatus
from models.task import Task, TaskStatus
from models.task_run import TaskComment, TaskRun, TaskRunLog, TaskRunOutcome, TaskRunPhase
from models.user import User
from services import orchestrator, sdlc, task_graph
from services.llm import LLMRefusal, LLMResult, call_llm, pick_provider, resolve_model
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

        # Task graph: only tasks whose dependencies are done start now; the
        # rest are queued as their dependencies finish (services/task_graph.py)
        tasks = {t.id: t for t in project.tasks}
        pending = [t for t in project.tasks if t.status == TaskStatus.pending and task_graph.is_ready(t, tasks)]
        pending.sort(key=lambda t: ({"high": 0, "medium": 1, "low": 2}[t.priority.value], t.position))
        for task in pending:
            await task_graph.queue_task(db, task, project)
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

                artifacts = None
                if stage:
                    outcome, summary, usage, artifacts = await _execute_stage(db, stage, task, project, keys)
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
                await orchestrator.apply_outcome(db, run, outcome, summary=summary, artifacts=artifacts)
                await db.commit()
    finally:
        _running.discard(project_id)


PHASE_TASK_PROMPTS = {
    TaskRunPhase.grooming: "Assess whether this task is implementation-ready. List concrete acceptance criteria and implementation steps. Keep it under 200 words.",
    TaskRunPhase.build: "Describe the implementation you would ship for this task: key changes, files touched, and how you verified them. Keep it under 200 words.",
    TaskRunPhase.testing: "Produce a test report for this task: what you tested against the acceptance criteria and the results. Keep it under 200 words.",
    TaskRunPhase.deployment: "Summarize the deployment of this change: build, upload, cache invalidation, and the resulting URL. Keep it under 150 words.",
}


_RESULT_OUTCOMES = {
    "needs_human_input": TaskRunOutcome.needs_human_input,
    "blocked": TaskRunOutcome.blocked,
    "failed": TaskRunOutcome.failed,
}


async def _execute_stage(db, stage, task: Task, project: Project, keys: dict
                         ) -> tuple[TaskRunOutcome, str, LLMResult | None, sdlc.StageArtifacts | None]:
    """Execute a workflow stage in-process: one structured LLM call, or simulated."""
    role_key = stage.role or "custom"
    role = sdlc.role_of(stage)
    questions = list((await db.execute(
        select(OpenQuestion).where(OpenQuestion.task_id == task.id).order_by(OpenQuestion.created_at)
    )).scalars())

    # The drain runs stages itself, but an assigned engineer's model still
    # sits in the precedence chain between the stage and the project.
    engineer = await db.get(Engineer, stage.assigned_engineer_id) if stage.assigned_engineer_id else None
    model = resolve_model(stage, engineer, project)
    provider = pick_provider(keys, model)
    if provider is None:
        await asyncio.sleep(0.5)
        data = sdlc.simulated_result(role_key, task, [q for q in questions if q.status == QuestionStatus.open])
        return _result_outcome(data), data["summary"], None, sdlc.StageArtifacts.from_payload(data)

    comments = list((await db.execute(
        select(TaskComment).where(TaskComment.task_id == task.id).order_by(TaskComment.created_at)
    )).scalars())
    files = await sdlc.bundle_files(db, task, project)
    files.pop("OUTPUT_CONTRACT.md", None)
    context = "\n\n".join(f"---- .gravel/{name} ----\n{body}" for name, body in files.items())
    thread = "\n".join(f"- [{c.author_type.value}] {c.body}" for c in comments[-30:]) or "- No comments."
    produces = ", ".join(k.value for k in role["produces"]) or "none required"
    system = (
        f"You are a senior software engineer on the project '{project.name}', carrying out one stage "
        "of a delivery workflow. You are running without repository access: reason from the material "
        "provided, and when a stage would normally touch code, describe precisely what you would change. "
        "Never invent requirements or answers — record unknowns as open questions with an owner."
    )
    from services import harness as harness_svc
    harness = await harness_svc.resolve(db, stage, project.organization_id)
    extra = (harness.instructions_markdown or "").strip() if harness else ""
    task_text = sdlc.flatten_bundle_wikilinks(
        {"TASK.md": f"{task.title}\n\n{task.description or 'No description provided.'}"},
        await sdlc.accepted_knowledge(db, project))["TASK.md"]
    prompt = (
        f"# Stage: {stage.name}\n\n{sdlc.stage_instructions(stage)}\n\n"
        + (f"## Harness instructions\n\n{extra}\n\n" if extra else "")
        + f"Documents this stage is expected to produce: {produces}.\n\n"
        f"# Task: {task_text}\n\n"
        f"## Acceptance criteria\n{sdlc.render_criteria(task)}\n\n"
        f"## Comment thread\n{thread}\n\n{context}\n\n"
        "Reply with a single JSON object matching the stage result schema: outcome, summary, "
        "blocking_reason, verdict (pass | changes_requested | none), documents, acceptance_criteria "
        "(complete revised list, or empty to leave unchanged), open_questions, resolved_questions "
        "(ids from QUESTIONS.md), knowledge."
    )
    try:
        result = await call_llm(
            provider, model, keys, prompt, max_tokens=16000,
            json_schema=sdlc.STAGE_RESULT_SCHEMA, effort=role["effort"], system=system,
        )
    except LLMRefusal as exc:
        return TaskRunOutcome.needs_human_input, str(exc), None, None
    except Exception as exc:
        logger.warning("LLM call failed for task %s (stage %s): %s", task.id, stage.name, exc)
        return TaskRunOutcome.failed, f"LLM call failed: {exc}", None, None

    data = _parse_json_object(result.text)
    if data is None:
        return TaskRunOutcome.build_complete, result.text, result, None
    artifacts = sdlc.StageArtifacts.from_payload(data)
    summary = str(data.get("summary") or "").strip() or f"{stage.name} finished"
    outcome = _result_outcome(data)
    if outcome != TaskRunOutcome.build_complete and data.get("blocking_reason"):
        summary = f"{summary}\n\n{data['blocking_reason']}"
    return outcome, summary, result, artifacts


def _result_outcome(data: dict) -> TaskRunOutcome:
    return _RESULT_OUTCOMES.get(str(data.get("outcome")), TaskRunOutcome.build_complete)


def _parse_json_object(text: str) -> dict | None:
    text = re.sub(r"^```(?:json)?|```$", "", (text or "").strip(), flags=re.MULTILINE).strip()
    for candidate in (text, text[text.find("{"): text.rfind("}") + 1]):
        try:
            data = json.loads(candidate)
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, ValueError):
            continue
    return None


async def _execute_phase(phase: TaskRunPhase, task: Task, project: Project,
                         keys: dict) -> tuple[TaskRunOutcome, str, LLMResult | None]:
    model = resolve_model(project=project)
    provider = pick_provider(keys, model)
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
        result = await call_llm(provider, model, keys, prompt, max_tokens=4000, effort="low")
        return complete, result.text, result
    except Exception as exc:
        logger.warning("LLM call failed for task %s (%s): %s", task.id, phase.value, exc)
        return TaskRunOutcome.failed, f"LLM call failed: {exc}", None
