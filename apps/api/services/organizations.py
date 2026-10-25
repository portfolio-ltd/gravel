import re

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.base import new_uuid
from models.organization import Organization, OrganizationMember, OrgRole
from models.project import Project
from models.user import User


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "org"


async def _unique_slug(db: AsyncSession, base: str) -> str:
    slug = base
    n = 1
    while (await db.execute(select(Organization.id).where(Organization.slug == slug))).scalar_one_or_none():
        n += 1
        slug = f"{base}-{n}"
    return slug


async def ensure_personal_org(db: AsyncSession, user: User) -> Organization:
    """Idempotent: the user's first org (creating a personal one if none).

    Called at signup/invite and as the fallback when no X-Org-Id is sent."""
    row = (await db.execute(
        select(Organization)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(OrganizationMember.user_id == user.id)
        .order_by(OrganizationMember.created_at)
        .limit(1)
    )).scalar_one_or_none()
    if row:
        return row

    org = Organization(
        id=new_uuid(),
        name=f"{user.name}'s Org",
        slug=await _unique_slug(db, f"personal-{user.id[:8]}"),
    )
    db.add(org)
    await db.flush()
    db.add(OrganizationMember(
        id=new_uuid(), organization_id=org.id, user_id=user.id, role=OrgRole.admin,
    ))
    await db.flush()
    return org


async def list_user_orgs(db: AsyncSession, user_id: str) -> list[tuple[Organization, OrgRole, int]]:
    """(org, my role, member_count) for every org the user belongs to."""
    rows = (await db.execute(
        select(Organization, OrganizationMember.role)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(OrganizationMember.user_id == user_id)
        .order_by(Organization.created_at)
    )).all()
    result = []
    for org, role in rows:
        count = (await db.execute(
            select(func.count()).select_from(OrganizationMember)
            .where(OrganizationMember.organization_id == org.id)
        )).scalar_one()
        result.append((org, role, count))
    return result


async def get_membership(db: AsyncSession, org_id: str, user_id: str) -> OrganizationMember | None:
    return (await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    )).scalar_one_or_none()


async def get_org_for_member(db: AsyncSession, org_id: str, user_id: str) -> Organization | None:
    """The org, only if the user is a member (existence-hiding otherwise)."""
    return (await db.execute(
        select(Organization)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(Organization.id == org_id, OrganizationMember.user_id == user_id)
        .options(selectinload(Organization.members).selectinload(OrganizationMember.user))
        .execution_options(populate_existing=True)  # refresh members after add/remove in-session
    )).scalar_one_or_none()


async def create_org(db: AsyncSession, user: User, name: str) -> Organization:
    org = Organization(id=new_uuid(), name=name, slug=await _unique_slug(db, slugify(name)))
    db.add(org)
    await db.flush()
    db.add(OrganizationMember(
        id=new_uuid(), organization_id=org.id, user_id=user.id, role=OrgRole.admin,
    ))
    await db.flush()
    return org


async def delete_org(db: AsyncSession, org: Organization, user: User) -> None:
    project_count = (await db.execute(
        select(func.count()).select_from(Project).where(Project.organization_id == org.id)
    )).scalar_one()
    if project_count:
        raise HTTPException(400, f"Organization still has {project_count} project(s) — move or delete them first")

    my_org_count = (await db.execute(
        select(func.count()).select_from(OrganizationMember).where(OrganizationMember.user_id == user.id)
    )).scalar_one()
    if my_org_count <= 1:
        raise HTTPException(400, "You cannot delete your only organization")

    await db.delete(org)
    await db.flush()


async def add_member(db: AsyncSession, org: Organization, email: str, name: str | None, role: OrgRole) -> OrganizationMember:
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user:
        # Invite semantics: create an inactive account the person can claim
        import secrets

        from services.auth import hash_password
        user = User(
            name=name or email.split("@")[0],
            email=email,
            hashed_password=hash_password(secrets.token_urlsafe(16)),
            is_active=False,
        )
        db.add(user)
        await db.flush()
        await ensure_personal_org(db, user)

    existing = await get_membership(db, org.id, user.id)
    if existing:
        raise HTTPException(400, f"{email} is already a member")
    member = OrganizationMember(
        id=new_uuid(), organization_id=org.id, user_id=user.id, role=role,
    )
    db.add(member)
    await db.flush()
    return member


async def _admin_count(db: AsyncSession, org_id: str) -> int:
    return (await db.execute(
        select(func.count()).select_from(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.role == OrgRole.admin,
        )
    )).scalar_one()


async def set_member_role(db: AsyncSession, org: Organization, member_user_id: str, role: OrgRole) -> OrganizationMember:
    member = await get_membership(db, org.id, member_user_id)
    if not member:
        raise HTTPException(404, "Member not found")
    if member.role == OrgRole.admin and role != OrgRole.admin and await _admin_count(db, org.id) <= 1:
        raise HTTPException(400, "An organization needs at least one admin")
    member.role = role
    await db.flush()
    return member


async def remove_member(db: AsyncSession, org: Organization, member_user_id: str) -> None:
    member = await get_membership(db, org.id, member_user_id)
    if not member:
        raise HTTPException(404, "Member not found")
    if member.role == OrgRole.admin and await _admin_count(db, org.id) <= 1:
        raise HTTPException(400, "An organization needs at least one admin")
    await db.delete(member)
    await db.flush()
