from fastapi import APIRouter, HTTPException
from dependencies import CurrentUser, DB, require_roles
from models.user import User, UserRole
from schemas.user import UserOut, UserUpdate, ApiKeysIn, ApiKeysMasked, InviteUserRequest
from services.auth import hash_password, get_user_by_email
from services.users import (
    list_users, get_user, update_user, deactivate_user,
    save_api_keys, get_masked_keys,
)
import secrets

router = APIRouter(prefix="/users", tags=["users"])

AdminOnly = require_roles(UserRole.admin)


@router.get("", response_model=list[UserOut])
async def list_all_users(db: DB, _: User = AdminOnly):  # type: ignore[assignment]
    return await list_users(db)


@router.get("/{user_id}", response_model=UserOut)
async def get_user_by_id(user_id: str, current_user: CurrentUser, db: DB):
    if current_user.id != user_id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def patch_user(user_id: str, body: UserUpdate, current_user: CurrentUser, db: DB):
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Non-admin can only update their own name
    if current_user.role != UserRole.admin:
        if current_user.id != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        body.role = None  # non-admins cannot change role
    return await update_user(db, user, body.name, body.role)


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: str, current_user: CurrentUser, db: DB, _: User = AdminOnly):  # type: ignore[assignment]
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself.")
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await deactivate_user(db, user)


@router.post("/invite", response_model=UserOut, status_code=201)
async def invite_user(body: InviteUserRequest, db: DB, _: User = AdminOnly):  # type: ignore[assignment]
    if await get_user_by_email(db, body.email):
        raise HTTPException(status_code=400, detail="Email already registered.")
    user = User(
        name=body.name,
        email=body.email.lower(),
        hashed_password=hash_password(secrets.token_urlsafe(16)),
        role=body.role,
        is_active=False,
    )
    db.add(user)
    await db.flush()
    return user


@router.put("/{user_id}/api-keys", status_code=204)
async def save_keys(user_id: str, body: ApiKeysIn, current_user: CurrentUser, db: DB):
    if current_user.id != user_id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    save_api_keys(user, body)
    db.add(user)


@router.get("/{user_id}/api-keys", response_model=ApiKeysMasked)
async def get_keys(user_id: str, current_user: CurrentUser, db: DB):
    if current_user.id != user_id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = await get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return get_masked_keys(user)
