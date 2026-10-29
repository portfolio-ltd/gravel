# Working on Gravel with a coding agent

Gravel is open source (Apache-2.0). This file is for AI coding agents working
on this repository — Claude Code reads `CLAUDE.md`, which points here.

## Layout

```
apps/api       FastAPI + SQLAlchemy 2 (async) + Alembic. Python 3.12, uv, ruff, pytest.
apps/web       Next.js 15 App Router + Tailwind + React Query. Node 22, eslint, vitest.
apps/runtime   The engineer runtime container (poll → clone → execute → push → report).
docs/          Methodology, architecture, runtime protocol, harnesses, knowledge map, deploy.
```

## Before you change anything

- Read `docs/architecture.md` (data model, run lifecycle) and, for the part you
  touch, the matching doc: `docs/methodology.md` (stage roles, result
  contract), `docs/runtime-protocol.md` (the `.gravel/` bundle),
  `docs/harnesses.md`, `docs/knowledge-map.md`.
- The orchestrator (`apps/api/services/orchestrator.py`) and the method
  (`apps/api/services/sdlc.py`) are the heart; changes there need tests in
  `apps/api/tests/`.

## Conventions

- **Nothing is invented.** If a requirement is unclear, say so in the PR
  instead of guessing. The product itself is built on that rule.
- **Schema changes** need an Alembic migration in `apps/api/alembic/versions/`
  (next number, `down_revision` set, `downgrade()` written, SQLite-safe via
  `batch_alter_table`) and the model, Pydantic schema and `apps/web/types/index.ts`
  updated together. Tests run `Base.metadata.create_all`, so a migration is not
  exercised by tests — run `alembic upgrade head` locally against a copy of
  `gravel.db`.
- **Org scoping**: every router resolves `CurrentOrg` and checks the entity's
  `organization_id` (projects → `project.organization_id`; tasks via their
  project). A miss is a 404, never a 403, so existence isn't leaked.
- **Route order matters** in FastAPI: literal segments (`/knowledge/export`,
  `/stages/reorder`) must be declared before `/{id}` routes.
- **Bundle files** under `.gravel/` are read by agents that cannot click:
  plain markdown, no wikilinks, nothing that depends on the UI.
- **Web**: pages are client components under `app/(app)/`; data access goes
  through hooks in `hooks/` using `apiFetch`; shared UI lives in
  `components/ui/`. Only Next.js page exports from a `page.tsx` — put shared
  constants in `components/` or `lib/`. Lint is strict (`npm run lint`), no
  unused vars, no `l` as a variable name in Python (ruff E741).
- **No new dependencies** without a reason stated in the PR. The graph
  renderers (`components/graph/`) are hand-written SVG on purpose.
- Keep `CHANGELOG.md` (Unreleased) and the relevant `docs/` page in the same
  PR as the change.

## Checks that must pass (what CI runs)

```bash
cd apps/api && .venv/bin/ruff check . && .venv/bin/python -m pytest -q      # RUNTIME_MODE=simulated
cd apps/runtime && .venv/bin/python -m pytest -q
cd apps/web && npx tsc --noEmit && npm run lint && npm test && npm run build  # NEXT_PUBLIC_API_URL set
```

## Things that are easy to get wrong

- `apps/api/.venv` and `apps/runtime/.venv` are separate environments.
- Ports 3000/8000 may be taken on a developer machine; the API accepts any
  `--port`, and the web app reads `NEXT_PUBLIC_API_URL` at build time.
- `SEED_DEMO`/`seed.py` must stay idempotent (it checks before inserting).
- Never commit `.env`, `gravel.db`, `uploads/`, or anything under `ai-sdlc/`
  if that folder exists on your machine — it is not part of this project.
