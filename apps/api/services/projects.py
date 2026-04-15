from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.project import Project, ProjectStatus
from models.user import User, UserRole
from schemas.project import ProjectCreate, ProjectUpdate

STATUS_ORDER = [
    ProjectStatus.setup,
    ProjectStatus.running,
    ProjectStatus.qa,
    ProjectStatus.review,
    ProjectStatus.done,
    ProjectStatus.deployed,
]


def _next_status(current: ProjectStatus) -> ProjectStatus | None:
    idx = STATUS_ORDER.index(current)
    if idx + 1 >= len(STATUS_ORDER):
        return None
    return STATUS_ORDER[idx + 1]


async def list_projects(db: AsyncSession) -> list[Project]:
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.design_files))
        .order_by(Project.created_at.desc())
    )
    return list(result.scalars().all())


async def get_project(db: AsyncSession, project_id: str) -> Project | None:
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.design_files),
            selectinload(Project.tasks),
            selectinload(Project.changelog),
        )
        .where(Project.id == project_id)
    )
    return result.scalar_one_or_none()


async def create_project(db: AsyncSession, data: ProjectCreate, owner: User) -> Project:
    p = Project(name=data.name, default_model=data.default_model, owner_id=owner.id)
    db.add(p)
    await db.flush()
    return p


async def update_project(db: AsyncSession, project: Project, data: ProjectUpdate) -> Project:
    if data.name is not None:
        project.name = data.name
    if data.default_model is not None:
        project.default_model = data.default_model
    db.add(project)
    return project


async def delete_project(db: AsyncSession, project: Project) -> None:
    await db.delete(project)


async def advance_project(db: AsyncSession, project: Project, current_user: User) -> Project:
    next_s = _next_status(project.status)
    if next_s is None:
        raise HTTPException(status_code=400, detail="Project is already deployed.")

    # ── Transition guards (tasks.md §2.4.7) ──────────────────────────────────
    if project.status == ProjectStatus.setup:
        if not project.tasks:
            raise HTTPException(status_code=400, detail="Cannot start build: add at least one task first.")

    if project.status == ProjectStatus.running:
        done_tasks = [t for t in project.tasks if t.status.value == "done"]
        if not done_tasks:
            raise HTTPException(status_code=400, detail="Cannot move to QA: at least one task must be done.")

    if project.status == ProjectStatus.review:
        if current_user.role not in (UserRole.admin, UserRole.developer):
            raise HTTPException(status_code=403, detail="Only admin or developer can approve review.")

    if project.status == ProjectStatus.done:
        if current_user.role not in (UserRole.admin, UserRole.devops):
            raise HTTPException(status_code=403, detail="Only admin or devops can deploy.")

    project.status = next_s
    db.add(project)
    return project
