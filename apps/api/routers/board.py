from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

import services.board as board_svc
from dependencies import get_current_org, get_current_user, get_db
from models.organization import Organization
from models.user import User
from schemas.board import AttentionTaskOut, BoardOut, WorkspaceMetrics

router = APIRouter(tags=["board"])


@router.get("/board", response_model=BoardOut)
async def get_board(
    project_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org: Organization = Depends(get_current_org),
):
    return await board_svc.get_board(db, org.id, project_id)


@router.get("/projects/{project_id}/board", response_model=BoardOut)
async def get_project_board(project_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    return await board_svc.get_board(db, org.id, project_id)


@router.get("/overview/attention-tasks", response_model=list[AttentionTaskOut])
async def attention_tasks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    return await board_svc.get_attention_tasks(db, org.id)


@router.get("/overview/metrics", response_model=WorkspaceMetrics)
async def workspace_metrics(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    return await board_svc.get_metrics(db, org.id)
