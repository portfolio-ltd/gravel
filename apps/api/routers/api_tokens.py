from fastapi import APIRouter

from config import settings
from dependencies import DB, CurrentUser
from schemas.api_token import (
    ApiTokenCreate,
    ApiTokenCreated,
    ApiTokenOut,
    DeviceDecision,
    DeviceInfo,
    DevicePoll,
    DeviceStart,
    DeviceStartOut,
)
from services import api_tokens

router = APIRouter(tags=["api-tokens"])


@router.get("/users/me/tokens", response_model=list[ApiTokenOut])
async def list_tokens(current_user: CurrentUser, db: DB):
    return await api_tokens.list_tokens(db, current_user)


@router.post("/users/me/tokens", response_model=ApiTokenCreated, status_code=201)
async def create_token(body: ApiTokenCreate, current_user: CurrentUser, db: DB):
    row, plaintext = await api_tokens.mint(db, current_user, body.name, body.expires_in_days)
    return ApiTokenCreated(**ApiTokenOut.model_validate(row).model_dump(), token=plaintext)


@router.delete("/users/me/tokens/{token_id}", status_code=204)
async def revoke_token(token_id: str, current_user: CurrentUser, db: DB):
    await api_tokens.revoke(db, current_user, token_id)


# Device login — start and token are unauthenticated (the client has no token yet);
# looking up and deciding a code needs a signed-in user in the web app.

@router.post("/auth/device/start", response_model=DeviceStartOut)
async def device_start(body: DeviceStart, db: DB):
    row, device_code = await api_tokens.start_device(db, body.client_name)
    uri = f"{settings.WEB_BASE_URL.rstrip('/')}/cli"
    return DeviceStartOut(
        device_code=device_code, user_code=row.user_code,
        verification_uri=uri, verification_uri_complete=f"{uri}?code={row.user_code}",
        interval=api_tokens.DEVICE_POLL_SECONDS, expires_in=int(api_tokens.DEVICE_TTL.total_seconds()),
    )


@router.post("/auth/device/token")
async def device_token(body: DevicePoll, db: DB):
    return await api_tokens.poll_device(db, body.device_code)


@router.post("/auth/device/decision", response_model=DeviceInfo)
async def device_decision(body: DeviceDecision, current_user: CurrentUser, db: DB):
    return await api_tokens.decide(db, current_user, body.user_code, body.approve)


@router.get("/auth/device/{user_code}", response_model=DeviceInfo)
async def device_info(user_code: str, current_user: CurrentUser, db: DB):
    return await api_tokens.find_by_user_code(db, user_code)
