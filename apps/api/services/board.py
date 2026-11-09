from datetime import datetime, timedelta, timezone
from statistics import median

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.engineer import Engineer, EngineerStatus
from models.project import Project
from models.sdlc import OpenQuestion, QuestionStatus
from models.task import Task, TaskStatus
from models.task_run import TaskRun, TaskRunOutcome, TaskRunPhase
from models.token_usage import TokenUsage
from models.workflow import WorkflowStage
from schemas.board import (
    AttentionTaskOut,
    BoardColumn,
    BoardOut,
    BoardTaskOut,
    RunningRunOut,
    WorkspaceMetrics,
)

COLUMN_ORDER = [TaskStatus.pending, TaskStatus.in_progress, TaskStatus.qa, TaskStatus.done]

STATUS_LABELS = {
    TaskStatus.pending: "Pending",
    TaskStatus.in_progress: "In Progress",
    TaskStatus.qa: "QA",
    TaskStatus.done: "Done",
}

# A run needs attention while it sits behind an unanswered human gate:
# phase completions awaiting approval, needs_human_input, and blocked.
ATTENTION_FILTER = TaskRun.approval_required.is_(True) & TaskRun.approved_at.is_(None)

# Outcomes that mean "this stage finished its work" (as opposed to stopping for a person or failing)
SUCCESS_OUTCOMES = (
    TaskRunOutcome.grooming_complete, TaskRunOutcome.build_complete,
    TaskRunOutcome.testing_complete, TaskRunOutcome.deployment_complete,
)
PHASE_ORDER = list(TaskRunPhase)
# A claimed run with no heartbeat for this long is shown as quiet (matches runners.RUNNER_STALE)
RUN_STALE = timedelta(seconds=180)
# The "typical duration" hint needs at least this many finished runs of the same stage
TYPICAL_MIN_SAMPLES = 3
TYPICAL_SAMPLE_SIZE = 20


def _aware(dt: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; everything here is stored in UTC."""
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


def _run_seconds(run: TaskRun) -> float | None:
    start = _aware(run.claimed_at) or _aware(run.started_at)
    end = _aware(run.completed_at)
    if not start or not end or end < start:
        return None
    return (end - start).total_seconds()


async def get_board(db: AsyncSession, organization_id: str, project_id: str | None = None) -> BoardOut:
    q = select(Task).join(Project, Project.id == Task.project_id).where(Project.organization_id == organization_id)
    if project_id:
        q = q.where(Task.project_id == project_id)
    result = await db.execute(q)
    all_tasks = list(result.scalars().all())
    enrich = await _enricher(db, all_tasks)

    # A single project with a custom workflow gets stage-named lanes
    if project_id:
        project = await db.get(Project, project_id)
        if project and project.workflow_id:
            from services.orchestrator import ordered_stages
            stages = await ordered_stages(db, project.workflow_id)
            if stages:
                return _stage_board(stages, all_tasks, enrich)

    columns = []
    for status in COLUMN_ORDER:
        tasks = [t for t in all_tasks if t.status == status]
        tasks.sort(key=lambda t: t.position)
        columns.append(BoardColumn(
            key=f"status:{status.value}",
            label=STATUS_LABELS[status],
            status=status.value,
            tasks=[enrich(t) for t in tasks],
        ))
    return BoardOut(columns=columns)


async def _enricher(db: AsyncSession, tasks: list[Task]):
    """Per-task extras for cards: open blocking questions, current stage name, unfinished dependencies."""
    ids = [t.id for t in tasks]
    counts: dict[str, int] = {}
    names: dict[str, str] = {}
    status_of = {t.id: t.status for t in tasks}
    missing = {d for t in tasks for d in t.depends_on or []} - set(status_of)
    if missing:
        rows = await db.execute(select(Task.id, Task.status).where(Task.id.in_(missing)))
        status_of.update({tid: status for tid, status in rows.all()})
    if ids:
        rows = await db.execute(
            select(OpenQuestion.task_id, func.count()).where(
                OpenQuestion.task_id.in_(ids), OpenQuestion.status == QuestionStatus.open,
                OpenQuestion.blocking.is_(True),
            ).group_by(OpenQuestion.task_id)
        )
        counts = {tid: n for tid, n in rows.all()}
        stage_ids = {t.workflow_stage_id for t in tasks if t.workflow_stage_id}
        if stage_ids:
            rows = await db.execute(select(WorkflowStage.id, WorkflowStage.name).where(WorkflowStage.id.in_(stage_ids)))
            names = {sid: name for sid, name in rows.all()}

    def enrich(t: Task) -> BoardTaskOut:
        out = BoardTaskOut.model_validate(t)
        out.open_question_count = counts.get(t.id, 0)
        out.stage_name = names.get(t.workflow_stage_id) if t.workflow_stage_id else None
        out.waiting_on_count = sum(1 for d in t.depends_on or []
                                   if d in status_of and status_of[d] != TaskStatus.done)
        return out
    return enrich


def _stage_board(stages, all_tasks: list[Task], enrich) -> BoardOut:
    done = [t for t in all_tasks if t.status == TaskStatus.done]
    remaining = [t for t in all_tasks if t.status != TaskStatus.done]

    stage_ids = {s.id for s in stages}
    columns = []
    for i, stage in enumerate(stages):
        tasks = [t for t in remaining if t.workflow_stage_id == stage.id]
        if i == 0:  # unstarted tasks (and orphans from deleted stages) land in the first lane
            tasks += [t for t in remaining if t.workflow_stage_id is None or t.workflow_stage_id not in stage_ids]
        tasks.sort(key=lambda t: t.position)
        columns.append(BoardColumn(
            key=f"stage:{stage.id}",
            label=stage.name,
            status=None,
            stage_id=stage.id,
            tasks=[enrich(t) for t in tasks],
        ))
    done.sort(key=lambda t: t.position)
    columns.append(BoardColumn(
        key="status:done",
        label="Done",
        status=TaskStatus.done.value,
        tasks=[enrich(t) for t in done],
    ))
    return BoardOut(columns=columns)


async def get_attention_tasks(db: AsyncSession, organization_id: str) -> list[AttentionTaskOut]:
    result = await db.execute(
        select(TaskRun, Task, Project, Engineer, WorkflowStage)
        .join(Task, TaskRun.task_id == Task.id)
        .join(Project, Task.project_id == Project.id)
        .outerjoin(Engineer, Engineer.id == TaskRun.engineer_id)
        .outerjoin(WorkflowStage, WorkflowStage.id == TaskRun.workflow_stage_id)
        .where(Project.organization_id == organization_id)
        .where(ATTENTION_FILTER)
        .where(TaskRun.completed_at.isnot(None))
        .order_by(TaskRun.completed_at.desc())
    )
    rows = result.all()
    items = []
    for run, task, project, engineer, stage in rows:
        items.append(AttentionTaskOut(
            task_id=task.id,
            task_title=task.title,
            project_id=project.id,
            project_name=project.name,
            run_id=run.id,
            outcome=run.outcome.value if run.outcome else "pending",
            blocking_reason=run.blocking_reason,
            blocked_since=_aware(run.completed_at).isoformat() if run.completed_at else "",
            engineer_id=engineer.id if engineer else None,
            engineer_name=engineer.name if engineer else None,
            stage_name=stage.name if stage else run.phase.value,
        ))
    return items


async def get_running_runs(db: AsyncSession, organization_id: str) -> list[RunningRunOut]:
    """Runs without an outcome yet, oldest first: what the engineers are doing right now."""
    from services.orchestrator import ordered_stages

    rows = (await db.execute(
        select(TaskRun, Task, Project, Engineer, WorkflowStage)
        .join(Task, TaskRun.task_id == Task.id)
        .join(Project, Task.project_id == Project.id)
        .outerjoin(Engineer, Engineer.id == TaskRun.engineer_id)
        .outerjoin(WorkflowStage, WorkflowStage.id == TaskRun.workflow_stage_id)
        .where(Project.organization_id == organization_id)
        .where(TaskRun.outcome.is_(None))
        .order_by(TaskRun.claimed_at.is_(None), TaskRun.started_at.asc())
    )).all()

    now = datetime.now(timezone.utc)
    stage_lists: dict[str, list[WorkflowStage]] = {}
    typical: dict[tuple[str, str], int | None] = {}
    items: list[RunningRunOut] = []
    for run, task, project, engineer, stage in rows:
        index = count = None
        if stage is not None:
            if stage.workflow_id not in stage_lists:
                stage_lists[stage.workflow_id] = await ordered_stages(db, stage.workflow_id)
            ids = [s.id for s in stage_lists[stage.workflow_id]]
            if stage.id in ids:
                index, count = ids.index(stage.id) + 1, len(ids)
            stage_name = stage.name
        else:
            index, count = PHASE_ORDER.index(run.phase) + 1, len(PHASE_ORDER)
            stage_name = run.phase.value

        key = ("stage", stage.id) if stage is not None else ("phase", run.phase.value)
        if key not in typical:
            typical[key] = await _typical_seconds(db, organization_id, run, stage)

        claimed = _aware(run.claimed_at)
        beat = _aware(run.last_heartbeat_at) or claimed
        items.append(RunningRunOut(
            run_id=run.id,
            task_id=task.id,
            task_title=task.title,
            project_id=project.id,
            project_name=project.name,
            engineer_id=engineer.id if engineer else None,
            engineer_name=engineer.name if engineer else None,
            state="running" if claimed else "queued",
            stage_name=stage_name,
            stage_index=index,
            stage_count=count,
            attempt_number=run.attempt_number,
            queued_at=_aware(run.started_at).isoformat(),
            started_at=claimed.isoformat() if claimed else None,
            last_heartbeat_at=beat.isoformat() if beat else None,
            stale=bool(claimed and beat and now - beat > RUN_STALE),
            typical_seconds=typical[key],
        ))
    return items


async def _typical_seconds(db: AsyncSession, organization_id: str, run: TaskRun,
                           stage: WorkflowStage | None) -> int | None:
    """Median duration of the latest successful runs of the same stage (or phase) in this org."""
    q = (
        select(TaskRun)
        .join(Task, TaskRun.task_id == Task.id)
        .join(Project, Task.project_id == Project.id)
        .where(Project.organization_id == organization_id)
        .where(TaskRun.outcome.in_(SUCCESS_OUTCOMES), TaskRun.completed_at.isnot(None))
        .order_by(TaskRun.completed_at.desc())
        .limit(TYPICAL_SAMPLE_SIZE)
    )
    if stage is not None:
        q = q.where(TaskRun.workflow_stage_id == stage.id)
    else:
        q = q.where(TaskRun.workflow_stage_id.is_(None), TaskRun.phase == run.phase)
    durations = [d for d in (_run_seconds(r) for r in (await db.execute(q)).scalars()) if d is not None]
    if len(durations) < TYPICAL_MIN_SAMPLES:
        return None
    return int(median(durations))


async def _weekly(db: AsyncSession, organization_id: str, now: datetime) -> dict:
    """Finished stages, agent time and spend for the last 7 days and the 7 before."""
    week_ago, two_weeks_ago = now - timedelta(days=7), now - timedelta(days=14)
    runs = (await db.execute(
        select(TaskRun)
        .join(Task, TaskRun.task_id == Task.id)
        .join(Project, Task.project_id == Project.id)
        .where(Project.organization_id == organization_id)
        .where(TaskRun.completed_at >= two_weeks_ago)
    )).scalars().all()
    out = {"stages_completed_week": 0, "stages_completed_prev_week": 0,
           "agent_seconds_week": 0, "agent_seconds_prev_week": 0}
    for run in runs:
        suffix = "week" if _aware(run.completed_at) >= week_ago else "prev_week"
        if run.outcome in SUCCESS_OUTCOMES:
            out[f"stages_completed_{suffix}"] += 1
        out[f"agent_seconds_{suffix}"] += int(_run_seconds(run) or 0)

    async def spend(start: datetime, end: datetime) -> float:
        total = (await db.execute(
            select(func.coalesce(func.sum(TokenUsage.cost_usd), 0.0))
            .where(TokenUsage.organization_id == organization_id)
            .where(TokenUsage.created_at >= start, TokenUsage.created_at < end)
        )).scalar_one()
        return round(float(total), 4)

    out["cost_usd_week"] = await spend(week_ago, now + timedelta(seconds=1))
    out["cost_usd_prev_week"] = await spend(two_weeks_ago, week_ago)
    return out


async def get_metrics(db: AsyncSession, organization_id: str) -> WorkspaceMetrics:
    proj_count = (await db.execute(
        select(func.count()).select_from(Project).where(Project.organization_id == organization_id)
    )).scalar_one()
    eng_running = (await db.execute(
        select(func.count()).select_from(Engineer).where(
            Engineer.organization_id == organization_id, Engineer.status == EngineerStatus.running
        )
    )).scalar_one()
    task_count = (await db.execute(
        select(func.count()).select_from(Task)
        .join(Project, Project.id == Task.project_id)
        .where(Project.organization_id == organization_id)
    )).scalar_one()
    blocked_count, oldest_waiting = (await db.execute(
        select(func.count(), func.min(TaskRun.completed_at)).select_from(TaskRun)
        .join(Task, Task.id == TaskRun.task_id)
        .join(Project, Project.id == Task.project_id)
        .where(Project.organization_id == organization_id)
        .where(ATTENTION_FILTER)
        .where(TaskRun.completed_at.isnot(None))
    )).one()
    runs_active = (await db.execute(
        select(func.count()).select_from(TaskRun)
        .join(Task, Task.id == TaskRun.task_id)
        .join(Project, Project.id == Task.project_id)
        .where(Project.organization_id == organization_id)
        .where(TaskRun.outcome.is_(None))
    )).scalar_one()
    from services.token_usage import summary_for_org
    tokens = await summary_for_org(db, organization_id)
    return WorkspaceMetrics(
        total_projects=proj_count,
        engineers_running=eng_running,
        total_tasks=task_count,
        blocked_tasks=blocked_count,
        total_tokens=tokens.tokens_in + tokens.tokens_out,
        total_cost_usd=tokens.cost_usd,
        runs_active=runs_active,
        oldest_waiting_since=_aware(oldest_waiting).isoformat() if oldest_waiting else None,
        **await _weekly(db, organization_id, datetime.now(timezone.utc)),
    )
