# Gravel

Gravel is a platform for running an AI engineering team from one dashboard.
Upload a PRD, let AI parse it into tasks, then let containerized AI engineers
groom, build, test, and deploy each task — with a human approval gate between
every phase.

It is a multi-tenant rewrite of [DevBoss](https://github.com/devbosshub/devboss)
with extras DevBoss doesn't have: JWT auth with refresh rotation, a five-role
team model, BYOK (bring-your-own-key) encrypted per-user LLM keys, real
organization tenancy, and a Next.js App Router frontend with a public landing
page.

Beyond the core engine, Gravel ships the full DevBoss overhaul feature set:

- **Custom workflows** (`/workflows`) — user-defined stage pipelines per
  project: ordered stages with assigned engineers, AI/manual execution,
  post-stage review gates, and rework loops (max attempts + rework target).
  Projects without a workflow use the default 4-phase pipeline.
- **Organizations** (`/organizations`) — real team tenancy. Every resource
  belongs to an org; members share it; org admins manage members and tags.
  A personal org is created at signup; the header switcher (X-Org-Id header)
  selects the active org, defaulting to your personal org.
- **PRD documents** (`/prds`) — org-level markdown PRDs with a status
  lifecycle, a real LLM chat (BYOK) that can propose apply-able body edits,
  AI task-splitting via the parser, and convert-to-tasks into any projects.
- **Tags** — org-scoped colored labels on tasks and PRDs, managed on the org
  page, filterable on the board.
- **Token tracking** — every LLM call (in-process executor, parser, PRD chat,
  and runtime self-reports) lands in a usage ledger with cost estimates
  (`services/token_usage.py` holds the price map). Summaries per task,
  project, PRD, and org; an "LLM Spend" card sits in the workspace metrics.

## Architecture

```
apps/
  web/       Next.js 15 dashboard (App Router, Tailwind, React Query, dnd-kit)
  api/       FastAPI + SQLAlchemy 2 async + Alembic (Postgres or SQLite)
  runtime/   Engineer runtime container: polls the API, clones the repo,
             runs opencode against a task bundle, pushes branches, opens PRs
```

**How a task flows:**

```
grooming ──gate──▶ build ──gate──▶ testing ──gate──▶ deployment ──▶ done
                                       └──(no deploy target)──▶ done
```

Every phase runs as a `TaskRun`. When a phase completes (or an engineer gets
stuck), the run parks behind a human approval gate: it appears on the
Attention page, the board card, and the task slide-over with Approve/Reject
buttons. Approving queues the next phase.

Work is executed by whichever is available:

- **Engineer runtimes** (Docker containers, launched from the Engineers page)
  poll `/api/agent/poll-next-task`, clone the project repo, execute the phase
  with `opencode`, push a task branch, open a PR after build, and report a
  structured outcome. Each runtime authenticates with a one-time launch token.
- **The in-process executor** picks up runs when no runtime is active — one
  LLM call per phase using the owner's BYOK key (or simulated output with no
  key), so the whole workflow is demoable with zero setup.

## Quick start (Docker)

```bash
cp .env.example .env     # then set SECRET_KEY + ENCRYPTION_KEY
docker compose up --build -d
```

- Web: http://localhost:3000
- API docs: http://localhost:8000/docs
- Demo login: `admin@gravel.dev` / `demo1234` (see `apps/api/seed.py`)

The compose stack runs Postgres 16, Redis (WebSocket fan-out across API
workers), the API, and the web app. Engineer containers are launched by the
API through the mounted Docker socket — not by compose.

## Quick start (local dev, no Docker)

```bash
make setup          # venv + npm install + .env wiring
make migrate        # alembic upgrade head (SQLite by default)
make seed
make api            # uvicorn on :8000
make web            # next dev on :3000 (separate terminal)
```

Without Docker, set `RUNTIME_MODE=simulated` (default is `docker`) so engineer
launches skip containers and the in-process executor does the work.

## First end-to-end run

1. Sign in as `admin@gravel.dev` / `demo1234`.
2. Settings → API Keys: add an Anthropic/OpenAI/Groq key (BYOK, encrypted at rest).
3. Integrations → Source control: add a GitHub token; test the connection.
4. Projects → New project → upload a PRD → Parse → confirm the task list.
5. Connect a repo to the project (Repository card on the project page).
6. Engineers → create one (pick provider/model) → Launch.
7. Run agent on the project; watch tasks move on the Board.
8. Approve each gate from the Attention page or the task slide-over.

## Tests

```bash
cd apps/api && .venv/bin/python -m pytest tests/ -q   # 13 tests: auth, scoping, gates, runtime protocol
cd apps/web && npm test                               # vitest
```

CI (`.github/workflows/ci.yml`) runs ruff + pytest, tsc + vitest + next build,
and Docker image builds on every push/PR.

## Configuration

All settings live in the root `.env` (see `.env.example`). Notable:

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | `sqlite+aiosqlite:///./gravel.db` or `postgresql+asyncpg://…` |
| `DATABASE_SSL` | set `require` for managed Postgres (Supabase etc.) |
| `REDIS_URL` | enables cross-worker WebSocket broadcast |
| `SECRET_KEY` / `ENCRYPTION_KEY` | JWT signing / Fernet for BYOK keys & tokens — set fixed values or sessions and stored keys break on restart |
| `RUNTIME_MODE` | `docker` (real engineer containers) or `simulated` |
| `RUNTIME_API_BASE_URL` | how runtime containers reach the API |

## Security notes

- Runtime containers authenticate with a per-launch bearer token (SHA-256
  hash stored, plaintext only in the container env).
- BYOK keys, GitHub tokens, and deploy configs are Fernet-encrypted at rest.
- All list/board/metrics endpoints are scoped to the authenticated owner.
- Mounting the Docker socket into the API container is root-equivalent on the
  host; use `RUNTIME_MODE=simulated` where that is unacceptable.
