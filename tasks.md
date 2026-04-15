# Gravel — Build Tasks

Full-stack rewrite: **Next.js 15 (App Router)** frontend + **FastAPI** backend.  
The current `/src` prototype is the design reference — match it exactly unless noted.

---

## Legend

- `[ ]` not started
- `[x]` done
- `[-]` in progress
- `[~]` blocked

---

## 0. Repo & Workspace Setup

- [ ] **0.1** Create monorepo root with `/apps/web` (Next.js) and `/apps/api` (FastAPI)
- [ ] **0.2** Add root `docker-compose.yml` — services: `web`, `api`, `db` (Postgres 16), `redis`
- [ ] **0.3** Add `.env.example` with all required vars (see §1.4)
- [ ] **0.4** Add root `Makefile` with `make dev`, `make migrate`, `make seed`, `make test`
- [ ] **0.5** Configure shared ESLint + Prettier for `/apps/web`
- [ ] **0.6** Configure `ruff` + `mypy` for `/apps/api`
- [ ] **0.7** Add GitHub Actions CI: lint → test → build on every PR

---

## 1. Database

### 1.1 Setup

- [ ] **1.1.1** Init Postgres 16 via Docker; create `gravel` database
- [ ] **1.1.2** Add SQLAlchemy 2.x async engine + session factory (`apps/api/db/session.py`)
- [ ] **1.1.3** Add Alembic for migrations (`apps/api/alembic/`)
- [ ] **1.1.4** Add `BaseModel` with `id` (UUID), `created_at`, `updated_at`

### 1.2 Models

- [ ] **1.2.1** `users` — id, name, email (unique), hashed_password, role (enum), is_active, api_keys (encrypted JSON)
- [ ] **1.2.2** `projects` — id, name, status (enum), prd_file_path, progress (int), owner_id (FK users), default_model
- [ ] **1.2.3** `project_design_files` — id, project_id (FK), filename, file_path
- [ ] **1.2.4** `tasks` — id, project_id (FK), title, description, status (enum), priority (enum), type (enum), position (int for ordering)
- [ ] **1.2.5** `changelog_entries` — id, project_id (FK), message, type (enum), file_path, author_id (FK users nullable)
- [ ] **1.2.6** `refresh_tokens` — id, user_id (FK), token_hash, expires_at, revoked

### 1.3 Enums

- [ ] **1.3.1** `ProjectStatus`: setup | running | qa | review | done | deployed
- [ ] **1.3.2** `TaskStatus`: pending | in_progress | qa | done
- [ ] **1.3.3** `TaskPriority`: high | medium | low
- [ ] **1.3.4** `TaskType`: feature | bug | design | infra
- [ ] **1.3.5** `ChangelogType`: added | changed | fixed | infra
- [ ] **1.3.6** `UserRole`: admin | developer | qa | product | devops

### 1.4 Seed data

- [ ] **1.4.1** Seed script that creates the 5 demo users (matching prototype credentials)
- [ ] **1.4.2** Seed 2 sample projects with tasks + changelog entries for local dev

### 1.5 Environment variables

```
# API
DATABASE_URL=postgresql+asyncpg://gravel:gravel@db:5432/gravel
REDIS_URL=redis://redis:6379/0
SECRET_KEY=<32-byte random>
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30
ENCRYPTION_KEY=<fernet key for api_keys column>
ALLOWED_ORIGINS=http://localhost:3000

# Web
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 2. Backend — FastAPI

Stack: FastAPI, SQLAlchemy 2 async, Alembic, Pydantic v2, python-jose (JWT), passlib (bcrypt), python-multipart, cryptography (Fernet), httpx, websockets, redis (via aioredis).

### 2.1 Project structure

```
apps/api/
  main.py               # app factory, middleware, routers
  config.py             # Settings via pydantic-settings
  db/
    session.py
    base.py
  models/               # SQLAlchemy ORM models
  schemas/              # Pydantic request/response schemas
  routers/
    auth.py
    users.py
    projects.py
    tasks.py
    files.py
    agent.py
    ws.py               # WebSocket endpoint
  services/
    auth.py
    users.py
    projects.py
    tasks.py
    agent.py            # AI agent orchestration
    parser.py           # PRD/design → task extraction
    storage.py          # File upload handling
  dependencies.py       # get_db, get_current_user, require_role
  alembic/
```

### 2.2 Auth (`/api/auth`)

- [ ] **2.2.1** `POST /auth/signup` — create user, return access + refresh tokens
- [ ] **2.2.2** `POST /auth/login` — verify credentials, return access + refresh tokens
- [ ] **2.2.3** `POST /auth/refresh` — validate refresh token, return new access token
- [ ] **2.2.4** `POST /auth/logout` — revoke refresh token
- [ ] **2.2.5** `GET /auth/me` — return current user (requires valid JWT)
- [ ] **2.2.6** JWT access tokens: HS256, short-lived (60 min)
- [ ] **2.2.7** Refresh tokens: stored as hash in DB, 30-day expiry, rotation on use
- [ ] **2.2.8** `get_current_user` FastAPI dependency (validates Bearer token)
- [ ] **2.2.9** `require_role(*roles)` dependency factory for role-gated endpoints

### 2.3 Users (`/api/users`) — admin only except self-update

- [ ] **2.3.1** `GET /users` — list all users (admin)
- [ ] **2.3.2** `GET /users/{id}` — get user by id (admin or self)
- [ ] **2.3.3** `PATCH /users/{id}` — update name, role (admin); name only (self)
- [ ] **2.3.4** `DELETE /users/{id}` — soft-delete / deactivate (admin, cannot delete self)
- [ ] **2.3.5** `POST /users/invite` — create inactive user record + return invite link (admin)
- [ ] **2.3.6** `PUT /users/{id}/api-keys` — save encrypted API keys (self or admin); encrypt with Fernet before DB write
- [ ] **2.3.7** `GET /users/{id}/api-keys` — return masked keys (last 4 chars visible)

### 2.4 Projects (`/api/projects`)

- [ ] **2.4.1** `GET /projects` — list projects accessible to current user
- [ ] **2.4.2** `POST /projects` — create project (product or admin role)
- [ ] **2.4.3** `GET /projects/{id}` — project detail with tasks + changelog
- [ ] **2.4.4** `PATCH /projects/{id}` — update name, default_model
- [ ] **2.4.5** `DELETE /projects/{id}` — delete project + cascade tasks/changelog
- [ ] **2.4.6** `POST /projects/{id}/advance` — advance status to next stage; enforce valid transitions; emit WS event
- [ ] **2.4.7** Status transition guards:
  - setup → running: requires ≥1 task
  - running → qa: requires ≥1 task with status `done`
  - qa → review: at least one qa-passing record
  - review → done: admin/developer role only
  - done → deployed: devops or admin role only

### 2.5 Tasks (`/api/projects/{id}/tasks`)

- [ ] **2.5.1** `GET /projects/{id}/tasks` — ordered by `position`
- [ ] **2.5.2** `POST /projects/{id}/tasks` — create task
- [ ] **2.5.3** `PATCH /projects/{id}/tasks/{task_id}` — update title, description, status, priority, type
- [ ] **2.5.4** `DELETE /projects/{id}/tasks/{task_id}` — delete task
- [ ] **2.5.5** `POST /projects/{id}/tasks/reorder` — accept `[{id, position}]`, bulk-update positions
- [ ] **2.5.6** On task status change → recalculate project `progress` = `done_count / total_count * 100`

### 2.6 Changelog (`/api/projects/{id}/changelog`)

- [ ] **2.6.1** `GET /projects/{id}/changelog` — paginated, newest first
- [ ] **2.6.2** `POST /projects/{id}/changelog` — internal use by agent service; not user-facing

### 2.7 File uploads (`/api/files`)

- [ ] **2.7.1** `POST /files/upload` — multipart upload; accept PDF, MD, TXT (PRD) or PNG/JPG/FIG (design); max 20 MB
- [ ] **2.7.2** Store files in `/uploads/{project_id}/` on disk (swap for S3 in prod)
- [ ] **2.7.3** Return `{ file_path, filename, size, content_type }`
- [ ] **2.7.4** `DELETE /files/{file_path}` — delete file + DB record

### 2.8 Agent service (`/api/agent`)

- [ ] **2.8.1** `POST /agent/parse` — accept `{ project_id, prd_file_path, design_file_paths[], model, api_key }` → call LLM to extract tasks → save tasks to DB → return task list
- [ ] **2.8.2** `POST /agent/run/{project_id}` — start background task execution (Celery or asyncio background task)
- [ ] **2.8.3** `GET /agent/status/{project_id}` — return current running task + overall progress
- [ ] **2.8.4** Agent run loop (background task):
  - Pick next `pending` task ordered by priority + position
  - Set task status → `in_progress`, emit WS event
  - Call LLM with task context + project PRD
  - On success: set task status → `done`, add changelog entry, update project progress, emit WS
  - On failure: retry once, then set task status back to `pending` with error note
  - When all tasks done: set project status → `qa`
- [ ] **2.8.5** BYOK: read encrypted API key from user record, decrypt with Fernet, pass to LLM client — never log
- [ ] **2.8.6** Support multiple providers: Anthropic (`anthropic` SDK), OpenAI (`openai` SDK), Groq (`openai`-compatible)
- [ ] **2.8.7** PRD parser prompt: structured output (JSON) listing tasks with title, description, priority, type
- [ ] **2.8.8** Rate limit agent runs: max 1 concurrent run per project

### 2.9 WebSocket (`/ws/{project_id}`)

- [ ] **2.9.1** Auth via `token` query param (same JWT)
- [ ] **2.9.2** On connect: send current project snapshot
- [ ] **2.9.3** Broadcast events: `task.updated`, `task.created`, `project.status_changed`, `changelog.added`, `agent.progress`
- [ ] **2.9.4** Use Redis pub/sub as the broker so multiple API workers can broadcast
- [ ] **2.9.5** Reconnection: client should reconnect with exponential backoff; server accepts re-auth on reconnect

### 2.10 Cross-cutting

- [ ] **2.10.1** CORS: allow `ALLOWED_ORIGINS` from env
- [ ] **2.10.2** Global exception handler: return `{ detail, code }` JSON for all errors
- [ ] **2.10.3** Request ID middleware: inject `X-Request-ID` header on all responses
- [ ] **2.10.4** Structured JSON logging with request ID, user ID, duration
- [ ] **2.10.5** Health check: `GET /health` returns `{ status, db, redis }`
- [ ] **2.10.6** OpenAPI docs at `/docs` (disable in prod via env flag)

---

## 3. Frontend — Next.js

Stack: Next.js 15 (App Router), TypeScript, Tailwind CSS v3, shadcn/ui (Radix), React Query v5 (`@tanstack/react-query`), React Hook Form + Zod, `js-cookie` for token storage, native WebSocket.

### 3.1 Project structure

```
apps/web/
  app/
    (public)/
      page.tsx              # Landing page
      login/page.tsx
      signup/page.tsx
    (app)/
      layout.tsx            # AppShell (nav + auth guard)
      page.tsx              # Dashboard → /app redirect
      projects/
        page.tsx            # Project list + detail
      users/
        page.tsx            # User management (admin only)
      settings/
        page.tsx            # Profile + API keys + model
  components/
    ui/                     # shadcn primitives (copy from prototype)
    AppShell.tsx
    ProjectList.tsx
    ProjectDetail.tsx
    TaskCard.tsx
    ChangelogItem.tsx
    WorkflowStepper.tsx
    CreateProjectDialog.tsx
    InviteUserDialog.tsx
    EditUserDialog.tsx
  lib/
    api.ts                  # typed fetch wrapper + React Query hooks
    auth.ts                 # token storage, refresh logic
    ws.ts                   # WebSocket client with reconnect
    utils.ts
  hooks/
    useProjects.ts
    useTasks.ts
    useUsers.ts
    useAgent.ts
    useProjectSocket.ts
  types/
    index.ts                # shared TypeScript types matching API schemas
```

### 3.2 Tailwind + shadcn setup

- [ ] **3.2.1** Copy `tailwind.config.js` and CSS variables from prototype
- [ ] **3.2.2** Copy all shadcn components from prototype: `button`, `badge`, `card`, `dialog`, `progress`, `tabs`, `avatar`, `dropdown`
- [ ] **3.2.3** Add `cn` utility

### 3.3 API client (`lib/api.ts`)

- [ ] **3.3.1** Typed `apiFetch` wrapper: attaches `Authorization: Bearer <token>`, handles 401 → auto-refresh → retry once, throws typed `ApiError`
- [ ] **3.3.2** React Query `queryClient` provider in root layout
- [ ] **3.3.3** Hooks:
  - `useCurrentUser()` — `GET /auth/me`
  - `useProjects()` — `GET /projects`
  - `useProject(id)` — `GET /projects/{id}`
  - `useCreateProject()` — mutation
  - `useAdvanceProject(id)` — mutation
  - `useTasks(projectId)` — `GET /projects/{id}/tasks`
  - `useUpdateTask()` — mutation
  - `useChangelog(projectId)` — `GET /projects/{id}/changelog`
  - `useUsers()` — `GET /users`
  - `useInviteUser()` — mutation
  - `useUpdateUser()` — mutation
  - `useDeleteUser()` — mutation
  - `useParseAgent()` — mutation (`POST /agent/parse`)
  - `useRunAgent()` — mutation (`POST /agent/run/{id}`)

### 3.4 Auth flow

- [ ] **3.4.1** Store `access_token` in memory (module-level var); store `refresh_token` in `httpOnly`-like cookie (`js-cookie` with `secure`, `sameSite: strict`)
- [ ] **3.4.2** `AuthContext`: `user`, `login()`, `signup()`, `logout()`, `isLoading`
- [ ] **3.4.3** On app load: call `GET /auth/me` with stored token; if 401 attempt refresh; if refresh fails clear and redirect `/login`
- [ ] **3.4.4** `(app)/layout.tsx`: server-side check — if no token cookie, redirect to `/login`; client-side `AuthGuard` for role checks
- [ ] **3.4.5** `logout()`: call `POST /auth/logout`, clear tokens, `router.push('/')`

### 3.5 Landing page (`app/(public)/page.tsx`)

Port all sections from `src/pages/Landing.tsx` exactly:
- [ ] **3.5.1** Sticky nav with logo, anchor links, Sign in / Get Started buttons
- [ ] **3.5.2** Hero: headline, subheadline, CTA buttons, pipeline badge strip
- [ ] **3.5.3** Features grid (6 cards)
- [ ] **3.5.4** How it works (6-step vertical flow)
- [ ] **3.5.5** BYOK section with model cards
- [ ] **3.5.6** Role cards (5 roles)
- [ ] **3.5.7** Pricing section with monthly/annual toggle and 3 plan cards
- [ ] **3.5.8** CTA banner + footer
- [ ] **3.5.9** All links point to real routes (`/login`, `/signup`)

### 3.6 Login page (`app/(public)/login/page.tsx`)

- [ ] **3.6.1** Port layout from prototype (split panel on desktop)
- [ ] **3.6.2** Form: email + password, submit calls `POST /auth/login`, stores tokens, redirects `/projects`
- [ ] **3.6.3** Inline error from API (`detail` field)
- [ ] **3.6.4** Demo account buttons (pre-fill known seed credentials)
- [ ] **3.6.5** Loading spinner on submit

### 3.7 Signup page (`app/(public)/signup/page.tsx`)

- [ ] **3.7.1** 2-step form: account details → role picker (port from prototype)
- [ ] **3.7.2** Step 1 → Step 2 on "Continue" (no API call yet)
- [ ] **3.7.3** Step 2 submit calls `POST /auth/signup`, stores tokens, redirects `/projects`
- [ ] **3.7.4** Show field-level validation errors from Zod + API errors

### 3.8 AppShell (`components/AppShell.tsx`)

- [ ] **3.8.1** Port from prototype: sticky top nav, logo, nav links, bell, user avatar dropdown
- [ ] **3.8.2** Mobile hamburger drawer
- [ ] **3.8.3** "Team" nav item visible only when `user.role === 'admin'`
- [ ] **3.8.4** User dropdown: API Keys & Model → `/settings`, User Management → `/users`, Sign out
- [ ] **3.8.5** Active link highlighting via `usePathname()`

### 3.9 Dashboard / Projects page (`app/(app)/projects/page.tsx`)

- [ ] **3.9.1** Left sidebar: project list; each item shows name, status dot, progress bar, task count
- [ ] **3.9.2** "New Project" button opens `CreateProjectDialog`
- [ ] **3.9.3** Clicking a project opens detail panel (right side on desktop, full-screen on mobile with back button)
- [ ] **3.9.4** Right panel: `WorkflowStepper`, progress bar, stats row (total/qa/done), tabs (Tasks | Changelog)
- [ ] **3.9.5** CTA button changes per project status — calls `POST /projects/{id}/advance`
- [ ] **3.9.6** Tasks tab: list of `TaskCard` components sorted by position
- [ ] **3.9.7** Changelog tab: list of `ChangelogItem` components, paginated (load more)
- [ ] **3.9.8** Optimistic updates: advancing status + task changes update UI before API confirms
- [ ] **3.9.9** Subscribe to WebSocket for this project on panel open; close on unmount

### 3.10 Create Project Dialog

- [ ] **3.10.1** Step 1 — Name input
- [ ] **3.10.2** Step 2 — Upload PRD (PDF/MD/TXT) via `POST /files/upload`; upload designs (PNG/JPG/FIG, multiple); real file input `<input type="file">`
- [ ] **3.10.3** Step 3 — Parse animation: call `POST /agent/parse`; poll or use WS for progress; show step-by-step status messages
- [ ] **3.10.4** Step 4 — Preview task list returned by agent; allow user to delete/edit tasks before confirming
- [ ] **3.10.5** On confirm: `POST /projects` then `POST /agent/run/{id}` to kick off build; navigate to new project

### 3.11 WebSocket integration (`hooks/useProjectSocket.ts`)

- [ ] **3.11.1** Connect to `ws://API_HOST/ws/{project_id}?token=<access_token>`
- [ ] **3.11.2** On `task.updated` event → update React Query cache for that task
- [ ] **3.11.3** On `project.status_changed` → invalidate project query
- [ ] **3.11.4** On `changelog.added` → prepend to changelog cache
- [ ] **3.11.5** Reconnect with exponential backoff (1s, 2s, 4s, max 30s) on disconnect
- [ ] **3.11.6** Show connection status indicator (subtle dot in header)

### 3.12 User Management page (`app/(app)/users/page.tsx`) — admin only

- [ ] **3.12.1** Redirect non-admins to `/projects`
- [ ] **3.12.2** Port all UI from prototype: role stat cards, search/filter, member table
- [ ] **3.12.3** Invite dialog → `POST /users/invite`
- [ ] **3.12.4** Edit dialog → `PATCH /users/{id}`
- [ ] **3.12.5** Delete confirmation → `DELETE /users/{id}`
- [ ] **3.12.6** Permissions matrix table (static data, matches §2.9 transition guards)
- [ ] **3.12.7** All mutations invalidate `useUsers()` query on success

### 3.13 Settings page (`app/(app)/settings/page.tsx`)

- [ ] **3.13.1** Profile section: name edit → `PATCH /users/{id}`; email read-only
- [ ] **3.13.2** API Keys section: per-provider inline edit fields → `PUT /users/{id}/api-keys`; display masked values from `GET /users/{id}/api-keys`
- [ ] **3.13.3** Model picker: select from model list; disabled if corresponding provider key is missing; saves `default_model` to user record via `PATCH /users/{id}`
- [ ] **3.13.4** Show "No key" badge on models without a configured key (call `/api-keys` to check)
- [ ] **3.13.5** Success toast on each save

---

## 4. Real-time Agent UX

- [ ] **4.1** When a project is `running`, show an animated "agent is working" indicator in the project detail header
- [ ] **4.2** Active task card shows `Loader2` spinner and pulsing border
- [ ] **4.3** Changelog entries animate in (slide + fade) as the agent adds them in real time
- [ ] **4.4** Progress bar smoothly animates as `project.progress` updates via WS
- [ ] **4.5** When agent finishes (all tasks `done`), auto-advance project to `qa` and show a toast: "Agent completed all tasks — ready for QA"

---

## 5. Testing

### 5.1 Backend

- [ ] **5.1.1** pytest + pytest-asyncio setup; test DB using `pytest-postgresql` or SQLite in-memory
- [ ] **5.1.2** Auth tests: signup, login, refresh, logout, expired token, wrong password
- [ ] **5.1.3** User tests: CRUD, role guards (403 for non-admin), self-update limits
- [ ] **5.1.4** Project tests: create, list, advance (valid + invalid transitions), permission checks
- [ ] **5.1.5** Task tests: CRUD, reorder, progress recalculation
- [ ] **5.1.6** Agent parser test: mock LLM call, verify task schema extracted correctly
- [ ] **5.1.7** File upload test: valid types accepted, oversized rejected

### 5.2 Frontend

- [ ] **5.2.1** Vitest + Testing Library setup
- [ ] **5.2.2** `AuthContext` unit tests: login/logout flow, token refresh
- [ ] **5.2.3** `apiFetch` unit tests: 401 → refresh → retry, ApiError thrown correctly
- [ ] **5.2.4** `CreateProjectDialog` integration test: step navigation, file upload mock, parse mock
- [ ] **5.2.5** `WorkflowStepper` snapshot: correct step highlighted per status
- [ ] **5.2.6** `UserManagement` page: invite + edit + delete flows with mocked queries

### 5.3 E2E (Playwright)

- [ ] **5.3.1** Playwright setup pointing at local `docker-compose` stack
- [ ] **5.3.2** Happy path: sign up → create project → upload PRD → parse → start build → advance to deployed
- [ ] **5.3.3** Auth guard: unauthenticated user redirected to `/login`
- [ ] **5.3.4** Role guard: non-admin cannot access `/users`
- [ ] **5.3.5** Settings: save API key → key appears masked → clear key → model disabled

---

## 6. Infrastructure & Deployment

- [ ] **6.1** `Dockerfile` for API: multi-stage, python 3.12-slim, non-root user
- [ ] **6.2** `Dockerfile` for Web: multi-stage Next.js standalone output
- [ ] **6.3** `docker-compose.yml` for local dev: hot reload for both services
- [ ] **6.4** `docker-compose.prod.yml`: no volume mounts, env from secrets
- [ ] **6.5** Nginx reverse proxy config: `/api/*` → FastAPI, `/*` → Next.js, WebSocket upgrade headers
- [ ] **6.6** Alembic auto-migration on API container startup (`alembic upgrade head` in entrypoint)
- [ ] **6.7** GitHub Actions deploy workflow: build images → push to registry → SSH deploy (or fly.io/render hook)
- [ ] **6.8** Secrets: document how to rotate `SECRET_KEY` and `ENCRYPTION_KEY` without breaking existing sessions

---

## 7. Polish & Beta Hardening

- [ ] **7.1** Rate limit `POST /auth/login` to 10 req/min per IP (slowapi)
- [ ] **7.2** Rate limit `POST /agent/parse` + `/agent/run` to 5 req/min per user
- [ ] **7.3** Input sanitization: strip HTML from all string fields before DB write
- [ ] **7.4** File upload: validate MIME type server-side (not just extension); scan with `python-magic`
- [ ] **7.5** API key encryption: rotate Fernet key support (re-encrypt on next key save)
- [ ] **7.6** Pagination on `/projects`, `/users`, `/changelog` (cursor-based, page size 50)
- [ ] **7.7** 404 and 403 pages in Next.js (`not-found.tsx`, middleware redirect)
- [ ] **7.8** `robots.txt` and `sitemap.xml` for landing page SEO
- [ ] **7.9** OpenGraph meta tags on landing page
- [ ] **7.10** Lighthouse score ≥ 90 on landing page (performance, accessibility)

---

## Build Order (recommended)

```
Phase 1 — Foundation (days 1–3)
  0.1–0.7  Repo & workspace
  1.1–1.5  Database models + seed

Phase 2 — Auth spine (days 4–5)
  2.2      Auth endpoints
  3.4      Frontend auth flow (login → redirect → /projects)
  3.6      Login page
  3.7      Signup page

Phase 3 — Core CRUD (days 6–9)
  2.3      Users API
  2.4      Projects API
  2.5      Tasks API
  2.6      Changelog API
  3.8      AppShell
  3.9      Dashboard page (static data first)
  3.12     User management page
  3.13     Settings page

Phase 4 — Files + Agent (days 10–14)
  2.7      File upload API
  2.8      Agent service (parse + run loop)
  3.10     Create project dialog (real upload + parse)
  4.1–4.5  Real-time agent UX

Phase 5 — WebSocket (days 15–16)
  2.9      WS endpoint
  3.11     Frontend WS hook

Phase 6 — Landing page (day 17)
  3.5      Port landing page

Phase 7 — Tests + infra (days 18–21)
  5.1–5.3  Tests
  6.1–6.8  Docker + deploy

Phase 8 — Polish (days 22–23)
  7.1–7.10 Hardening
```

---

## Open Questions

- **File storage**: local disk for beta, S3-compatible (Cloudflare R2) for prod — finalize before §2.7
- **Agent run model**: background asyncio task vs Celery — Celery preferred for scale but adds ops overhead; use asyncio background tasks for beta
- **LLM cost controls**: add per-user monthly token budget tracking if needed
- **Invite flow**: email sending out of scope for beta — invite just creates a user record; share credentials manually
