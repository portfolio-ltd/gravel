"""Uploaded file storage under UPLOAD_DIR.

Client-supplied filenames are never trusted as paths: every stored file gets
a sanitized name with a random prefix, and every read/delete is confined to
UPLOAD_DIR. Files are served only through authenticated endpoints.
"""
import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from config import settings

ALLOWED_PRD_TYPES = {"application/pdf", "text/plain", "text/markdown", "text/x-markdown"}
ALLOWED_DESIGN_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
ALLOWED_ARTIFACT_TYPES = {
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "text/plain", "text/markdown", "text/csv", "application/json",
    "application/xml", "text/xml", "application/pdf",
}
# Browsers often send logs/reports without a useful content type
_GENERIC_TYPES = {"", "application/octet-stream"}
_TEXT_SUFFIXES = {".log", ".txt", ".json", ".xml", ".md", ".csv"}
MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


def _root() -> Path:
    root = Path(settings.UPLOAD_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def safe_filename(name: str | None) -> str:
    base = Path(name or "upload").name  # drop any directory components
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._") or "upload"
    return base[-120:]


def resolve_stored(file_path: str) -> Path:
    """Absolute path for a stored file; refuses anything outside UPLOAD_DIR."""
    root = _root()
    p = Path(file_path)
    p = (p if p.is_absolute() else root / p).resolve()
    if root != p and root not in p.parents:
        raise HTTPException(status_code=404, detail="File not found")
    return p


def check_type(file: UploadFile, allowed: set[str]) -> None:
    ctype = (file.content_type or "").split(";")[0].strip()
    if ctype in allowed:
        return
    if ctype in _GENERIC_TYPES and Path(file.filename or "").suffix.lower() in _TEXT_SUFFIXES:
        return
    raise HTTPException(status_code=415, detail=f"Unsupported file type '{ctype or 'unknown'}'.")


async def _write(file: UploadFile, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    with dest.open("wb") as f:
        while chunk := await file.read(65536):
            size += len(chunk)
            if size > MAX_SIZE_BYTES:
                f.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File exceeds 20 MB limit.")
            f.write(chunk)
    return size


async def save_upload(file: UploadFile, project_id: str, allowed_types: set[str]) -> dict:
    check_type(file, allowed_types)
    name = safe_filename(file.filename)
    dest = _root() / safe_filename(project_id) / f"{uuid.uuid4().hex[:8]}-{name}"
    size = await _write(file, dest)
    return {
        "file_path": str(dest),
        "filename": name,
        "size": size,
        "content_type": file.content_type,
    }


async def save_artifact(file: UploadFile, task_run_id: str) -> tuple[str, str]:
    """Store run evidence; returns (path relative to UPLOAD_DIR, display filename)."""
    check_type(file, ALLOWED_ARTIFACT_TYPES)
    name = safe_filename(file.filename)
    rel = Path("artifacts") / safe_filename(task_run_id) / f"{uuid.uuid4().hex[:8]}-{name}"
    await _write(file, _root() / rel)
    return str(rel), name


def delete_stored_file(file_path: str) -> None:
    try:
        resolve_stored(file_path).unlink(missing_ok=True)
    except HTTPException:
        pass


delete_upload = delete_stored_file
