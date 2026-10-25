"""Organization management. Routes take an explicit {org_id} (you can manage
orgs that aren't the active one); membership is checked against the current
user, and write actions need the org-admin role in THAT org."""
from fastapi import APIRouter, HTTPException

import services.organizations as org_service
from dependencies import DB, CurrentUser
from models.organization import OrgRole
from schemas.organization import (
    MemberAdd,
    MemberRoleUpdate,
    OrgCreate,
    OrgDetail,
    OrgMemberOut,
    OrgOut,
    OrgUpdate,
)

router = APIRouter(prefix="/organizations", tags=["organizations"])


async def _member_org_or_404(db, org_id: str, user):
    org = await org_service.get_org_for_member(db, org_id, user.id)
    if not org:
        raise HTTPException(404, "Organization not found")
    return org


async def _admin_org_or_404(db, org_id: str, user):
    org = await _member_org_or_404(db, org_id, user)
    membership = await org_service.get_membership(db, org_id, user.id)
    if not membership or membership.role != OrgRole.admin:
        raise HTTPException(403, "Organization admin role required")
    return org


def _clean_prefs(prefs: dict | None) -> dict | None:
    import json
    if prefs is not None and len(json.dumps(prefs)) > 16_000:
        raise HTTPException(413, "Appearance settings are too large")
    return prefs


def _detail(org) -> OrgDetail:
    return OrgDetail(
        id=org.id, name=org.name, slug=org.slug, appearance=org.appearance, created_at=org.created_at,
        members=[
            OrgMemberOut(
                user_id=m.user_id, name=m.user.name, email=m.user.email,
                role=m.role, joined_at=m.created_at,
            )
            for m in org.members
        ],
    )


@router.get("", response_model=list[OrgOut])
async def list_my_orgs(current_user: CurrentUser, db: DB):
    rows = await org_service.list_user_orgs(db, current_user.id)
    return [
        OrgOut(id=o.id, name=o.name, slug=o.slug, role=role, member_count=count,
               appearance=o.appearance, created_at=o.created_at)
        for o, role, count in rows
    ]


@router.post("", response_model=OrgOut, status_code=201)
async def create_org(body: OrgCreate, current_user: CurrentUser, db: DB):
    org = await org_service.create_org(db, current_user, body.name)
    return OrgOut(id=org.id, name=org.name, slug=org.slug, role=OrgRole.admin, member_count=1, created_at=org.created_at)


@router.get("/{org_id}", response_model=OrgDetail)
async def get_org(org_id: str, current_user: CurrentUser, db: DB):
    org = await _member_org_or_404(db, org_id, current_user)
    return _detail(org)


@router.patch("/{org_id}", response_model=OrgDetail)
async def update_org(org_id: str, body: OrgUpdate, current_user: CurrentUser, db: DB):
    org = await _admin_org_or_404(db, org_id, current_user)
    if body.name is not None:
        org.name = body.name
    if "appearance" in body.model_fields_set:
        org.appearance = _clean_prefs(body.appearance)
    await db.flush()
    return _detail(org)


@router.delete("/{org_id}", status_code=204)
async def delete_org(org_id: str, current_user: CurrentUser, db: DB):
    org = await _admin_org_or_404(db, org_id, current_user)
    await org_service.delete_org(db, org, current_user)


@router.get("/{org_id}/token-summary")
async def org_token_summary(org_id: str, current_user: CurrentUser, db: DB):
    await _member_org_or_404(db, org_id, current_user)
    from services.token_usage import summary_for_org
    return await summary_for_org(db, org_id)


@router.post("/{org_id}/members", response_model=OrgDetail, status_code=201)
async def add_member(org_id: str, body: MemberAdd, current_user: CurrentUser, db: DB):
    org = await _admin_org_or_404(db, org_id, current_user)
    await org_service.add_member(db, org, body.email, body.name, body.role)
    return _detail(await _member_org_or_404(db, org_id, current_user))


@router.patch("/{org_id}/members/{user_id}", response_model=OrgDetail)
async def update_member_role(org_id: str, user_id: str, body: MemberRoleUpdate, current_user: CurrentUser, db: DB):
    org = await _admin_org_or_404(db, org_id, current_user)
    await org_service.set_member_role(db, org, user_id, body.role)
    return _detail(await _member_org_or_404(db, org_id, current_user))


@router.delete("/{org_id}/members/{user_id}", status_code=204)
async def remove_member(org_id: str, user_id: str, current_user: CurrentUser, db: DB):
    # Self-removal (leave) is allowed for members; everything else needs admin
    if user_id == current_user.id:
        org = await _member_org_or_404(db, org_id, current_user)
    else:
        org = await _admin_org_or_404(db, org_id, current_user)
    await org_service.remove_member(db, org, user_id)
