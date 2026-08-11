from fastapi import APIRouter, HTTPException

from dependencies import DB, CurrentUser
from models.user import User, UserRole
from schemas.auth import (
    AccessTokenResponse,
    LoginRequest,
    RefreshRequest,
    SignupRequest,
    TokenResponse,
)
from schemas.user import UserOut
from services.auth import (
    create_access_token,
    create_refresh_token,
    get_user_by_email,
    hash_password,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=201)
async def signup(body: SignupRequest, db: DB):
    existing = await get_user_by_email(db, body.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")
    try:
        role = UserRole(body.role)
    except ValueError:
        role = UserRole.developer
    user = User(
        name=body.name,
        email=body.email.lower(),
        hashed_password=hash_password(body.password),
        role=role,
    )
    db.add(user)
    await db.flush()
    from services.organizations import ensure_personal_org
    await ensure_personal_org(db, user)
    access = create_access_token(user.id)
    refresh = await create_refresh_token(db, user.id)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: DB):
    user = await get_user_by_email(db, body.email)
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive.")
    access = create_access_token(user.id)
    refresh = await create_refresh_token(db, user.id)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(body: RefreshRequest, db: DB):
    result = await rotate_refresh_token(db, body.refresh_token)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")
    access, new_refresh = result
    return AccessTokenResponse(access_token=access)


@router.post("/logout", status_code=204)
async def logout(body: RefreshRequest, db: DB):
    await revoke_refresh_token(db, body.refresh_token)


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser):
    return current_user
