"""
Task-run orchestrator: the shared engine behind engineer runtimes and the
in-process agent loop.

Default lifecycle of a task (project without a custom workflow):
    grooming ──gate──▶ build ──gate──▶ testing ──gate──▶ deployment ──▶ done
                                          └───────(no deploy target)──▶ done

Projects with a custom workflow (project.workflow_id set) instead move tasks
through user-defined ordered stages; a run is a stage run iff
run.workflow_stage_id is set (its phase stays `build` — the only phase whose
git behavior is generically correct). Non-AI stages become gated "checkpoint
runs" born terminal; failed/blocked stage runs follow the stage's rework loop.

Every phase/stage executes as a TaskRun. Completion outcomes park the run
behind a human approval gate (approval_required=True) where configured;
approving advances. Pending runs are claimed either by a Docker engineer
runtime (via /api/agent/poll-next-task) or by the in-process executor in
services/agent.py when no runtime is active.
"""
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.base import new_uuid
from models.changelog import ChangelogEntry, ChangelogType
from models.engineer import Engineer, EngineerRuntime
from models.project import Project, ProjectStatus
from models.task import Task, TaskStatus
from models.task_run import (
    CommentAuthorType,
    TaskComment,
    TaskRun,
    TaskRunLog,
    TaskRunOutcome,
    TaskRunPhase,
)
from models.workflow import WorkflowStage
from services import sdlc, ws_manager
from services.tasks import recalculate_progress

logger = logging.getLogger(__name__)

PHASE_ORDER = [TaskRunPhase.grooming, TaskRunPhase.build, TaskRunPhase.testing, TaskRunPhase.deployment]

PHASE_COMPLETE = {
    TaskRunPhase.grooming: TaskRunOutcome.grooming_complete,
    TaskRunPhase.build: TaskRunOutcome.build_complete,
    TaskRunPhase.testing: TaskRunOutcome.testing_complete,
    TaskRunPhase.deployment: TaskRunOutcome.deployment_complete,
}

# Task board status while a phase is being worked on
PHASE_TASK_STATUS = {
    TaskRunPhase.grooming: TaskStatus.pending,
    TaskRunPhase.build: TaskStatus.in_progress,
    TaskRunPhase.testing: TaskStatus.qa,
    TaskRunPhase.deployment: TaskStatus.qa,
}

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

OPEN_RUN_FILTER = TaskRun.outcome.is_(None)


def load_phase_instructions(phase: TaskRunPhase) -> str:
    path = _PROMPTS_DIR / f"{phase.value}.md"
    if path.exists():
        return path.read_text()
    return f"Complete the {phase.value} phase for this task."


def next_phase(phase: TaskRunPhase) -> TaskRunPhase | None:
    idx = PHASE_ORDER.index(phase)
    return PHASE_ORDER[idx + 1] if idx + 1 < len(PHASE_ORDER) else None


# ── Custom workflow stages ────────────────────────────────────────────────────

STAGE_COMPLETE_OUTCOMES = {
    TaskRunOutcome.grooming_complete,
    TaskRunOutcome.build_complete,
    TaskRunOutcome.testing_complete,
    TaskRunOutcome.deployment_complete,
}


async def ordered_stages(db: AsyncSession, workflow_id: str) -> list[WorkflowStage]:
    result = await db.execute(
        select(WorkflowStage)
        .where(WorkflowStage.workflow_id == workflow_id)
        .order_by(WorkflowStage.stage_order, WorkflowStage.id)
    )
    return list(result.scalars().all())


def next_stage_of(stages: list[WorkflowStage], current: WorkflowStage) -> WorkflowStage | None:
    ids = [s.id for s in stages]
    idx = ids.index(current.id)
    return stages[idx + 1] if idx + 1 < len(stages) else None


def stage_task_status(stages: list[WorkflowStage], stage: WorkflowStage) -> TaskStatus:
    """Board status for a stage task: first → pending, last → qa, else in_progress."""
    ids = [s.id for s in stages]
    idx = ids.index(stage.id)
    if idx == 0:
        return TaskStatus.pending
    if idx == len(stages) - 1:
        return TaskStatus.qa
    return TaskStatus.in_progress


async def _stage_attempt_number(db: AsyncSession, task_id: str, stage_id: str) -> int:
    from sqlalchemy import func
    count = (await db.execute(
        select(func.count()).select_from(TaskRun).where(
            TaskRun.task_id == task_id, TaskRun.workflow_stage_id == stage_id
        )
    )).scalar_one()
    return count + 1


async def enter_stage(
    db: AsyncSession, task: Task, stage: WorkflowStage,
    stages: list[WorkflowStage] | None = None,
) -> TaskRun | None:
    """Move a task onto a workflow stage and create its run.

    AI-executable stages get a pending, claimable run. Non-AI stages get a
    "checkpoint run" born terminal and gated — it shows on the attention
    surface and approving it advances the task.
    """
    if await open_run(db, task.id):
        return None
    if stages is None:
        stages = await ordered_stages(db, stage.workflow_id)

    task.workflow_stage_id = stage.id
    task.status = stage_task_status(stages, stage)

    now = datetime.now(timezone.utc)
    attempt = await _stage_attempt_number(db, task.id, stage.id)
    run = TaskRun(
        id=new_uuid(),
        task_id=task.id,
        phase=TaskRunPhase.build,
        workflow_stage_id=stage.id,
        attempt_number=attempt,
        started_at=now,
    )
    if not stage.is_ai_executable:
        run.claimed_at = now
        run.completed_at = now
        run.outcome = TaskRunOutcome.needs_human_input
        run.approval_required = True
        run.blocking_reason = f"Manual stage '{stage.name}' — approve when the work is done"
    db.add(run)
    await db.flush()

    await ws_manager.broadcast(task.project_id, {
        "type": "task.updated",
        "task": {"id": task.id, "status": task.status.value},
    })
    if not stage.is_ai_executable:
        await ws_manager.broadcast(task.project_id, {
            "type": "task_run.outcome",
            "run_id": run.id,
            "task_id": task.id,
            "outcome": run.outcome.value,
            "blocking_reason": run.blocking_reason,
        })
    return run


async def open_run(db: AsyncSession, task_id: str) -> TaskRun | None:
    result = await db.execute(
        select(TaskRun).where(TaskRun.task_id == task_id, OPEN_RUN_FILTER)
    )
    return result.scalars().first()


async def gated_run(db: AsyncSession, task_id: str) -> TaskRun | None:
    """Latest run awaiting human approval for this task, if any."""
    result = await db.execute(
        select(TaskRun)
        .where(
            TaskRun.task_id == task_id,
            TaskRun.approval_required.is_(True),
            TaskRun.approved_at.is_(None),
        )
        .order_by(TaskRun.started_at.desc())
    )
    return result.scalars().first()


async def create_phase_run(db: AsyncSession, task: Task, phase: TaskRunPhase) -> TaskRun | None:
    """Create a pending run for a phase unless the task already has an open one."""
    if await open_run(db, task.id):
        return None
    run = TaskRun(
        id=new_uuid(),
        task_id=task.id,
        phase=phase,
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    await db.flush()
    return run


async def has_active_runtimes(db: AsyncSession, organization_id: str | None) -> bool:
    if not organization_id:
        return False
    result = await db.execute(
        select(EngineerRuntime.id)
        .join(Engineer, Engineer.id == EngineerRuntime.engineer_id)
        .where(Engineer.organization_id == organization_id, EngineerRuntime.is_active.is_(True))
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def claim_next_run(
    db: AsyncSession, engineer: Engineer, runtime: EngineerRuntime
) -> tuple[TaskRun, Task, Project] | None:
    """Hand the oldest unclaimed pending run (scoped to the engineer's org) to a runtime."""
    if runtime.current_task_run_id:
        current = await db.get(TaskRun, runtime.current_task_run_id)
        if current and current.outcome is None:
            return None  # one task per runtime at a time
        runtime.current_task_run_id = None

    q = (
        select(TaskRun, Task, Project)
        .join(Task, Task.id == TaskRun.task_id)
        .join(Project, Project.id == Task.project_id)
        .outerjoin(WorkflowStage, WorkflowStage.id == TaskRun.workflow_stage_id)
        .where(
            Project.organization_id == engineer.organization_id,
            Project.organization_id.isnot(None),
            TaskRun.outcome.is_(None),
            TaskRun.claimed_at.is_(None),
            # Engineer targeting: unassigned stages (and phase runs) are
            # owner-wide claimable; assigned stages only by that engineer.
            (TaskRun.workflow_stage_id.is_(None))
            | (WorkflowStage.assigned_engineer_id.is_(None))
            | (WorkflowStage.assigned_engineer_id == engineer.id),
        )
        .order_by(TaskRun.started_at.asc())
        .limit(1)
    )
    if db.bind and db.bind.dialect.name == "postgresql":
        q = q.with_for_update(of=TaskRun, skip_locked=True)
    row = (await db.execute(q)).first()
    if not row:
        return None

    run, task, project = row
    now = datetime.now(timezone.utc)
    run.engineer_id = engineer.id
    run.claimed_at = now
    run.last_heartbeat_at = now
    runtime.current_task_run_id = run.id
    if run.workflow_stage_id:
        stage = await db.get(WorkflowStage, run.workflow_stage_id)
        if stage:
            task.status = stage_task_status(await ordered_stages(db, stage.workflow_id), stage)
    else:
        task.status = PHASE_TASK_STATUS[run.phase]
    await db.flush()

    await ws_manager.broadcast(project.id, {
        "type": "task.updated",
        "task": {"id": task.id, "status": task.status.value},
    })
    return run, task, project


def build_task_bundle(task: Task, project: Project, engineer: Engineer | None,
                      comments: list[TaskComment], phase: TaskRunPhase,
                      stage: WorkflowStage | None = None,
                      stage_position: tuple[int, int] | None = None) -> dict[str, str]:
    """The file set a runtime writes into its workspace before executing."""
    open_questions = "\n".join(
        f"- {c.body}" for c in comments if c.action_flag
    ) or "- None"
    comment_thread = "\n\n".join(
        f"## {c.author_type.value}\n{c.body}" for c in comments
    ) or "No comments yet."
    return {
        "TASK.md": (
            f"# {task.title}\n\n"
            f"Status: {task.status.value} · Priority: {task.priority.value} · Type: {task.type.value}\n\n"
            f"## Requirements\n{task.description or 'No description provided.'}\n\n"
            f"## Acceptance criteria\n{sdlc.render_criteria(task)}\n\n"
            f"## Flagged comments\n{open_questions}\n"
            + (f"\n## Source\n{task.external_url}\n" if task.external_url else "")
        ),
        "COMMENTS.md": comment_thread,
        "PROJECT_CONTEXT.md": (
            f"# Project: {project.name}\n\n"
            f"- Repository: {project.repo_url or 'not configured'}\n"
            f"- Default branch: {project.default_branch}\n"
            f"- Task branch: {task.branch_name or f'gravel/task-{task.id[:8]}'}\n"
            f"- Default model: {project.default_model}\n"
            + (f"\n## Engineer skills\n{engineer.skills_markdown}\n" if engineer and engineer.skills_markdown else "")
        ),
        "STAGE_INSTRUCTIONS.md": _stage_instructions_doc(stage, stage_position) if stage
        else load_phase_instructions(phase),
    }


def _stage_instructions_doc(stage: WorkflowStage, position: tuple[int, int] | None) -> str:
    # Deliberately never falls back to the phase .md files — those describe
    # the fixed pipeline and would mislead a user-defined stage.
    header = f"# Stage: {stage.name}"
    if position:
        header += f" (step {position[0]}/{position[1]})"
    role = sdlc.role_of(stage)
    if stage.role and stage.role != "custom":
        header += f"\n\nRole: {role['label']} — {role['description']}"
    return f"{header}\n\n{sdlc.stage_instructions(stage)}\n"


async def apply_outcome(
    db: AsyncSession,
    run: TaskRun,
    outcome: TaskRunOutcome,
    summary: str | None = None,
    blocking_reason: str | None = None,
    branch_name: str | None = None,
    pr_url: str | None = None,
    deploy_url: str | None = None,
    artifacts: "sdlc.StageArtifacts | None" = None,
) -> TaskRun:
    """Apply an agent-reported outcome: set gates, statuses, changelog, WS events."""
    task = await db.get(Task, run.task_id, options=[selectinload(Task.project)])
    project = task.project

    if artifacts is not None and not artifacts.empty:
        await sdlc.apply_artifacts(db, task, project, artifacts, run_id=run.id, stage_id=run.workflow_stage_id)
        await ws_manager.broadcast(project.id, {"type": "task.artifacts", "task_id": task.id})
    # A review or verification that asks for changes is a failed stage: it
    # follows the stage's rework loop back to the builder.
    if artifacts is not None and artifacts.verdict == "changes_requested" and outcome in STAGE_COMPLETE_OUTCOMES:
        outcome = TaskRunOutcome.failed
        blocking_reason = blocking_reason or "Changes requested"

    now = datetime.now(timezone.utc)
    run.outcome = outcome
    run.summary = summary
    run.blocking_reason = blocking_reason
    run.completed_at = now

    if branch_name:
        task.branch_name = branch_name
    if pr_url:
        task.pr_url = pr_url
    if deploy_url:
        task.deploy_url = deploy_url

    changelog_msg: str | None = None

    if run.workflow_stage_id:
        # Flush first: the session runs autoflush=False, and enter_stage's
        # open-run guard must see this run's outcome as already set.
        await db.flush()
        changelog_msg = await _apply_stage_outcome(db, run, task, outcome, blocking_reason)
    elif outcome == TaskRunOutcome.deployment_complete:
        task.status = TaskStatus.done
        changelog_msg = f"Deployed: {task.title}"
    elif outcome in (
        TaskRunOutcome.grooming_complete,
        TaskRunOutcome.build_complete,
        TaskRunOutcome.testing_complete,
    ):
        run.approval_required = True
        run.blocking_reason = blocking_reason or f"Awaiting approval: {run.phase.value} complete"
        changelog_msg = f"{run.phase.value.capitalize()} complete (awaiting approval): {task.title}"
    elif outcome in (TaskRunOutcome.needs_human_input, TaskRunOutcome.blocked):
        run.approval_required = True
        run.blocking_reason = blocking_reason or "Needs human input"
    elif outcome == TaskRunOutcome.failed:
        task.status = TaskStatus.pending
        changelog_msg = f"Failed ({run.phase.value}): {task.title}"

    if summary:
        db.add(TaskComment(
            id=new_uuid(),
            task_id=task.id,
            task_run_id=run.id,
            author_type=CommentAuthorType.ai,
            body=summary[:2000],
            action_flag="needs_review" if run.approval_required else None,
        ))

    if summary:
        from services.issues import schedule_issue_comment
        unit = run.phase.value.capitalize()
        if run.workflow_stage_id:
            stage_row = await db.get(WorkflowStage, run.workflow_stage_id)
            unit = stage_row.name if stage_row else "Stage"
        schedule_issue_comment(project, task, f"**{unit}** — `{run.outcome.value}`\n\n{summary[:3000]}")

    if changelog_msg:
        db.add(ChangelogEntry(
            project_id=project.id,
            message=changelog_msg,
            type=ChangelogType.added if outcome == TaskRunOutcome.deployment_complete else ChangelogType.changed,
        ))

    # Release any runtime claim on this run
    rt_result = await db.execute(
        select(EngineerRuntime).where(EngineerRuntime.current_task_run_id == run.id)
    )
    for rt in rt_result.scalars():
        rt.current_task_run_id = None

    await db.flush()
    await db.refresh(project, ["tasks"])
    progress = await recalculate_progress(db, project)

    # Auto-advance project to QA when every task is done
    if project.tasks and all(t.status == TaskStatus.done for t in project.tasks) \
            and project.status == ProjectStatus.running:
        project.status = ProjectStatus.qa
        await db.flush()
        await ws_manager.broadcast(project.id, {
            "type": "project.status_changed", "status": ProjectStatus.qa.value,
        })

    await ws_manager.broadcast(project.id, {
        "type": "task.updated",
        "task": {"id": task.id, "status": task.status.value},
    })
    await ws_manager.broadcast(project.id, {"type": "agent.progress", "progress": progress})
    if changelog_msg:
        await ws_manager.broadcast(project.id, {
            "type": "changelog.added", "entry": {"message": changelog_msg},
        })
    if run.approval_required or outcome in (TaskRunOutcome.needs_human_input, TaskRunOutcome.blocked):
        await ws_manager.broadcast(project.id, {
            "type": "task_run.outcome",
            "run_id": run.id,
            "task_id": task.id,
            "outcome": outcome.value,
            "blocking_reason": run.blocking_reason,
        })
    return run


async def _apply_stage_outcome(
    db: AsyncSession, run: TaskRun, task: Task,
    outcome: TaskRunOutcome, blocking_reason: str | None,
) -> str | None:
    """Stage-run outcome semantics: review gates, rework loops, advancement.

    The caller (apply_outcome) has already set outcome/summary/completed_at
    and handles the epilogue (comment, changelog insert, claim release,
    progress recalc, project auto-QA, broadcasts).
    """
    stage = await db.get(WorkflowStage, run.workflow_stage_id)
    if stage is None:  # stage deleted mid-flight — park for a human
        run.approval_required = True
        run.blocking_reason = "Workflow stage no longer exists — needs human attention"
        return None
    stages = await ordered_stages(db, stage.workflow_id)

    if outcome in STAGE_COMPLETE_OUTCOMES:
        if stage.block_on_open_questions:
            pending = await sdlc.open_blocking_questions(db, task.id)
            if pending:
                run.outcome = TaskRunOutcome.needs_human_input
                run.approval_required = True
                run.blocking_reason = (
                    f"{pending} open question{'s' if pending != 1 else ''} must be answered or deferred "
                    f"before '{stage.name}' can be approved — approving re-runs the stage with the answers"
                )
                return f"Stage '{stage.name}' waiting on open questions: {task.title}"
        if stage.requires_human_approval:
            run.approval_required = True
            run.blocking_reason = blocking_reason or f"Awaiting approval: stage '{stage.name}' complete"
            return f"Stage '{stage.name}' complete (awaiting approval): {task.title}"
        nxt = next_stage_of(stages, stage)
        if nxt is None:
            task.status = TaskStatus.done
            return f"Completed: {task.title}"
        await enter_stage(db, task, nxt, stages)
        return f"Stage '{stage.name}' complete: {task.title}"

    if outcome == TaskRunOutcome.needs_human_input:
        run.approval_required = True
        run.blocking_reason = blocking_reason or f"Stage '{stage.name}' needs human input"
        return None

    # failed / blocked → rework loop
    task.rework_count += 1
    target = None
    if stage.rework_target_stage_id and task.rework_count < stage.max_rework_attempts:
        target = next((s for s in stages if s.id == stage.rework_target_stage_id), None)
    if target is not None:
        db.add(TaskComment(
            id=new_uuid(),
            task_id=task.id,
            task_run_id=run.id,
            author_type=CommentAuthorType.ai,
            body=f"Stage '{stage.name}' failed. Rework #{task.rework_count} — sending back to '{target.name}'.",
        ))
        await enter_stage(db, task, target, stages)
        return f"Stage '{stage.name}' failed — rework #{task.rework_count} via '{target.name}': {task.title}"

    run.approval_required = True
    run.blocking_reason = blocking_reason or (
        f"Stage '{stage.name}' {outcome.value} (attempt {run.attempt_number}) — needs human attention"
    )
    return None


async def approval_blocker(db: AsyncSession, run: TaskRun) -> str | None:
    """Why this gated run can't be approved yet, or None."""
    if not run.workflow_stage_id:
        return None
    stage = await db.get(WorkflowStage, run.workflow_stage_id)
    if stage is None or not stage.block_on_open_questions:
        return None
    pending = await sdlc.open_blocking_questions(db, run.task_id)
    if pending:
        return (f"{pending} blocking question{'s' if pending != 1 else ''} still open — "
                "answer, defer or dismiss them first")
    return None


async def advance_after_approval(db: AsyncSession, run: TaskRun, note: str | None = None) -> TaskRun:
    """Human approved a gated run — unlock it and queue the next phase."""
    now = datetime.now(timezone.utc)
    run.approved_at = now
    run.approval_required = False

    task = await db.get(Task, run.task_id, options=[selectinload(Task.project)])
    project = task.project

    if note:
        db.add(TaskRunLog(id=new_uuid(), task_run_id=run.id, message=f"Approved: {note}", level="info"))

    if run.workflow_stage_id:
        await _advance_stage_after_approval(db, run, task, project)
        await db.flush()
        return run

    # A parked needs_human_input / blocked run re-queues the same phase;
    # a completed phase advances to the next one.
    if run.outcome in (TaskRunOutcome.needs_human_input, TaskRunOutcome.blocked):
        target_phase = run.phase
    else:
        target_phase = next_phase(run.phase)

    if target_phase == TaskRunPhase.deployment and not await _has_deploy_target(db, project):
        target_phase = None  # nothing to deploy — task is finished

    if target_phase is None:
        await _finish_task(db, task, project)
    else:
        await create_phase_run(db, task, target_phase)

    await db.flush()
    return run


async def _advance_stage_after_approval(db: AsyncSession, run: TaskRun, task: Task, project: Project) -> None:
    stage = await db.get(WorkflowStage, run.workflow_stage_id)
    if stage is None:  # stage deleted while gated — drop the task back to pending
        task.workflow_stage_id = None
        task.status = TaskStatus.pending
        return
    stages = await ordered_stages(db, stage.workflow_id)

    # Approving a parked AI-stage run means "unblock, run it again";
    # approving a checkpoint (non-AI stage) means "human did the work, advance".
    parked = run.outcome in (TaskRunOutcome.needs_human_input, TaskRunOutcome.blocked, TaskRunOutcome.failed)
    if parked and stage.is_ai_executable:
        await enter_stage(db, task, stage, stages)
        return

    nxt = next_stage_of(stages, stage)
    if nxt is None:
        await _finish_task(db, task, project)
    else:
        await enter_stage(db, task, nxt, stages)


async def _finish_task(db: AsyncSession, task: Task, project: Project) -> None:
    """Mark a task done with the full changelog/progress/auto-QA epilogue."""
    task.status = TaskStatus.done
    db.add(ChangelogEntry(
        project_id=project.id,
        message=f"Completed: {task.title}",
        type=ChangelogType.added,
    ))
    await db.flush()
    await db.refresh(project, ["tasks"])
    progress = await recalculate_progress(db, project)
    if project.tasks and all(t.status == TaskStatus.done for t in project.tasks) \
            and project.status == ProjectStatus.running:
        project.status = ProjectStatus.qa
        await ws_manager.broadcast(project.id, {
            "type": "project.status_changed", "status": ProjectStatus.qa.value,
        })
    await ws_manager.broadcast(project.id, {
        "type": "task.updated", "task": {"id": task.id, "status": task.status.value},
    })
    await ws_manager.broadcast(project.id, {"type": "agent.progress", "progress": progress})


async def _has_deploy_target(db: AsyncSession, project: Project) -> bool:
    """Deployment runs only when the project has a repo and a deploy environment."""
    if not project.repo_url:
        return False
    from models.integration import DeployEnvironment
    result = await db.execute(
        select(DeployEnvironment.id).where(
            DeployEnvironment.organization_id == project.organization_id,
            DeployEnvironment.is_active.is_(True),
            (DeployEnvironment.project_id.is_(None)) | (DeployEnvironment.project_id == project.id),
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None
