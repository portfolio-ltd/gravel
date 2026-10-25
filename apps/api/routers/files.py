from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from dependencies import DB, CurrentOrg, CurrentUser
from models.project import ProjectDesignFile
from services.projects import get_project
from services.storage import ALLOWED_DESIGN_TYPES, ALLOWED_PRD_TYPES, delete_upload, save_upload

router = APIRouter(prefix="/files", tags=["files"])


@router.post("/upload")
async def upload_file(
    project_id: str = Form(...),
    file_type: str = Form("prd"),  # "prd" or "design"
    file: UploadFile = File(...),
    current_user: CurrentUser = None,
    org: CurrentOrg = None,
    db: DB = None,
):
    allowed = ALLOWED_PRD_TYPES if file_type == "prd" else ALLOWED_DESIGN_TYPES
    p = await get_project(db, project_id, organization_id=org.id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    meta = await save_upload(file, project_id, allowed)

    if file_type == "design":
        df = ProjectDesignFile(
            project_id=project_id,
            filename=meta["filename"],
            file_path=meta["file_path"],
        )
        db.add(df)
        await db.flush()
        meta["design_file_id"] = df.id

    if file_type == "prd":
        p.prd_file_path = meta["file_path"]
        db.add(p)

    return meta


@router.delete("/{project_id}/{filename}", status_code=204)
async def delete_file(
    project_id: str,
    filename: str,
    current_user: CurrentUser,
    org: CurrentOrg,
    db: DB,
):
    from sqlalchemy import delete as sql_delete
    if not await get_project(db, project_id, organization_id=org.id):
        raise HTTPException(status_code=404, detail="Project not found")
    from sqlalchemy import select
    result = await db.execute(
        select(ProjectDesignFile).where(
            ProjectDesignFile.project_id == project_id,
            ProjectDesignFile.filename == filename,
        )
    )
    df = result.scalar_one_or_none()
    if df:
        delete_upload(df.file_path)
        await db.execute(sql_delete(ProjectDesignFile).where(ProjectDesignFile.id == df.id))
