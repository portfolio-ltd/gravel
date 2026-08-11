from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException

from dependencies import DB, CurrentUser
from models.user import User, UserRole
from schemas.auth import (
    AccessTokenResponse,
    EmailTokenRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenResponse,
)
from schemas.user import UserOut
from services.auth import (
    create_access_token,
    create_email_token,
    create_refresh_token,
    decode_email_token,
    get_user_by_email,
    get_user_by_id,
    hash_password,
    revoke_all_refresh_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password,
)
from services.email import send_password_reset_email, send_verification_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=201)
async def signup(body: SignupRequest, background_tasks: BackgroundTasks, db: DB):
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
    # Best-effort verification email — signup never fails on email trouble
    background_tasks.add_task(
        send_verification_email, user.email, create_email_token(user.id, "verify_email")
    )
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


# ── Email verification ────────────────────────────────────────────────────────

@router.post("/verify-email")
async def verify_email(body: EmailTokenRequest, db: DB):
    user_id = decode_email_token(body.token, "verify_email")
    user = await get_user_by_id(db, user_id) if user_id else None
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link.")
    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(timezone.utc)
        await db.flush()
    return {"detail": "Email verified", "email": user.email}


@router.post("/resend-verification", status_code=202)
async def resend_verification(current_user: CurrentUser, background_tasks: BackgroundTasks):
    if current_user.email_verified_at is not None:
        return {"detail": "Email already verified"}
    background_tasks.add_task(
        send_verification_email, current_user.email,
        create_email_token(current_user.id, "verify_email"),
    )
    return {"detail": "Verification email sent"}


# ── Password reset ────────────────────────────────────────────────────────────

@router.post("/forgot-password", status_code=202)
async def forgot_password(body: ForgotPasswordRequest, background_tasks: BackgroundTasks, db: DB):
    # Same response either way — no account enumeration
    user = await get_user_by_email(db, body.email)
    if user and user.is_active:
        background_tasks.add_task(
            send_password_reset_email, user.email,
            create_email_token(user.id, "reset_password"),
        )
    return {"detail": "If that account exists, a reset email is on its way."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: DB):
    user_id = decode_email_token(body.token, "reset_password")
    user = await get_user_by_id(db, user_id) if user_id else None
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    user.hashed_password = hash_password(body.password)
    # A reset also proves mailbox ownership; log out every existing session
    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(timezone.utc)
    await revoke_all_refresh_tokens(db, user.id)
    await db.flush()
    return {"detail": "Password updated — sign in with your new password."}
