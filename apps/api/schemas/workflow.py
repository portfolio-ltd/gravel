from datetime import datetime

from pydantic import BaseModel


class WorkflowStageCreate(BaseModel):
    name: str
    stage_order: int | None = None  # None → appended after the current max
    role: str = "custom"
    block_on_open_questions: bool = False
    assigned_engineer_id: str | None = None
    requires_human_approval: bool = False
    is_ai_executable: bool = True
    stage_instructions: str | None = None
    max_rework_attempts: int = 3
    rework_target_stage_id: str | None = None


class WorkflowStageUpdate(BaseModel):
    # Apply with model_dump(exclude_unset=True): an explicit null clears the field
    name: str | None = None
    role: str | None = None
    block_on_open_questions: bool | None = None
    assigned_engineer_id: str | None = None
    requires_human_approval: bool | None = None
    is_ai_executable: bool | None = None
    stage_instructions: str | None = None
    max_rework_attempts: int | None = None
    rework_target_stage_id: str | None = None


class WorkflowStageOut(BaseModel):
    id: str
    workflow_id: str
    name: str
    stage_order: int
    role: str = "custom"
    block_on_open_questions: bool = False
    assigned_engineer_id: str | None
    requires_human_approval: bool
    is_ai_executable: bool
    stage_instructions: str | None
    max_rework_attempts: int
    rework_target_stage_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkflowCreate(BaseModel):
    name: str
    description: str | None = None
    # Inline stages get stage_order = index; rework targets need real ids,
    # so they are set afterwards via PATCH from the editor.
    stages: list[WorkflowStageCreate] = []


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class WorkflowOut(BaseModel):
    id: str
    owner_id: str
    name: str
    description: str | None
    template_key: str | None = None
    created_at: datetime
    updated_at: datetime
    stages: list[WorkflowStageOut] = []

    model_config = {"from_attributes": True}


class WorkflowFromTemplate(BaseModel):
    template_key: str
    name: str | None = None


class StageReorderItem(BaseModel):
    id: str
    stage_order: int


class StageReorderRequest(BaseModel):
    stages: list[StageReorderItem]
