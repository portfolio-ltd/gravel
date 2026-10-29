# Gravel

**Open-source, spec-driven AI engineering.** Turn a PRD or a backlog of GitHub
issues into analyzed specs, reviewed plans and verified code — with AI
engineers doing the work and a human approving every gate.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/portfolio-ltd/gravel/actions/workflows/ci.yml/badge.svg)](https://github.com/portfolio-ltd/gravel/actions/workflows/ci.yml)

![A task moving through Analyze, Refine spec, Plan, Build, Review and Verify, with a blocking open question answered along the way](docs/images/demo.gif)

<sub>Recorded in simulated mode (`SEED_DEMO=true`, no API key): one task goes
from analysis to done, stopping at each human gate.</sub>

### Screenshots

| | |
|---|---|
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/board-dark.png"><img src="docs/images/board-light.png" alt="Board: lanes follow the workflow stages; cards waiting at a gate show Approve and Request changes"></picture><br>**Board** — lanes are workflow stages; gates are actionable from the card. | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/task-documents-dark.png"><img src="docs/images/task-documents-light.png" alt="A finished task's documents: analysis, spec, technical plan, acceptance scenarios, review and verification"></picture><br>**Documents** — analysis → spec → plan → review → verification, versioned per task. |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/question-gate-dark.png"><img src="docs/images/question-gate-light.png" alt="The Plan gate held back by a blocking open question with an owner"></picture><br>**Open-question gate** — a blocking question holds the plan until a person answers it. | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/attention-dark.png"><img src="docs/images/attention-light.png" alt="Attention page listing decisions waiting across projects"></picture><br>**Attention** — every decision waiting on you, in one place. |

Screenshots follow your GitHub theme (light or dark).

---

## Why Gravel

AI coding agents are fast, but speed without a spec produces confident code
for the wrong problem. Gravel wraps agents in a delivery method that teams
already trust:

- **Nothing is invented.** Gaps become *open questions* with an owner, not
  plausible guesses. Blocking questions hold the plan until a person answers.
- **Plans precede code, and code is checked against the plan.** A review stage
  compares the diff with the plan, the project's recorded decisions and the
  acceptance criteria — and sends the task back to build when it falls short.
- **Project knowledge grounds every run.** Decision records, patterns, glossary
  terms, runbooks, conventions and wiki pages are handed to every engineer
  run, with the external links (designs, tickets, dashboards, specs) attached
  to the project and task. Runs may *propose* new knowledge; humans accept it.
- **Humans approve at the gates you choose.** Every gate shows up on the
  Attention page, the board and the task, with Approve / Request changes.

## How it works

```
 PRD / GitHub issues / an existing repo (mapped into a code graph)
        │
        ▼
 ┌──────────┐   ┌─────────────┐   ┌──────┐   ┌───────┐   ┌────────┐   ┌────────┐
 │ Analyze  │──▶│ Refine spec │──▶│ Plan │──▶│ Build │──▶│ Review │──▶│ Verify │──▶ done
 └──────────┘   └─────────────┘   └──────┘   └───────┘   └────────┘   └────────┘
                      ◆ gate        ◆ gate       ▲          │              ◆ gate
                                  (blocks on     └──────────┘  changes requested
                                   open questions)   rework loop (max attempts)
```

Each stage has a **role** that supplies its default instructions, decides which
documents it produces, and how its result is read:

| Role | Produces | Notes |
|---|---|---|
| Analyze | analysis | Is the request well-defined? Proposes acceptance criteria and open questions. |
| Refine spec | spec | Folds answers and comments into a clear spec; unanswered questions stay open. |
| Plan | plan, scenarios | Prose plan (changes, risks, decisions, out-of-scope) + Gherkin scenario per criterion. |
| Build | code | Implements the approved plan on the task branch, with tests. Opens a PR. |
| Review | review | Checks the change against plan, decisions, patterns and criteria. `changes_requested` loops back to Build. |
| Verify | verification | Evidence that each acceptance criterion holds. |
| Deploy | — | Ships via the project's deploy config. |
| Custom | — | Your own instructions. |

Workflows are fully editable. Three templates ship built in:

- **Spec-driven delivery** (recommended) — the six stages above.
- **Plan, build, review** — a lighter loop for well-specified work.
- **Groom, build, test, deploy** — the classic four-phase pipeline.

See [docs/methodology.md](docs/methodology.md) for the full method,
[docs/knowledge-map.md](docs/knowledge-map.md) for wikilinks, the map and the
Obsidian export, and [docs/harnesses.md](docs/harnesses.md) for agent harnesses.

### Graph engineering

Gravel structures the work as explicit graphs instead of one agent looping on
its own judgment:

- **Workflow graph** — each stage names where a task goes on success (default:
  the next stage) and on failure (its rework target), so workflows can skip,
  branch and loop. A stop rule parks a task that re-enters one stage ten times
  without a human approval.
- **Task graph** — tasks depend on other tasks. Running a project starts only
  the tasks whose dependencies are done; finishing one starts the tasks that
  were waiting on it, so independent work runs in parallel. PRD parsing
  proposes the dependencies.
- **Code graph** — point a project at an existing GitHub repository and Gravel
  maps it: modules, how they import each other (Python, JavaScript/TypeScript,
  Go), stack, build and test commands, entry points, plus an architecture
  overview written with your key. Every run gets `CODE_MAP.md` with the part of
  the graph its task touches, so work on an existing codebase starts from its
  real structure.
- **The graph inside a run** — with the Claude Code executor, a run gets
  subagents for its role (explorer, implementers in parallel, test runner,
  fresh-context reviewer) and a test gate that runs the project's tests before
  a code-writing run may finish.
- **Knowledge map** — knowledge entries link to each other with
  `[[wikilinks]]`; the Map page draws them with the projects, tasks, PRDs,
  external links and code modules they touch, Obsidian-style (local graph,
  backlinks, unresolved links you can create in one click). Export the lot as
  an Obsidian vault, or import a folder of notes.

### Agent harnesses

How a run is wrapped is editable: a **harness** names the subagents a run may
delegate to, how work is routed between them per stage role, whether the
project's tests gate the run, the review-round stop rule, and the executor's
turn and tool limits. Built-in templates (spec-driven, solo, parallel build,
review-heavy, read-only analysis) can be copied and edited; an organization
picks a default and any workflow stage can pin a different one. See
[docs/harnesses.md](docs/harnesses.md).

### Who does the work

- **Engineer runtimes** — Docker containers launched from the Engineers page.
  They poll the API, clone the repo, run an agentic CLI (`opencode`) against a
  task bundle in `.gravel/` (never committed), push the task branch, open PRs
  and report a structured result. See [docs/runtime-protocol.md](docs/runtime-protocol.md).
- **In-process executor** — when no runtime is online, the API runs each stage
  as one structured LLM call using the project owner's own key.
- **Simulated mode** — with no API key at all, stages produce clearly-labelled
  sample output so the complete flow (including gates, questions and rework)
  is demoable offline.

### Bring your own keys

Keys are per user and encrypted at rest. Anthropic is the default provider
(`claude-opus-5-5`); OpenAI and Groq work too. Every LLM call lands in a usage
ledger with cost estimates per task, project, PRD and org.

### More

- **GitHub Issues import** — pull issues into a project as tasks (acceptance
  criteria are lifted from an "Acceptance criteria" section), re-import
  idempotently, and optionally post each stage's result back to the issue.
- **PRDs** — markdown PRDs with an AI chat that proposes edits, and AI task
  splitting into any project.
- **External links** — attach designs, tickets, dashboards and specs to
  projects, tasks, PRDs and knowledge entries; runs get them as `LINKS.md`.
- **Organizations** — real multi-tenant teams, roles, tags.
- **Customizable UI** — light/dark/system theme, accent color, density, radius,
  font, sidebar or top-bar navigation, board card fields; preferences follow
  you across devices, and org admins can set a default accent and brand name.

## Architecture

```
apps/
  web/       Next.js 15 (App Router, Tailwind, React Query) — dashboard + landing
  api/       FastAPI + SQLAlchemy 2 (async) + Alembic — Postgres or SQLite
  runtime/   Engineer runtime container: poll → clone → execute → push → report

          ┌──────────── WebSocket (Redis fan-out) ────────────┐
          ▼                                                    │
   ┌─────────────┐   REST   ┌───────────────────┐   poll / outcome   ┌─────────────────┐
   │  Web (Next) │ ───────▶ │  API (FastAPI)    │ ◀───────────────── │ Engineer runtime │
   └─────────────┘          │  orchestrator     │                    │  (Docker)        │
                            │  in-process exec  │ ── LLM (BYOK) ──▶  └─────────────────┘
                            └─────────┬─────────┘                          │ git push / PR
                                  Postgres                              GitHub
```

Details: [docs/architecture.md](docs/architecture.md).

## Quick start

### Docker Compose

```bash
cp .env.example .env
# set SECRET_KEY and ENCRYPTION_KEY (commands in docs/self-hosting.md)
docker compose up --build -d
```

- Web: http://localhost:3000 · API docs: http://localhost:8000/docs
- Want sample data? `SEED_DEMO=true docker compose up -d` adds demo users
  (`admin@gravel.dev` / `demo1234`) and projects. **Never enable it on a public deployment.**

For production, follow [docs/self-hosting.md](docs/self-hosting.md) — or
[docs/deploy-raspberry-pi.md](docs/deploy-raspberry-pi.md) to run it on a
Raspberry Pi behind Cloudflare Tunnel. Multi-arch images are published to
GHCR with every release.

### Local development

```bash
# API (Python 3.12, uv)
cd apps/api
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/alembic upgrade head && .venv/bin/python seed.py
.venv/bin/uvicorn main:app --reload --port 8000

# Web (Node 22)
cd apps/web
npm ci && npm run dev
```

SQLite is the default database for local dev; set `RUNTIME_MODE=simulated` if
you don't have Docker available for engineer runtimes.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./gravel.db` | SQLAlchemy URL (`postgresql+asyncpg://…` in production) |
| `SECRET_KEY` | random per process | JWT signing key — **set it** |
| `ENCRYPTION_KEY` | random per process | Fernet key for BYOK keys and tokens — **set it** |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS origins for the web app |
| `REDIS_URL` | — | Enables WebSocket fan-out across API workers |
| `DEFAULT_MODEL` | `claude-opus-5-5` | Model used when a stage/engineer/project doesn't name one |
| `RUNTIME_MODE` | `docker` | `docker` launches engineer containers; `simulated` uses the in-process executor only |
| `RUNTIME_IMAGE` | `gravel-engineer:latest` | Engineer runtime image |
| `RUNTIME_EXECUTOR` | `opencode` | How runtimes work a stage: `opencode`, `claude-code` (Anthropic models only) or `llm` |
| `SMTP_HOST` … | — | Email for verification and password reset (links are logged when unset) |
| `SHOW_DOCS` | `true` | Serve `/docs` (turn off in production) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | API origin baked into the web build |

Full list in [.env.example](.env.example).

## Security

- Uploaded evidence is served only through authenticated, org-scoped endpoints.
- `RUNTIME_MODE=docker` mounts the Docker socket into the API container so it
  can launch engineers — treat the API host as privileged, or use `simulated`.
- Engineer runtimes execute AI-written code against your repositories; give
  their GitHub tokens the least scope that works.

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## Roadmap

- Jira and GitLab Issues sync
- Two-way issue status sync and PR review comments
- Per-stage budgets
- More runtime executors (other agent CLIs)
- Plugin points for custom stage roles
- Two-way Obsidian sync (watch a vault folder)

## Contributing

Contributions are welcome — start with [CONTRIBUTING.md](CONTRIBUTING.md) and
please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Good places to begin:
[`good first issue`](https://github.com/portfolio-ltd/gravel/labels/good%20first%20issue)
issues, and [Discussions](https://github.com/portfolio-ltd/gravel/discussions)
for questions and ideas. See [SUPPORT.md](SUPPORT.md) for getting help and
[CHANGELOG.md](CHANGELOG.md) for releases.

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
