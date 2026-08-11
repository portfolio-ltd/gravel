from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.base import new_uuid
from models.engineer import Engineer
from models.project import Project
from models.task import Task, TaskStatus
from models.workflow import Workflow, WorkflowStage
from schemas.workflow import (
    StageReorderItem,
    WorkflowCreate,
    WorkflowStageCreate,
    WorkflowStageUpdate,
    WorkflowUpdate,
)


async def list_workflows(db: AsyncSession, organization_id: str) -> list[Workflow]:
    result = await db.execute(
        select(Workflow)
        .options(selectinload(Workflow.stages))
        .where(Workflow.organization_id == organization_id)
        .order_by(Workflow.created_at.desc())
    )
    return list(result.scalars().all())


async def get_workflow(db: AsyncSession, workflow_id: str, organization_id: str | None = None) -> Workflow | None:
    q = select(Workflow).options(selectinload(Workflow.stages)).where(Workflow.id == workflow_id)
    if organization_id:
        q = q.where(Workflow.organization_id == organization_id)
    return (await db.execute(q)).scalar_one_or_none()


async def create_workflow(db: AsyncSession, owner_id: str, data: WorkflowCreate, organization_id: str | None = None) -> Workflow:
    dup = (await db.execute(
        select(Workflow.id).where(Workflow.organization_id == organization_id, Workflow.name == data.name)
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(409, f"A workflow named '{data.name}' already exists")

    wf = Workflow(id=new_uuid(), owner_id=owner_id, organization_id=organization_id,
                  name=data.name, description=data.description)
    db.add(wf)
    await db.flush()
    for i, stage in enumerate(data.stages):
        db.add(WorkflowStage(
            id=new_uuid(),
            workflow_id=wf.id,
            name=stage.name,
            stage_order=stage.stage_order if stage.stage_order is not None else i,
            assigned_engineer_id=stage.assigned_engineer_id,
            requires_human_approval=stage.requires_human_approval,
            is_ai_executable=stage.is_ai_executable,
            stage_instructions=stage.stage_instructions,
            max_rework_attempts=stage.max_rework_attempts,
            # Inline rework targets can't reference not-yet-created ids — set via PATCH from the editor
            rework_target_stage_id=None,
        ))
    await db.flush()
    await db.refresh(wf, ["stages"])
    return wf


async def update_workflow(db: AsyncSession, wf: Workflow, data: WorkflowUpdate) -> Workflow:
    if data.name is not None and data.name != wf.name:
        dup = (await db.execute(
            select(Workflow.id).where(
                Workflow.organization_id == wf.organization_id, Workflow.name == data.name, Workflow.id != wf.id
            )
        )).scalar_one_or_none()
        if dup:
            raise HTTPException(409, f"A workflow named '{data.name}' already exists")
        wf.name = data.name
    if data.description is not None:
        wf.description = data.description
    await db.flush()
    return wf


async def delete_workflow(db: AsyncSession, wf: Workflow) -> None:
    in_use = (await db.execute(
        select(func.count()).select_from(Project).where(Project.workflow_id == wf.id)
    )).scalar_one()
    if in_use:
        raise HTTPException(409, f"Workflow is attached to {in_use} project(s) — detach them first")
    await db.delete(wf)
    await db.flush()


async def add_stage(db: AsyncSession, wf: Workflow, data: WorkflowStageCreate) -> WorkflowStage:
    if data.stage_order is None:
        max_order = (await db.execute(
            select(func.max(WorkflowStage.stage_order)).where(WorkflowStage.workflow_id == wf.id)
        )).scalar_one()
        order = (max_order + 1) if max_order is not None else 0
    else:
        order = data.stage_order

    await _validate_stage_refs(db, wf, data.assigned_engineer_id, data.rework_target_stage_id, stage_id=None)

    stage = WorkflowStage(
        id=new_uuid(),
        workflow_id=wf.id,
        name=data.name,
        stage_order=order,
        assigned_engineer_id=data.assigned_engineer_id,
        requires_human_approval=data.requires_human_approval,
        is_ai_executable=data.is_ai_executable,
        stage_instructions=data.stage_instructions,
        max_rework_attempts=data.max_rework_attempts,
        rework_target_stage_id=data.rework_target_stage_id,
    )
    db.add(stage)
    await db.flush()
    return stage


async def update_stage(db: AsyncSession, wf: Workflow, stage: WorkflowStage, data: WorkflowStageUpdate) -> WorkflowStage:
    fields = data.model_dump(exclude_unset=True)  # explicit null clears nullable fields
    if "assigned_engineer_id" in fields or "rework_target_stage_id" in fields:
        await _validate_stage_refs(
            db, wf,
            fields.get("assigned_engineer_id", stage.assigned_engineer_id),
            fields.get("rework_target_stage_id", stage.rework_target_stage_id),
            stage_id=stage.id,
        )
    for key, value in fields.items():
        setattr(stage, key, value)
    await db.flush()
    return stage


async def delete_stage(db: AsyncSession, stage: WorkflowStage) -> None:
    active = (await db.execute(
        select(func.count()).select_from(Task).where(
            Task.workflow_stage_id == stage.id, Task.status != TaskStatus.done
        )
    )).scalar_one()
    if active:
        raise HTTPException(409, f"{active} active task(s) sit on stage '{stage.name}' — move them first")

    # Clear sibling rework targets explicitly — don't rely on FK actions (SQLite create_all)
    siblings = (await db.execute(
        select(WorkflowStage).where(WorkflowStage.rework_target_stage_id == stage.id)
    )).scalars().all()
    for s in siblings:
        s.rework_target_stage_id = None
    await db.delete(stage)
    await db.flush()


async def reorder_stages(db: AsyncSession, wf: Workflow, items: list[StageReorderItem]) -> Workflow:
    stage_by_id = {s.id: s for s in wf.stages}
    unknown = [i.id for i in items if i.id not in stage_by_id]
    if unknown:
        raise HTTPException(400, f"Stage id(s) not in this workflow: {unknown}")
    for item in items:
        stage_by_id[item.id].stage_order = item.stage_order
    await db.flush()
    await db.refresh(wf, ["stages"])
    return wf


async def _validate_stage_refs(
    db: AsyncSession, wf: Workflow,
    engineer_id: str | None, rework_target_id: str | None, stage_id: str | None,
) -> None:
    if engineer_id:
        eng = (await db.execute(
            select(Engineer.id).where(Engineer.id == engineer_id, Engineer.organization_id == wf.organization_id)
        )).scalar_one_or_none()
        if not eng:
            raise HTTPException(400, "Assigned engineer not found")
    if rework_target_id:
        if stage_id and rework_target_id == stage_id:
            raise HTTPException(400, "A stage cannot be its own rework target")
        target = (await db.execute(
            select(WorkflowStage.id).where(
                WorkflowStage.id == rework_target_id, WorkflowStage.workflow_id == wf.id
            )
        )).scalar_one_or_none()
        if not target:
            raise HTTPException(400, "Rework target must be a stage in the same workflow")
