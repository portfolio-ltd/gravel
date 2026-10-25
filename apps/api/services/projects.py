from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.project import Project, ProjectStatus
from models.user import User, UserRole
from schemas.project import ProjectCreate, ProjectUpdate
from services.github import normalize_repo

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


async def list_projects(db: AsyncSession, organization_id: str | None = None) -> list[Project]:
    q = (
        select(Project)
        .options(selectinload(Project.design_files))
        .order_by(Project.created_at.desc())
    )
    if organization_id:
        q = q.where(Project.organization_id == organization_id)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_project(db: AsyncSession, project_id: str, organization_id: str | None = None) -> Project | None:
    q = (
        select(Project)
        .options(
            selectinload(Project.design_files),
            selectinload(Project.tasks),
            selectinload(Project.changelog),
        )
        .where(Project.id == project_id)
    )
    if organization_id:
        q = q.where(Project.organization_id == organization_id)
    result = await db.execute(q)
    return result.scalar_one_or_none()


async def _check_workflow(db: AsyncSession, workflow_id: str | None, organization_id: str | None) -> None:
    if not workflow_id:
        return
    from models.workflow import Workflow
    found = (await db.execute(select(Workflow.id).where(
        Workflow.id == workflow_id, Workflow.organization_id == organization_id
    ))).scalar_one_or_none()
    if not found:
        raise HTTPException(status_code=400, detail="Workflow not found in this organization")


async def create_project(db: AsyncSession, data: ProjectCreate, owner: User, organization_id: str | None = None) -> Project:
    workflow_id = data.workflow_id
    await _check_workflow(db, workflow_id, organization_id)
    if not workflow_id and data.workflow_template:
        from services.sdlc import workflow_for_template
        workflow_id = (await workflow_for_template(db, data.workflow_template, owner.id, organization_id)).id
    p = Project(
        name=data.name, default_model=data.default_model, owner_id=owner.id,
        organization_id=organization_id,
        repo_url=data.repo_url, default_branch=data.default_branch,
        workflow_id=workflow_id,
        issues_repo=normalize_repo(data.issues_repo) if data.issues_repo else None,
        post_issue_comments=data.post_issue_comments,
    )
    db.add(p)
    await db.flush()
    await db.refresh(p, attribute_names=["design_files"])
    return p


async def update_project(db: AsyncSession, project: Project, data: ProjectUpdate) -> Project:
    if data.repo_url is not None:
        project.repo_url = data.repo_url
    if data.default_branch is not None:
        project.default_branch = data.default_branch
    if data.name is not None:
        project.name = data.name
    if data.default_model is not None:
        project.default_model = data.default_model
    if "workflow_id" in data.model_fields_set and data.workflow_id != project.workflow_id:
        await _check_workflow(db, data.workflow_id, project.organization_id)
        await _guard_workflow_swap(db, project)
        project.workflow_id = data.workflow_id
    if "issues_repo" in data.model_fields_set:
        project.issues_repo = normalize_repo(data.issues_repo) if data.issues_repo else None
    if data.post_issue_comments is not None:
        project.post_issue_comments = data.post_issue_comments
    db.add(project)
    return project


async def _guard_workflow_swap(db: AsyncSession, project: Project) -> None:
    """No mid-flight workflow changes: block while tasks sit on stages."""
    from sqlalchemy import func

    from models.task import Task, TaskStatus
    in_flight = (await db.execute(
        select(func.count()).select_from(Task).where(
            Task.project_id == project.id,
            Task.workflow_stage_id.isnot(None),
            Task.status != TaskStatus.done,
        )
    )).scalar_one()
    if in_flight:
        raise HTTPException(
            status_code=409,
            detail=f"{in_flight} task(s) are mid-workflow — finish or retry them before changing the workflow.",
        )


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
