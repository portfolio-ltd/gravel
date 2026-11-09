from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.session import get_db
from dependencies import DB, CurrentOrg, CurrentUser, get_current_runtime
from models.engineer import EngineerRuntime
from schemas.runner import RunnerJobOut, RunnerJobPoll, RunnerJobResult, RunnerRegister, RunnerRegistered
from services import runners

router = APIRouter(tags=["runners"])


@router.post("/runners/register", response_model=RunnerRegistered, status_code=201)
async def register(body: RunnerRegister, current_user: CurrentUser, org: CurrentOrg, db: DB):
    """`gravel work` calls this with the user's API token to become a local runner."""
    runtime, engineer, token = await runners.register(
        db, current_user, org.id, host_label=body.host_label, executor=body.executor, scope=body.scope,
        engineer_id=body.engineer_id, engineer_name=body.engineer_name, account=body.account,
    )
    return RunnerRegistered(
        runtime_id=runtime.id, engineer_id=engineer.id, engineer_name=engineer.name, runtime_token=token,
        scope=runtime.scope, account=runtime.account_label, poll_interval_seconds=settings.RUNTIME_POLL_INTERVAL_SECONDS,
        heartbeat_interval_seconds=settings.RUNTIME_HEARTBEAT_INTERVAL_SECONDS,
    )


# Runner-facing endpoints — authenticated by the runtime token register returned

@router.post("/agent/runner/stop", status_code=204)
async def stop(db: AsyncSession = Depends(get_db), runtime: EngineerRuntime = Depends(get_current_runtime)):
    await runners.stop(db, runtime)


@router.post("/agent/poll-next-job", response_model=RunnerJobPoll)
async def poll_next_job(db: AsyncSession = Depends(get_db), runtime: EngineerRuntime = Depends(get_current_runtime)):
    """A model call waiting for this runner's owner (keyless projects), if any."""
    job = await runners.claim_job(db, runtime)
    return RunnerJobPoll(job=RunnerJobOut.model_validate(job, from_attributes=True) if job else None)


@router.post("/agent/jobs/{job_id}/result", status_code=204)
async def job_result(job_id: str, body: RunnerJobResult, db: AsyncSession = Depends(get_db),
                     runtime: EngineerRuntime = Depends(get_current_runtime)):
    await runners.complete_job(db, runtime, job_id, text=body.text, error=body.error,
                               tokens_in=body.tokens_in, tokens_out=body.tokens_out)
