import os
import shutil
from pathlib import Path
from fastapi import HTTPException, UploadFile

from config import settings

ALLOWED_PRD_TYPES = {"application/pdf", "text/plain", "text/markdown", "text/x-markdown"}
ALLOWED_DESIGN_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


def _upload_dir(project_id: str) -> Path:
    p = Path(settings.UPLOAD_DIR) / project_id
    p.mkdir(parents=True, exist_ok=True)
    return p


async def save_upload(file: UploadFile, project_id: str, allowed_types: set[str]) -> dict:
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{file.content_type}'. Allowed: {allowed_types}",
        )
    dest = _upload_dir(project_id) / (file.filename or "upload")
    size = 0
    with dest.open("wb") as f:
        while chunk := await file.read(65536):
            size += len(chunk)
            if size > MAX_SIZE_BYTES:
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File exceeds 20 MB limit.")
            f.write(chunk)
    return {
        "file_path": str(dest),
        "filename": file.filename,
        "size": size,
        "content_type": file.content_type,
    }


def delete_upload(file_path: str) -> None:
    p = Path(file_path)
    if p.exists():
        p.unlink()
