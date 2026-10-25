from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import services.engineer as eng_service
from dependencies import get_current_org, get_current_runtime, get_current_user, get_db
from models.engineer import EngineerRuntime
from models.organization import Organization
from models.user import User
from schemas.engineer import EngineerCreate, EngineerOut, EngineerUpdate, LaunchOut, RuntimeOut

router = APIRouter(prefix="/engineers", tags=["engineers"])


@router.get("", response_model=list[EngineerOut])
async def list_engineers(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    return await eng_service.list_engineers(db, organization_id=org.id)


@router.post("", response_model=EngineerOut, status_code=201)
async def create_engineer(body: EngineerCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    eng = await eng_service.create_engineer(
        db, current_user.id, body.name, body.template, body.skills_markdown,
        body.model_provider, body.model_name, organization_id=org.id,
    )
    await db.refresh(eng, ["runtimes"])
    return eng


@router.get("/{engineer_id}", response_model=EngineerOut)
async def get_engineer(engineer_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    eng = await eng_service.get_engineer(db, engineer_id, organization_id=org.id)
    if not eng:
        raise HTTPException(404, "Engineer not found")
    return eng


@router.patch("/{engineer_id}", response_model=EngineerOut)
async def update_engineer(engineer_id: str, body: EngineerUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    eng = await eng_service.update_engineer(db, engineer_id, organization_id=org.id, **body.model_dump(exclude_none=True))
    if not eng:
        raise HTTPException(404, "Engineer not found")
    return eng


@router.delete("/{engineer_id}", status_code=204)
async def delete_engineer(engineer_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    ok = await eng_service.delete_engineer(db, engineer_id, organization_id=org.id)
    if not ok:
        raise HTTPException(404, "Engineer not found")


@router.post("/{engineer_id}/launch", response_model=LaunchOut, status_code=201)
async def launch_engineer(engineer_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    launched = await eng_service.launch_engineer(db, engineer_id, current_user, organization_id=org.id)
    if not launched:
        raise HTTPException(404, "Engineer not found")
    runtime, token = launched
    return LaunchOut(**RuntimeOut.model_validate(runtime).model_dump(), runtime_token=token)


@router.post("/{engineer_id}/stop", status_code=204)
async def stop_engineer(engineer_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    ok = await eng_service.stop_engineer(db, engineer_id, organization_id=org.id)
    if not ok:
        raise HTTPException(404, "Engineer not found")


@router.post("/runtimes/{runtime_id}/heartbeat", response_model=RuntimeOut)
async def runtime_heartbeat(
    runtime_id: str,
    db: AsyncSession = Depends(get_db),
    runtime: EngineerRuntime = Depends(get_current_runtime),
):
    if runtime.id != runtime_id:
        raise HTTPException(403, "Token does not match this runtime")
    rt = await eng_service.heartbeat(db, runtime_id)
    if not rt:
        raise HTTPException(404, "Runtime not found")
    return rt


@router.post("/runtimes/{runtime_id}/stop", response_model=RuntimeOut)
async def stop_runtime(runtime_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    eng = await _org_runtime_engineer(db, runtime_id, org)
    if not eng:
        raise HTTPException(404, "Runtime not found")
    rt = await eng_service.stop_runtime(db, runtime_id)
    return rt


@router.post("/runtimes/{runtime_id}/restart", response_model=LaunchOut)
async def restart_runtime(runtime_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), org: Organization = Depends(get_current_org)):
    eng = await _org_runtime_engineer(db, runtime_id, org)
    if not eng:
        raise HTTPException(404, "Runtime not found")
    restarted = await eng_service.restart_runtime(db, runtime_id, current_user, organization_id=org.id)
    if not restarted:
        raise HTTPException(404, "Runtime not found")
    runtime, token = restarted
    return LaunchOut(**RuntimeOut.model_validate(runtime).model_dump(), runtime_token=token)


async def _org_runtime_engineer(db: AsyncSession, runtime_id: str, org: Organization):
    from sqlalchemy import select

    from models.engineer import Engineer
    result = await db.execute(
        select(Engineer)
        .join(EngineerRuntime, EngineerRuntime.engineer_id == Engineer.id)
        .where(EngineerRuntime.id == runtime_id, Engineer.organization_id == org.id)
    )
    return result.scalar_one_or_none()
