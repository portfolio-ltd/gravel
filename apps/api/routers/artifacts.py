from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

import services.task_run_service as run_svc
from dependencies import get_current_org, get_current_user, get_db
from models.task_run import ArtifactType
from models.user import User
from schemas.task_run import ArtifactOut
from services.storage import resolve_stored, save_artifact

router = APIRouter(prefix="/artifacts", tags=["artifacts"])

# Rendered inline by the browser; anything else downloads (no HTML/SVG inline on the API origin)
_INLINE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".txt", ".log", ".json", ".md", ".csv"}


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
    rel_path, filename = await save_artifact(file, task_run_id)
    return await run_svc.create_artifact(db, task_run_id, artifact_type, rel_path, filename)


@router.get("/{artifact_id}/download")
async def download_artifact(
    artifact_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org=Depends(get_current_org),
):
    from routers.task_runs import _run_in_org_or_404
    art = await run_svc.get_artifact(db, artifact_id)
    if not art:
        raise HTTPException(404, "Artifact not found")
    await _run_in_org_or_404(db, art.task_run_id, org)
    path = resolve_stored(art.file_path)
    if not path.exists():
        raise HTTPException(404, "Artifact file is missing")
    inline = path.suffix.lower() in _INLINE_SUFFIXES
    return FileResponse(
        path, filename=art.filename,
        content_disposition_type="inline" if inline else "attachment",
        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox"},
    )
