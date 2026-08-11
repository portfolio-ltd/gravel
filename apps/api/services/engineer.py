from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.base import new_uuid
from models.engineer import Engineer, EngineerRuntime, EngineerStatus
from models.task_run import TaskRun
from models.user import User
from services import runtime_manager

STALE_HEARTBEAT_SECONDS = 90


async def list_engineers(db: AsyncSession, organization_id: str | None = None) -> list[Engineer]:
    q = select(Engineer)
    if organization_id:
        q = q.where(Engineer.organization_id == organization_id)
    result = await db.execute(q)
    engineers = result.scalars().all()
    for eng in engineers:
        await db.refresh(eng, ["runtimes"])
        _update_status(eng)
    return list(engineers)


async def get_engineer(db: AsyncSession, engineer_id: str, organization_id: str | None = None) -> Engineer | None:
    q = select(Engineer).where(Engineer.id == engineer_id)
    if organization_id:
        q = q.where(Engineer.organization_id == organization_id)
    result = await db.execute(q)
    eng = result.scalar_one_or_none()
    if eng:
        await db.refresh(eng, ["runtimes"])
        _update_status(eng)
    return eng


async def create_engineer(db: AsyncSession, owner_id: str, name: str, template: str,
                          skills_markdown: str | None,
                          model_provider: str = "anthropic",
                          model_name: str = "claude-sonnet-4-6",
                          organization_id: str | None = None) -> Engineer:
    eng = Engineer(
        id=new_uuid(),
        name=name,
        template=template,
        skills_markdown=skills_markdown,
        status=EngineerStatus.idle,
        owner_id=owner_id,
        organization_id=organization_id,
        model_provider=model_provider,
        model_name=model_name,
    )
    db.add(eng)
    await db.flush()
    await db.refresh(eng, attribute_names=["runtimes"])
    return eng


async def update_engineer(db: AsyncSession, engineer_id: str, organization_id: str | None = None, **kwargs) -> Engineer | None:
    eng = await get_engineer(db, engineer_id, organization_id)
    if not eng:
        return None
    for k, v in kwargs.items():
        if v is not None:
            setattr(eng, k, v)
    await db.flush()
    return eng


async def delete_engineer(db: AsyncSession, engineer_id: str, organization_id: str | None = None) -> bool:
    eng = await get_engineer(db, engineer_id, organization_id)
    if not eng:
        return False
    await stop_engineer(db, engineer_id, organization_id)
    await db.delete(eng)
    await db.flush()
    return True


async def launch_engineer(db: AsyncSession, engineer_id: str, owner: User, organization_id: str | None = None) -> tuple[EngineerRuntime, str] | None:
    """Create a runtime row and start its container. Returns (runtime, plaintext token)."""
    eng = await get_engineer(db, engineer_id, organization_id)
    if not eng:
        return None
    runtime = EngineerRuntime(
        id=new_uuid(),
        engineer_id=engineer_id,
        started_at=datetime.now(timezone.utc),
        is_active=True,
    )
    db.add(runtime)
    await db.flush()
    token = await runtime_manager.start_runtime(db, eng, runtime, owner)
    eng.status = EngineerStatus.running
    await db.flush()
    return runtime, token


async def stop_engineer(db: AsyncSession, engineer_id: str, organization_id: str | None = None) -> bool:
    eng = await get_engineer(db, engineer_id, organization_id)
    if not eng:
        return False
    now = datetime.now(timezone.utc)
    for rt in eng.runtimes:
        if rt.is_active:
            await _deactivate_runtime(db, rt, now)
    eng.status = EngineerStatus.stopped
    await db.flush()
    return True


async def heartbeat(db: AsyncSession, runtime_id: str) -> EngineerRuntime | None:
    result = await db.execute(select(EngineerRuntime).where(EngineerRuntime.id == runtime_id))
    rt = result.scalar_one_or_none()
    if not rt:
        return None
    rt.last_heartbeat_at = datetime.now(timezone.utc)
    await db.flush()
    return rt


async def stop_runtime(db: AsyncSession, runtime_id: str) -> EngineerRuntime | None:
    result = await db.execute(select(EngineerRuntime).where(EngineerRuntime.id == runtime_id))
    rt = result.scalar_one_or_none()
    if not rt:
        return None
    await _deactivate_runtime(db, rt, datetime.now(timezone.utc))
    await db.flush()
    return rt


async def restart_runtime(db: AsyncSession, runtime_id: str, owner: User, organization_id: str | None = None) -> tuple[EngineerRuntime, str] | None:
    """Relaunch a stopped runtime row with a fresh container and token."""
    result = await db.execute(select(EngineerRuntime).where(EngineerRuntime.id == runtime_id))
    rt = result.scalar_one_or_none()
    if not rt:
        return None
    eng = await get_engineer(db, rt.engineer_id, organization_id)
    if not eng:
        return None
    if rt.is_active:
        await _deactivate_runtime(db, rt, datetime.now(timezone.utc))
    rt.is_active = True
    rt.stopped_at = None
    rt.started_at = datetime.now(timezone.utc)
    rt.last_heartbeat_at = None
    token = await runtime_manager.start_runtime(db, eng, rt, owner)
    eng.status = EngineerStatus.running
    await db.flush()
    return rt, token


async def _deactivate_runtime(db: AsyncSession, rt: EngineerRuntime, now: datetime) -> None:
    await runtime_manager.stop_runtime_container(rt)
    rt.is_active = False
    rt.stopped_at = now
    rt.runtime_token_hash = None
    # Requeue whatever run this runtime had claimed so another worker can pick it up
    if rt.current_task_run_id:
        run = await db.get(TaskRun, rt.current_task_run_id)
        if run and run.outcome is None:
            run.claimed_at = None
            run.last_heartbeat_at = None
        rt.current_task_run_id = None


def _update_status(eng: Engineer) -> None:
    """Sync engineer status based on runtime health."""
    active = [r for r in eng.runtimes if r.is_active]
    if not active:
        if eng.status == EngineerStatus.running:
            eng.status = EngineerStatus.stopped
        return
    stale_threshold = datetime.now(timezone.utc) - timedelta(seconds=STALE_HEARTBEAT_SECONDS)
    for rt in active:
        hb = rt.last_heartbeat_at
        if hb is not None and hb.tzinfo is None:
            hb = hb.replace(tzinfo=timezone.utc)
        if hb and hb < stale_threshold:
            eng.status = EngineerStatus.error
            return
    eng.status = EngineerStatus.running
