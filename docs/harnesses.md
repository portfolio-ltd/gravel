# Agent harnesses

A **harness** is the editable part of "the graph inside a run": how a stage
run is wrapped before an agent executes it.

| A harness decides | Applies to |
|---|---|
| Which **subagents** the run may delegate to (name, description, prompt, tools, model, roles) | Claude Code executor (`--agents`) |
| How work is **routed** between them, per stage role | every executor (`SUBAGENTS.md`) |
| Whether the project's tests **gate** a code-writing run | Claude Code executor (Stop hook) |
| The **review-round stop rule** inside a build run | every executor (routing text) |
| **Turn limit** and **allowed / disallowed tools** | Claude Code executor (`--max-turns`, `--allowedTools`, `--disallowedTools`) |
| **Extra instructions** appended to every run's stage instructions | every executor, including the in-process one |

## Resolution order

A run picks its harness as follows:

1. The harness **pinned to the workflow stage** (Workflows → stage → Harness).
2. Otherwise the organization's **default** harness (Harnesses → Make default).
3. Otherwise Gravel's **built-in** harness for the stage's role
   (`apps/api/services/subagents.py`): explorer for the thinking stages;
   explorer, parallel implementers, test runner and fresh-context reviewer for
   build; test runner and per-criterion checkers for verify.

Every run records which harness it used (`TaskRun.harness_id`), and the task's
Activity tab shows it.

## Built-in templates

| Template | What it changes |
|---|---|
| **Spec-driven** | The built-in harness as an editable copy. |
| **Solo agent** | No subagents; the main agent does everything. Cheapest; good for small tasks and executors without subagent support. |
| **Parallel build** | Build stages fan the plan out to one implementer per independent piece, all at once. |
| **Review-heavy** | Adds a security reviewer, allows three review rounds. For auth, payments, data access. |
| **Read-only analysis** | For Analyze / Refine / Plan: the agent may read the repository but `Edit`/`Write` are disallowed, 60-turn cap, no test gate. |

Create one from Harnesses → New harness, then edit anything. Blank harnesses
start with no subagents.

## What a run receives

The harness is rendered into the `.gravel/` bundle next to the task:

```
.gravel/
  SUBAGENTS.md         the subagents for this role and the routing between them
  HARNESS.md           the harness's name, limits and extra instructions
  harness.json         executor settings: max_turns, allowed_tools, disallowed_tools,
                       test_gate, max_review_rounds
  claude/agents.json   subagent definitions (Claude Code `--agents`)
  claude/settings.json the test-gate Stop hook (code-writing roles with known test commands)
```

`STAGE_INSTRUCTIONS.md` gains a `## Harness instructions` section when the
harness has extra instructions. The **Preview** tab on a harness shows these
files for any role, exactly as a run would get them (without the test-gate
commands, which come from the project's code graph).

## Subagents

Each subagent has a name (how the main agent delegates to it), a description
(when to use it), a prompt (its own instructions — it starts with a fresh
context), optional `tools`, an optional `model`, and the `roles` it is offered
to (empty = every role). The names Claude Code understands for tools are
`Read`, `Grep`, `Glob`, `Bash`, `Edit`, `Write`, `MultiEdit`, `NotebookEdit`,
`WebFetch`, `WebSearch`.

Routing is markdown per role; the `*` entry covers roles without their own,
and an empty entry falls back to Gravel's routing for that role. When the
harness names a reviewer and `max_review_rounds` is set, the stop rule is
appended automatically.

## Runtime settings

The runtime applies `harness.json` on top of its own environment:

- `GRAVEL_CLAUDE_MAX_TURNS`, when set, is the ceiling — a harness can only
  lower it.
- `GRAVEL_CLAUDE_SUBAGENTS=false` / `GRAVEL_CLAUDE_TEST_GATE=false` turn those
  parts off regardless of the harness.
- The opencode and single-LLM executors read the markdown files only.

## API

```
GET    /api/harnesses                    list (default first)
POST   /api/harnesses                    create
POST   /api/harnesses/from-template      {template_key, name?, make_default?}
GET    /api/harnesses/templates
GET    /api/harnesses/builtin-preview?role=build
GET    /api/harnesses/{id}
PATCH  /api/harnesses/{id}               (is_default: true clears the previous default)
DELETE /api/harnesses/{id}
GET    /api/harnesses/{id}/preview?role=build
PATCH  /api/workflows/{wf}/stages/{stage}   {harness_id}
```
