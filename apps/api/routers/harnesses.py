"""Agent harnesses: CRUD, built-in templates, and a bundle preview."""
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from db.base import new_uuid
from dependencies import DB, CurrentOrg, CurrentUser
from models.harness import HARNESS_EXECUTORS, AgentHarness
from schemas.harness import (
    HarnessFromTemplate,
    HarnessIn,
    HarnessOut,
    HarnessPreviewOut,
    HarnessTemplateOut,
    HarnessUpdate,
)
from services import harness as harness_svc
from services import subagents
from services.sdlc import STAGE_ROLES

router = APIRouter(prefix="/harnesses", tags=["harnesses"])


def _out(h: AgentHarness) -> HarnessOut:
    return HarnessOut(
        id=h.id, organization_id=h.organization_id, owner_id=h.owner_id, name=h.name, description=h.description,
        template_key=h.template_key, executor=h.executor, roles=list(h.roles or []), agents=h.agents or {},
        routing=h.routing or {}, instructions_markdown=h.instructions_markdown, test_gate=h.test_gate,
        max_review_rounds=h.max_review_rounds, max_turns=h.max_turns, allowed_tools=h.allowed_tools,
        disallowed_tools=h.disallowed_tools, is_default=h.is_default, created_at=h.created_at, updated_at=h.updated_at,
    )


async def _one(db, harness_id: str, org) -> AgentHarness:
    h = await db.get(AgentHarness, harness_id)
    if not h or h.organization_id != org.id:
        raise HTTPException(404, "Harness not found")
    return h


async def _clear_default(db, org_id: str, keep_id: str | None) -> None:
    for other in (await db.execute(select(AgentHarness).where(
            AgentHarness.organization_id == org_id, AgentHarness.is_default.is_(True)))).scalars():
        if other.id != keep_id:
            other.is_default = False


def _check_executor(value: str) -> str:
    if value not in HARNESS_EXECUTORS:
        raise HTTPException(400, f"executor must be one of {', '.join(HARNESS_EXECUTORS)}")
    return value


def _check_roles(roles: list[str]) -> list[str]:
    bad = [r for r in roles if r not in STAGE_ROLES]
    if bad:
        raise HTTPException(400, f"Unknown stage role(s): {', '.join(bad)}")
    return roles


@router.get("", response_model=list[HarnessOut])
async def list_harnesses(current_user: CurrentUser, org: CurrentOrg, db: DB):
    rows = (await db.execute(select(AgentHarness).where(AgentHarness.organization_id == org.id)
                             .order_by(AgentHarness.is_default.desc(), AgentHarness.name))).scalars()
    return [_out(h) for h in rows]


@router.get("/templates", response_model=list[HarnessTemplateOut])
async def list_templates(current_user: CurrentUser):
    return [HarnessTemplateOut(key=key, name=t["name"], description=t["description"], executor=t["executor"],
                               roles=list(t["roles"]), agents=list(t["agents"].keys()), test_gate=t["test_gate"],
                               max_turns=t["max_turns"])
            for key, t in harness_svc.TEMPLATES.items()]


@router.get("/builtin-preview", response_model=HarnessPreviewOut)
async def builtin_preview(current_user: CurrentUser, role: str = "build"):
    """The bundle files a run gets with no harness configured (the built-in defaults)."""
    role = role if role in STAGE_ROLES else "custom"
    return HarnessPreviewOut(role=role, files=subagents.bundle_files(role, None, None))


@router.post("/from-template", response_model=HarnessOut, status_code=201)
async def create_from_template(body: HarnessFromTemplate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    if body.template_key not in harness_svc.TEMPLATES:
        raise HTTPException(404, "Unknown harness template")
    fields = harness_svc.template_fields(body.template_key)
    if body.name:
        fields["name"] = body.name.strip()[:200]
    h = AgentHarness(id=new_uuid(), organization_id=org.id, owner_id=current_user.id, is_default=body.make_default,
                     **fields)
    if body.make_default:
        await _clear_default(db, org.id, None)
    db.add(h)
    await db.flush()
    return _out(h)


@router.post("", response_model=HarnessOut, status_code=201)
async def create_harness(body: HarnessIn, current_user: CurrentUser, org: CurrentOrg, db: DB):
    try:
        agents = harness_svc.validate_agents({k: v.model_dump() for k, v in body.agents.items()})
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    h = AgentHarness(
        id=new_uuid(), organization_id=org.id, owner_id=current_user.id, name=body.name.strip(),
        description=body.description, executor=_check_executor(body.executor), roles=_check_roles(body.roles),
        agents=agents, routing=body.routing, instructions_markdown=body.instructions_markdown,
        test_gate=body.test_gate, max_review_rounds=body.max_review_rounds, max_turns=body.max_turns,
        allowed_tools=body.allowed_tools, disallowed_tools=body.disallowed_tools, is_default=body.is_default,
    )
    if body.is_default:
        await _clear_default(db, org.id, None)
    db.add(h)
    await db.flush()
    return _out(h)


@router.get("/{harness_id}", response_model=HarnessOut)
async def get_harness(harness_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    return _out(await _one(db, harness_id, org))


@router.patch("/{harness_id}", response_model=HarnessOut)
async def update_harness(harness_id: str, body: HarnessUpdate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    h = await _one(db, harness_id, org)
    fields = body.model_dump(exclude_unset=True)
    if "agents" in fields and fields["agents"] is not None:
        try:
            fields["agents"] = harness_svc.validate_agents(fields["agents"])
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    if "executor" in fields and fields["executor"] is not None:
        _check_executor(fields["executor"])
    if "roles" in fields and fields["roles"] is not None:
        _check_roles(fields["roles"])
    if fields.get("is_default"):
        await _clear_default(db, org.id, h.id)
    for key, value in fields.items():
        if value is None and key in ("name", "executor", "roles", "agents", "routing", "test_gate",
                                     "max_review_rounds", "max_turns", "is_default"):
            continue  # non-nullable columns keep their value
        setattr(h, key, value)
    await db.flush()
    return _out(h)


@router.delete("/{harness_id}", status_code=204)
async def delete_harness(harness_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    h = await _one(db, harness_id, org)
    await db.delete(h)
    await db.flush()


@router.get("/{harness_id}/preview", response_model=HarnessPreviewOut)
async def preview_harness(harness_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB, role: str = "build"):
    """The .gravel/ files a run of `role` would receive with this harness (no code graph, so no gate commands)."""
    h = await _one(db, harness_id, org)
    role = role if role in STAGE_ROLES else "custom"
    return HarnessPreviewOut(role=role, files=subagents.bundle_files(role, None, h))
