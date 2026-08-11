from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.engineer import Engineer, EngineerStatus
from models.project import Project
from models.task import Task, TaskStatus
from models.task_run import TaskRun
from schemas.board import AttentionTaskOut, BoardColumn, BoardOut, WorkspaceMetrics
from schemas.task import TaskOut

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


async def get_board(db: AsyncSession, organization_id: str, project_id: str | None = None) -> BoardOut:
    q = select(Task).join(Project, Project.id == Task.project_id).where(Project.organization_id == organization_id)
    if project_id:
        q = q.where(Task.project_id == project_id)
    result = await db.execute(q)
    all_tasks = list(result.scalars().all())

    # A single project with a custom workflow gets stage-named lanes
    if project_id:
        project = await db.get(Project, project_id)
        if project and project.workflow_id:
            from services.orchestrator import ordered_stages
            stages = await ordered_stages(db, project.workflow_id)
            if stages:
                return _stage_board(stages, all_tasks)

    columns = []
    for status in COLUMN_ORDER:
        tasks = [t for t in all_tasks if t.status == status]
        tasks.sort(key=lambda t: t.position)
        columns.append(BoardColumn(
            key=f"status:{status.value}",
            label=STATUS_LABELS[status],
            status=status.value,
            tasks=[TaskOut.model_validate(t) for t in tasks],
        ))
    return BoardOut(columns=columns)


def _stage_board(stages, all_tasks: list[Task]) -> BoardOut:
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
            tasks=[TaskOut.model_validate(t) for t in tasks],
        ))
    done.sort(key=lambda t: t.position)
    columns.append(BoardColumn(
        key="status:done",
        label="Done",
        status=TaskStatus.done.value,
        tasks=[TaskOut.model_validate(t) for t in done],
    ))
    return BoardOut(columns=columns)


async def get_attention_tasks(db: AsyncSession, organization_id: str) -> list[AttentionTaskOut]:
    result = await db.execute(
        select(TaskRun, Task, Project)
        .join(Task, TaskRun.task_id == Task.id)
        .join(Project, Task.project_id == Project.id)
        .where(Project.organization_id == organization_id)
        .where(ATTENTION_FILTER)
        .where(TaskRun.completed_at.isnot(None))
        .order_by(TaskRun.completed_at.desc())
    )
    rows = result.all()
    items = []
    for run, task, project in rows:
        items.append(AttentionTaskOut(
            task_id=task.id,
            task_title=task.title,
            project_id=project.id,
            project_name=project.name,
            run_id=run.id,
            outcome=run.outcome.value if run.outcome else "pending",
            blocking_reason=run.blocking_reason,
            blocked_since=run.completed_at.isoformat() if run.completed_at else "",
        ))
    return items


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
    blocked_count = (await db.execute(
        select(func.count()).select_from(TaskRun)
        .join(Task, Task.id == TaskRun.task_id)
        .join(Project, Project.id == Task.project_id)
        .where(Project.organization_id == organization_id)
        .where(ATTENTION_FILTER)
        .where(TaskRun.completed_at.isnot(None))
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
    )
