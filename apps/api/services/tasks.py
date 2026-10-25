from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.base import new_uuid
from models.project import Project
from models.task import Task, TaskStatus
from schemas.task import TaskCreate, TaskReorderItem, TaskUpdate


async def list_tasks(db: AsyncSession, project_id: str) -> list[Task]:
    result = await db.execute(
        select(Task).where(Task.project_id == project_id).order_by(Task.position)
    )
    return list(result.scalars().all())


async def get_task(db: AsyncSession, task_id: str, project_id: str) -> Task | None:
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.project_id == project_id)
    )
    return result.scalar_one_or_none()


async def create_task(db: AsyncSession, project_id: str, data: TaskCreate) -> Task:
    fields = data.model_dump(exclude={"acceptance_criteria"})
    t = Task(project_id=project_id, **fields)
    if data.acceptance_criteria:
        t.acceptance_criteria = [
            {"id": new_uuid()[:8], "text": c.strip(), "done": False, "source": "human"}
            for c in data.acceptance_criteria if c.strip()
        ]
    t.tags = []  # initialize so serialization never lazy-loads a fresh instance
    db.add(t)
    await db.flush()
    return t


async def update_task(db: AsyncSession, task: Task, data: TaskUpdate) -> Task:
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(task, field, value)
    db.add(task)
    return task


async def delete_task(db: AsyncSession, task: Task) -> None:
    await db.delete(task)


async def reorder_tasks(db: AsyncSession, project_id: str, items: list[TaskReorderItem]) -> None:
    for item in items:
        await db.execute(
            update(Task)
            .where(Task.id == item.id, Task.project_id == project_id)
            .values(position=item.position)
        )


async def recalculate_progress(db: AsyncSession, project: Project) -> int:
    """Recompute project.progress = done_count/total * 100 and persist."""
    total = len(project.tasks)
    if total == 0:
        project.progress = 0
    else:
        done = sum(1 for t in project.tasks if t.status == TaskStatus.done)
        project.progress = int(done / total * 100)
    db.add(project)
    return project.progress
