from fastapi import APIRouter, HTTPException

import services.workflows as wf_service
from dependencies import DB, CurrentOrg, CurrentUser
from schemas.workflow import (
    StageReorderRequest,
    WorkflowCreate,
    WorkflowOut,
    WorkflowStageCreate,
    WorkflowStageOut,
    WorkflowStageUpdate,
    WorkflowUpdate,
)

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.get("", response_model=list[WorkflowOut])
async def list_workflows(current_user: CurrentUser, org: CurrentOrg, db: DB):
    return await wf_service.list_workflows(db, org.id)


@router.post("", response_model=WorkflowOut, status_code=201)
async def create_workflow(body: WorkflowCreate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    return await wf_service.create_workflow(db, current_user.id, body, organization_id=org.id)


@router.get("/{workflow_id}", response_model=WorkflowOut)
async def get_workflow(workflow_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    wf = await wf_service.get_workflow(db, workflow_id, org.id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    return wf


@router.patch("/{workflow_id}", response_model=WorkflowOut)
async def update_workflow(workflow_id: str, body: WorkflowUpdate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    wf = await wf_service.get_workflow(db, workflow_id, org.id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    return await wf_service.update_workflow(db, wf, body)


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(workflow_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    wf = await wf_service.get_workflow(db, workflow_id, org.id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    await wf_service.delete_workflow(db, wf)


@router.post("/{workflow_id}/stages", response_model=WorkflowStageOut, status_code=201)
async def add_stage(workflow_id: str, body: WorkflowStageCreate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    wf = await wf_service.get_workflow(db, workflow_id, org.id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    return await wf_service.add_stage(db, wf, body)


# NOTE: the literal 'reorder' route must precede '/{stage_id}' — FastAPI matches
# in declaration order, otherwise "reorder" is parsed as a stage_id and 422s
# (this exact bug shipped in DevBoss).
@router.patch("/{workflow_id}/stages/reorder", response_model=WorkflowOut)
async def reorder_stages(workflow_id: str, body: StageReorderRequest, current_user: CurrentUser, org: CurrentOrg, db: DB):
    wf = await wf_service.get_workflow(db, workflow_id, org.id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    return await wf_service.reorder_stages(db, wf, body.stages)


@router.patch("/{workflow_id}/stages/{stage_id}", response_model=WorkflowStageOut)
async def update_stage(workflow_id: str, stage_id: str, body: WorkflowStageUpdate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    wf = await wf_service.get_workflow(db, workflow_id, org.id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    stage = next((s for s in wf.stages if s.id == stage_id), None)
    if not stage:
        raise HTTPException(404, "Stage not found in this workflow")
    return await wf_service.update_stage(db, wf, stage, body)


@router.delete("/{workflow_id}/stages/{stage_id}", status_code=204)
async def delete_stage(workflow_id: str, stage_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    wf = await wf_service.get_workflow(db, workflow_id, org.id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    stage = next((s for s in wf.stages if s.id == stage_id), None)
    if not stage:
        raise HTTPException(404, "Stage not found in this workflow")
    await wf_service.delete_stage(db, stage)
