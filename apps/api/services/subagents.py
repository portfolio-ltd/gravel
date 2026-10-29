"""The graph inside one run: subagents and a test gate for the Claude Code executor.

A stage run is a node in the workflow graph; with Claude Code it can be a
small graph of its own. The bundle carries:

  .gravel/claude/agents.json   — subagent definitions for the stage's role,
                                 passed to `claude --agents`
  .gravel/SUBAGENTS.md         — how to route work between them
  .gravel/HARNESS.md           — which harness wrapped the run and its limits
  .gravel/harness.json         — the executor settings the runtime applies
                                 (turn limit, allowed / disallowed tools)
  .gravel/claude/settings.json — a Stop hook (`claude --settings`) that runs the
  .gravel/claude/test_gate.*     project's test commands once before a
                                 code-writing run may finish

The defaults below are the built-in harness; an organization's own harnesses
(services/harness.py) replace any part of them. Everything lives under
.gravel/, which the runtime keeps out of git, so the user's repository is
never touched. Executors ignore the files they cannot use.
"""
import json

from services.code_graph import gate_commands

_READ_ONLY = ["Read", "Grep", "Glob", "Bash"]

AGENTS: dict[str, dict] = {
    "explorer": {
        "description": "Read-only codebase scout. Use first, to find the files, call paths and conventions "
                       "this task touches before planning or changing anything.",
        "prompt": "Start from .gravel/CODE_MAP.md if it exists: it lists the repository's modules, how they "
                  "depend on each other and which ones this task likely touches. Confirm against the code. "
                  "Return the relevant file paths with one line each on their role, the existing patterns to "
                  "follow, and anything surprising. Do not modify files.",
        "tools": _READ_ONLY,
    },
    "implementer": {
        "description": "Implements one well-scoped, independent piece of the plan (a file or module) with its "
                       "tests. Hand separate pieces to separate implementers so they run in parallel.",
        "prompt": "Implement exactly the piece you were given, following .gravel/docs/PLAN.md when it exists "
                  "and the patterns named there. Add or update tests next to the change. Stay inside your "
                  "piece: never edit files another piece owns, never add scope, never weaken a test. Report "
                  "the files you changed and how you verified them.",
    },
    "test-runner": {
        "description": "Runs the project's test, lint and type-check commands and reports failures concisely.",
        "prompt": "Run the commands listed under Commands in .gravel/CODE_MAP.md (or the ones the project "
                  "documents). Do not fix anything. Report each command, pass/fail, and for failures the "
                  "file:line and the shortest excerpt that explains it.",
        "tools": _READ_ONLY,
    },
    "reviewer": {
        "description": "Fresh-context reviewer. Use after the work is done and before reporting, to check the "
                       "diff against the plan, the acceptance criteria and recorded decisions.",
        "prompt": "Review `git diff` against the default branch. Check it against .gravel/TASK.md (acceptance "
                  "criteria), .gravel/docs/PLAN.md when present, and the decisions in .gravel/KNOWLEDGE.md. "
                  "Report only blocking findings with file:line and why; say 'no blocking findings' when there "
                  "are none. Do not modify files.",
        "tools": _READ_ONLY,
    },
    "criterion-checker": {
        "description": "Checks one acceptance criterion against the implementation and returns Pass/Fail "
                       "with evidence. Run one per criterion, in parallel.",
        "prompt": "You are given one acceptance criterion. Find the code and tests that implement it, run the "
                  "strongest check available, and answer Pass or Fail with the evidence (commands run and the "
                  "relevant output, or file:line). Do not modify files.",
        "tools": _READ_ONLY,
    },
}

# Role → the subagents its runs get. Phase runs map onto the closest role.
ROLE_AGENTS: dict[str, list[str]] = {
    "analyze": ["explorer"],
    "refine": ["explorer"],
    "plan": ["explorer"],
    "build": ["explorer", "implementer", "test-runner", "reviewer"],
    "review": ["explorer", "test-runner"],
    "verify": ["test-runner", "criterion-checker"],
    "deploy": [],
    "custom": ["explorer", "test-runner", "reviewer"],
}
PHASE_ROLES = {"grooming": "analyze", "build": "build", "testing": "verify", "deployment": "deploy"}

# Roles whose runs change code, so they must pass the test gate before finishing
GATED_ROLES = {"build", "custom"}

ROUTING = {
    "build": "1. `explorer` maps what the plan touches.\n"
             "2. Split the plan into independent pieces and give each to its own `implementer`, in parallel. "
             "Pieces that depend on each other go in order; don't split work that can't be separated.\n"
             "3. `test-runner` runs the checks; fix what fails.\n"
             "4. `reviewer` reviews the diff in a fresh context; address blocking findings.\n"
             "Stop rule: at most two review rounds — then report the remaining findings as needs_human_input.",
    "verify": "Run `test-runner` once, then one `criterion-checker` per acceptance criterion, in parallel. "
              "Merge their answers into the verification document yourself.",
    "review": "Use `explorer` to understand the area and `test-runner` for evidence; write the review yourself.",
}

GATE_SCRIPT = '''"""Gravel test gate: a Claude Code Stop hook. Runs the project's test commands
once before the run may finish; failures are fed back to the agent."""
import json
import os
import subprocess
import sys

event = json.load(sys.stdin)
if event.get("stop_hook_active"):
    sys.exit(0)  # already continued once because of this gate — don't loop
root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "test_gate.json")) as f:
    commands = json.load(f)
failures = []
for command in commands:
    cwd = os.path.join(root, command["cwd"])
    if not os.path.isdir(cwd):
        continue
    try:
        proc = subprocess.run(command["run"], shell=True, cwd=cwd, capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        failures.append(f"`{command['run']}` in {command['cwd']} timed out after 10 minutes")
        continue
    if proc.returncode in (126, 127):
        continue  # tool not installed in this environment — nothing to gate on
    if proc.returncode != 0:
        tail = (proc.stdout + proc.stderr)[-3000:]
        failures.append(f"`{command['run']}` in {command['cwd']} failed (exit {proc.returncode}):\\n{tail}")
if failures:
    print("Gravel test gate: the project's tests fail.\\n\\n" + "\\n\\n".join(failures)
          + "\\n\\nFix the failures before finishing, or explain in your result why they are unrelated "
          "to this task.", file=sys.stderr)
    sys.exit(2)
'''


def role_for(stage_role: str | None, phase: str | None) -> str:
    if stage_role:
        return stage_role if stage_role in ROLE_AGENTS else "custom"
    return PHASE_ROLES.get(phase or "", "custom")


def bundle_files(role: str, graph: dict | None, harness=None) -> dict[str, str]:
    """The .gravel/ files that turn one run into a small graph (see module docstring).

    `harness` is an AgentHarness (or None for the built-in one); its resolved
    HarnessConfig decides the subagents, routing, gate and executor limits.
    """
    from services.harness import config_for
    cfg = config_for(harness, role)
    files: dict[str, str] = {}
    if cfg.agents:
        files["claude/agents.json"] = json.dumps(cfg.agents, indent=2)
        routing = cfg.routing
        if cfg.max_review_rounds and any("review" in n for n in cfg.agents) and "Stop rule" not in routing:
            routing += (f"\nStop rule: at most {cfg.max_review_rounds} review round"
                        f"{'s' if cfg.max_review_rounds != 1 else ''} — then report the remaining findings "
                        "as needs_human_input.")
        files["SUBAGENTS.md"] = (
            "# Subagents\n\nThis run can delegate to subagents, each with its own fresh context:\n\n"
            + "\n".join(f"- `{n}` — {a['description']}" for n, a in cfg.agents.items())
            + f"\n\n## How to route the work\n\n{routing}\n\n"
            "You stay responsible for the result: merge what they return, and report through "
            ".gravel/OUTPUT_CONTRACT.md as usual.\n"
        )
    limits = []
    if cfg.max_turns:
        limits.append(f"- Turn limit: {cfg.max_turns}")
    if cfg.allowed_tools:
        limits.append(f"- Allowed tools: {', '.join(cfg.allowed_tools)}")
    if cfg.disallowed_tools:
        limits.append(f"- Disallowed tools: {', '.join(cfg.disallowed_tools)}")
    limits.append(f"- Test gate: {'on' if cfg.test_gate else 'off'}")
    files["HARNESS.md"] = (
        f"# Harness: {cfg.name}\n\n" + (f"{cfg.description}\n\n" if cfg.description else "")
        + f"Subagents: {', '.join(f'`{n}`' for n in cfg.agents) or 'none'}\n\n"
        + "\n".join(limits) + "\n"
        + (f"\n## Extra instructions\n\n{cfg.instructions}\n" if cfg.instructions else "")
    )
    files["harness.json"] = json.dumps(cfg.executor_settings(), indent=2)
    commands = gate_commands(graph)[:4]
    if cfg.test_gate and role in GATED_ROLES and commands:
        files["claude/test_gate.json"] = json.dumps(
            [{"cwd": c["cwd"], "run": c["run"]} for c in commands], indent=2)
        files["claude/test_gate.py"] = GATE_SCRIPT
        files["claude/settings.json"] = json.dumps({"hooks": {"Stop": [{"hooks": [{
            "type": "command",
            "command": 'python3 "$CLAUDE_PROJECT_DIR/.gravel/claude/test_gate.py"',
            "timeout": 1800,
        }]}]}}, indent=2)
    return files
