import hashlib
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import get_db
from models.engineer import EngineerRuntime
from models.user import User, UserRole
from services.auth import decode_access_token, get_user_by_id

bearer = HTTPBearer(auto_error=False)


def hash_runtime_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def get_current_runtime(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EngineerRuntime:
    """Authenticate an engineer runtime by its launch token."""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token_hash = hash_runtime_token(credentials.credentials)
    result = await db.execute(
        select(EngineerRuntime).where(
            EngineerRuntime.runtime_token_hash == token_hash,
            EngineerRuntime.is_active.is_(True),
        )
    )
    runtime = result.scalar_one_or_none()
    if not runtime:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid runtime token")
    return runtime


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = decode_access_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


def require_roles(*roles: UserRole):
    async def _check(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role.value}' is not allowed here.",
            )
        return current_user
    return Depends(_check)


async def get_current_org(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    x_org_id: Annotated[str | None, Header(alias="X-Org-Id")] = None,
) -> "Organization":
    """Resolve the active organization for this request.

    With an X-Org-Id header: the org, if the user is a member (404 otherwise —
    existence-hiding). Without one: the user's personal org (created lazily),
    which keeps every pre-org client working unchanged."""
    from models.organization import Organization, OrganizationMember
    from services.organizations import ensure_personal_org

    if x_org_id:
        result = await db.execute(
            select(Organization)
            .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
            .where(Organization.id == x_org_id, OrganizationMember.user_id == current_user.id)
        )
        org = result.scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        return org
    return await ensure_personal_org(db, current_user)


async def require_org_admin(
    current_user: Annotated[User, Depends(get_current_user)],
    org: Annotated["Organization", Depends(get_current_org)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> "Organization":
    from models.organization import OrgRole
    from services.organizations import get_membership

    membership = await get_membership(db, org.id, current_user.id)
    if not membership or membership.role != OrgRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization admin role required")
    return org


CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]

from models.organization import Organization as _Organization  # noqa: E402

CurrentOrg = Annotated[_Organization, Depends(get_current_org)]
AdminOrg = Annotated[_Organization, Depends(require_org_admin)]
