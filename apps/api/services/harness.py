"""Agent harnesses: the editable configuration of the graph inside a run.

A run's harness decides which subagents it may delegate to, how work is
routed between them, whether the project's tests gate the run, and the
limits the executor applies (turns, tools). Resolution order for a run:

  1. the stage's pinned harness (WorkflowStage.harness_id)
  2. the organization's default harness (AgentHarness.is_default)
  3. the built-in harness for the stage's role (services/subagents.py)

`config_for()` turns whichever applies into one HarnessConfig that
services/subagents.py renders into the bundle, so every executor sees the
same files whatever the source.
"""
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.harness import HARNESS_EXECUTORS, AgentHarness
from services import subagents

_EDIT_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"]


def _agents(*names: str, **extra: dict) -> dict:
    out = {n: dict(subagents.AGENTS[n]) for n in names}
    out.update(extra)
    return out


# Built-in harnesses. Copying one into an organization makes it editable.
TEMPLATES: dict[str, dict] = {
    "spec-driven": {
        "name": "Spec-driven (recommended)",
        "description": "Gravel's default: an explorer maps the code, implementers work in parallel, a test "
                       "runner checks, a fresh-context reviewer reads the diff, and the project's tests gate "
                       "every code-writing run.",
        "executor": "any",
        "roles": [],
        "agents": {n: dict(a, roles=[r for r, names in subagents.ROLE_AGENTS.items() if n in names])
                   for n, a in subagents.AGENTS.items()},
        "routing": dict(subagents.ROUTING),
        "test_gate": True,
        "max_review_rounds": 2,
        "max_turns": 0,
    },
    "solo": {
        "name": "Solo agent",
        "description": "No subagents: one agent does everything in its own context. Cheapest and simplest; "
                       "good for small tasks and for executors without subagent support.",
        "executor": "any",
        "roles": [],
        "agents": {},
        "routing": {"*": "Work alone. Read the bundle, do the stage, run the tests yourself before reporting."},
        "test_gate": True,
        "max_review_rounds": 0,
        "max_turns": 0,
    },
    "parallel-build": {
        "name": "Parallel build",
        "description": "Build stages fan out: the plan is split into independent pieces and each piece gets "
                       "its own implementer at once. Use when plans name several separable modules.",
        "executor": "claude-code",
        "roles": ["build", "custom"],
        "agents": _agents("explorer", "implementer", "test-runner", "reviewer"),
        "routing": {
            "build": "1. `explorer` maps what the plan touches and lists the pieces the plan separates.\n"
                     "2. Start one `implementer` per independent piece, all at once; give each the exact files "
                     "it owns. Only pieces that share a file go in sequence.\n"
                     "3. `test-runner` runs the checks; fix what fails.\n"
                     "4. `reviewer` reviews the whole diff in a fresh context; address blocking findings.\n",
            "*": "Delegate exploration to `explorer`; do the rest yourself.",
        },
        "test_gate": True,
        "max_review_rounds": 2,
        "max_turns": 0,
    },
    "review-heavy": {
        "name": "Review-heavy",
        "description": "Adds a security reviewer and allows an extra review round. For changes that touch "
                       "auth, payments, data access or anything regulated.",
        "executor": "claude-code",
        "roles": ["build", "review", "custom"],
        "agents": _agents(
            "explorer", "implementer", "test-runner", "reviewer",
            **{"security-reviewer": {
                "description": "Fresh-context security review of the diff: injection, authz gaps, secrets, "
                               "unsafe deserialization, SSRF, and data exposure.",
                "prompt": "Review `git diff` against the default branch for security defects only: injection, "
                          "missing authorization checks, secrets in code, unsafe deserialization, SSRF, "
                          "path traversal, and data exposure. Report findings with file:line, the attack, "
                          "and the fix; say 'no security findings' when there are none. Do not modify files.",
                "tools": list(subagents._READ_ONLY),
                "roles": ["build", "review", "custom"],
            }},
        ),
        "routing": {
            "build": subagents.ROUTING["build"].replace(
                "4. `reviewer` reviews the diff in a fresh context; address blocking findings.",
                "4. `reviewer` and `security-reviewer` review the diff in fresh contexts, in parallel; "
                "address every blocking finding."),
            "review": "Use `explorer` to understand the area, `test-runner` for evidence and "
                      "`security-reviewer` for a security pass; write the review yourself and include "
                      "the security findings verbatim.",
        },
        "test_gate": True,
        "max_review_rounds": 3,
        "max_turns": 0,
    },
    "read-only": {
        "name": "Read-only analysis",
        "description": "For Analyze, Refine and Plan stages: the agent may read the repository but never "
                       "edit it, and runs are capped at 60 turns.",
        "executor": "claude-code",
        "roles": ["analyze", "refine", "plan"],
        "agents": _agents("explorer"),
        "routing": {"*": "Use `explorer` to understand the code; write the documents yourself. Never edit "
                         "repository files — this stage produces documents only."},
        "test_gate": False,
        "max_review_rounds": 0,
        "max_turns": 60,
        "disallowed_tools": list(_EDIT_TOOLS),
    },
}


@dataclass
class HarnessConfig:
    """What services/subagents.py renders into the bundle."""
    id: str | None = None
    name: str = "Built-in"
    description: str = ""
    executor: str = "any"
    agents: dict = field(default_factory=dict)
    routing: str = ""
    instructions: str = ""
    test_gate: bool = True
    max_review_rounds: int = 2
    max_turns: int = 0
    allowed_tools: list[str] | None = None
    disallowed_tools: list[str] | None = None
    builtin: bool = True

    def executor_settings(self) -> dict:
        """The part the runtime applies to its executor (.gravel/harness.json)."""
        return {
            "name": self.name, "executor": self.executor, "max_turns": self.max_turns,
            "allowed_tools": self.allowed_tools or [], "disallowed_tools": self.disallowed_tools or [],
            "test_gate": self.test_gate, "max_review_rounds": self.max_review_rounds,
        }


def template_fields(key: str) -> dict:
    """Column values for a harness copied from a built-in template."""
    t = TEMPLATES[key]
    return {
        "name": t["name"], "description": t["description"], "template_key": key, "executor": t["executor"],
        "roles": list(t["roles"]), "agents": {n: dict(a) for n, a in t["agents"].items()},
        "routing": dict(t["routing"]), "test_gate": t["test_gate"], "max_review_rounds": t["max_review_rounds"],
        "max_turns": t["max_turns"], "allowed_tools": t.get("allowed_tools"),
        "disallowed_tools": t.get("disallowed_tools"), "instructions_markdown": None,
    }


def _agents_for_role(agents: dict, role: str) -> dict:
    """Subagents whose `roles` list is empty or names this role (the list is stripped: Claude Code rejects unknown keys)."""
    out = {}
    for name, spec in (agents or {}).items():
        if not isinstance(spec, dict) or not spec.get("prompt"):
            continue
        roles = spec.get("roles") or []
        if roles and role not in roles:
            continue
        clean = {"description": str(spec.get("description") or name), "prompt": str(spec["prompt"])}
        if spec.get("tools"):
            clean["tools"] = [str(t) for t in spec["tools"]]
        if spec.get("model"):
            clean["model"] = str(spec["model"])
        out[name] = clean
    return out


def _routing_for_role(routing: dict | None, role: str, agents: dict) -> str:
    text = (routing or {}).get(role) or (routing or {}).get("*")
    if text:
        return str(text)
    if agents:
        return subagents.ROUTING.get(role) or "Delegate to these subagents where it helps; do the rest yourself."
    return "Work alone: this harness defines no subagents for this stage."


def builtin_config(role: str) -> HarnessConfig:
    names = subagents.ROLE_AGENTS.get(role, subagents.ROLE_AGENTS["custom"])
    return HarnessConfig(
        name="Built-in", description=f"Gravel's default harness for the {role} role.",
        agents={n: dict(subagents.AGENTS[n]) for n in names},
        routing=subagents.ROUTING.get(role) or "Delegate to these subagents where it helps; do the rest yourself.",
    )


def config_for(harness: AgentHarness | None, role: str) -> HarnessConfig:
    if harness is None:
        return builtin_config(role)
    agents = _agents_for_role(harness.agents or {}, role)
    return HarnessConfig(
        id=harness.id, name=harness.name, description=harness.description or "",
        executor=harness.executor if harness.executor in HARNESS_EXECUTORS else "any",
        agents=agents, routing=_routing_for_role(harness.routing, role, agents),
        instructions=(harness.instructions_markdown or "").strip(),
        test_gate=bool(harness.test_gate), max_review_rounds=int(harness.max_review_rounds or 0),
        max_turns=int(harness.max_turns or 0),
        allowed_tools=[str(t) for t in (harness.allowed_tools or [])] or None,
        disallowed_tools=[str(t) for t in (harness.disallowed_tools or [])] or None,
        builtin=False,
    )


async def default_for_org(db: AsyncSession, organization_id: str | None) -> AgentHarness | None:
    if not organization_id:
        return None
    return (await db.execute(select(AgentHarness).where(
        AgentHarness.organization_id == organization_id, AgentHarness.is_default.is_(True),
    ).limit(1))).scalar_one_or_none()


async def resolve(db: AsyncSession, stage, organization_id: str | None) -> AgentHarness | None:
    """The harness a run of `stage` gets, or None for the built-in one."""
    if stage is not None and getattr(stage, "harness_id", None):
        pinned = await db.get(AgentHarness, stage.harness_id)
        if pinned is not None and pinned.organization_id == organization_id:
            return pinned
    return await default_for_org(db, organization_id)


def validate_agents(agents: dict | None) -> dict:
    """Normalise a user-supplied agents map; raises ValueError on bad shapes."""
    out: dict = {}
    for name, spec in (agents or {}).items():
        key = str(name).strip()
        if not key or len(key) > 60 or not all(c.isalnum() or c in "-_" for c in key):
            raise ValueError(f"Subagent name '{name}' must be 1–60 letters, digits, '-' or '_'")
        if not isinstance(spec, dict) or not str(spec.get("prompt") or "").strip():
            raise ValueError(f"Subagent '{key}' needs a prompt")
        clean = {"description": str(spec.get("description") or "").strip()[:500],
                 "prompt": str(spec["prompt"]).strip()[:20000]}
        for list_key in ("tools", "roles"):
            values = spec.get(list_key)
            if values:
                if not isinstance(values, list):
                    raise ValueError(f"Subagent '{key}': {list_key} must be a list")
                clean[list_key] = [str(v).strip() for v in values if str(v).strip()]
        if spec.get("model"):
            clean["model"] = str(spec["model"]).strip()[:100]
        out[key] = clean
    return out
