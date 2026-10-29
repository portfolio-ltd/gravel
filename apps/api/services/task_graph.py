"""Task graph: dependencies between the tasks of a project.

A task's `depends_on` lists tasks in the same project that must be done before
it is queued. Edges are validated to stay inside the project and acyclic.
Starting the agent queues only ready tasks; when a task finishes, dependents
that became ready are queued, so independent tasks run in parallel (one run
each, claimed by whichever runtime is free) and dependent ones wait.
"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.project import Project, ProjectStatus
from models.task import Task, TaskStatus


async def project_tasks(db: AsyncSession, project_id: str) -> dict[str, Task]:
    rows = (await db.execute(select(Task).where(Task.project_id == project_id))).scalars()
    return {t.id: t for t in rows}


def _has_path(edges: dict[str, list[str]], start: str, goal: str) -> bool:
    """Is `goal` reachable from `start` along depends_on edges?"""
    stack, seen = [start], set()
    while stack:
        node = stack.pop()
        if node == goal:
            return True
        if node in seen:
            continue
        seen.add(node)
        stack.extend(edges.get(node, []))
    return False


async def set_dependencies(db: AsyncSession, task: Task, depends_on: list[str]) -> None:
    """Replace a task's dependencies, rejecting foreign ids and cycles."""
    wanted = list(dict.fromkeys(i for i in depends_on if i))
    if task.id in wanted:
        raise HTTPException(400, "A task cannot depend on itself")
    tasks = await project_tasks(db, task.project_id)
    unknown = [i for i in wanted if i not in tasks]
    if unknown:
        raise HTTPException(400, f"Dependencies must be tasks in the same project: {unknown}")
    edges = {t.id: list(t.depends_on or []) for t in tasks.values()}
    for dep in wanted:
        if _has_path(edges, dep, task.id):
            raise HTTPException(400, f"Depending on '{tasks[dep].title}' would create a cycle")
    task.depends_on = wanted or None


def link_by_index(tasks: list[Task], raw: list[dict]) -> None:
    """Wire depends_on from parsed task dicts that name 1-based list positions.

    Out-of-range numbers and edges that would close a cycle are dropped, so a
    sloppy model answer still yields a valid graph.
    """
    edges: dict[str, list[str]] = {t.id: [] for t in tasks}
    for task, item in zip(tasks, raw):
        for ref in item.get("depends_on") or []:
            try:
                idx = int(ref) - 1
            except (TypeError, ValueError):
                continue
            if not 0 <= idx < len(tasks) or tasks[idx] is task:
                continue
            dep = tasks[idx].id
            if dep in edges[task.id] or _has_path(edges, dep, task.id):
                continue
            edges[task.id].append(dep)
    for task in tasks:
        task.depends_on = edges[task.id] or None


def waiting_on(task: Task, tasks: dict[str, Task]) -> list[Task]:
    """Dependencies that are not done yet (deleted ones are ignored)."""
    return [tasks[i] for i in task.depends_on or [] if i in tasks and tasks[i].status != TaskStatus.done]


def is_ready(task: Task, tasks: dict[str, Task]) -> bool:
    return not waiting_on(task, tasks)


async def queue_task(db: AsyncSession, task: Task, project: Project) -> bool:
    """Put a task on its first stage/phase. False when it already has an open run."""
    from models.task_run import TaskRunPhase
    from services import orchestrator

    if project.workflow_id:
        stages = await orchestrator.ordered_stages(db, project.workflow_id)
        if not stages:
            return False
        return await orchestrator.enter_stage(db, task, stages[0], stages) is not None
    return await orchestrator.create_phase_run(db, task, TaskRunPhase.grooming) is not None


async def release_dependents(db: AsyncSession, done_task: Task) -> list[Task]:
    """A task finished: queue the dependents that are now ready.

    Only while the project is running — a project still in setup hasn't been
    started, and its tasks wait for the user to press Run.
    """
    project = await db.get(Project, done_task.project_id)
    if project is None or project.status != ProjectStatus.running:
        return []
    tasks = await project_tasks(db, done_task.project_id)
    started = []
    for task in tasks.values():
        if done_task.id not in (task.depends_on or []) or task.status != TaskStatus.pending:
            continue
        if task.workflow_stage_id or not is_ready(task, tasks):
            continue  # already moving, or still waiting on something else
        if await queue_task(db, task, project):
            started.append(task)
    return started


async def forget_task(db: AsyncSession, task: Task) -> None:
    """Drop a deleted task from its siblings' dependencies."""
    for other in (await project_tasks(db, task.project_id)).values():
        if other.id != task.id and task.id in (other.depends_on or []):
            other.depends_on = [i for i in other.depends_on if i != task.id] or None
