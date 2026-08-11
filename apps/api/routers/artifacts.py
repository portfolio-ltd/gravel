import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

import services.task_run_service as run_svc
from config import settings
from dependencies import get_current_org, get_current_user, get_db
from models.task_run import ArtifactType
from models.user import User
from schemas.task_run import ArtifactOut

router = APIRouter(prefix="/artifacts", tags=["artifacts"])

ALLOWED_ARTIFACT_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "text/plain", "application/json"}
MAX_SIZE = 20 * 1024 * 1024


@router.post("/upload", response_model=ArtifactOut, status_code=201)
async def upload_artifact(
    task_run_id: str = Form(...),
    artifact_type: ArtifactType = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org=Depends(get_current_org),
):
    from routers.task_runs import _run_in_org_or_404
    await _run_in_org_or_404(db, task_run_id, org)
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "File exceeds 20 MB limit")

    rel_path = os.path.join("artifacts", task_run_id, file.filename or "artifact")
    abs_path = os.path.join(settings.UPLOAD_DIR, rel_path)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "wb") as f:
        f.write(content)

    # Store the path relative to UPLOAD_DIR so it maps 1:1 onto the /uploads static mount
    return await run_svc.create_artifact(db, task_run_id, artifact_type, rel_path, file.filename or "artifact")
