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

- [x] **0.1** Create monorepo root with `/apps/web` (Next.js) and `/apps/api` (FastAPI)
- [ ] **0.2** Add root `docker-compose.yml` — services: `web`, `api`, `db` (Postgres 16), `redis`
- [x] **0.3** Add `.env.example` with all required vars (see §1.4)
- [x] **0.4** Add root `Makefile` with `make dev`, `make migrate`, `make seed`, `make test`
- [x] **0.5** Configure shared ESLint + Prettier for `/apps/web`
- [x] **0.6** Configure `ruff` + `mypy` for `/apps/api`
- [ ] **0.7** Add GitHub Actions CI: lint → test → build on every PR

---

## 1. Database

### 1.1 Setup

- [x] **1.1.1** Init Postgres 16 via Docker; create `gravel` database
- [x] **1.1.2** Add SQLAlchemy 2.x async engine + session factory (`apps/api/db/session.py`)
- [x] **1.1.3** Add Alembic for migrations (`apps/api/alembic/`)
- [x] **1.1.4** Add `BaseModel` with `id` (UUID), `created_at`, `updated_at`

### 1.2 Models

- [x] **1.2.1** `users` — id, name, email (unique), hashed_password, role (enum), is_active, api_keys (encrypted JSON)
- [x] **1.2.2** `projects` — id, name, status (enum), prd_file_path, progress (int), owner_id (FK users), default_model
- [x] **1.2.3** `project_design_files` — id, project_id (FK), filename, file_path
- [x] **1.2.4** `tasks` — id, project_id (FK), title, description, status (enum), priority (enum), type (enum), position (int for ordering)
- [x] **1.2.5** `changelog_entries` — id, project_id (FK), message, type (enum), file_path, author_id (FK users nullable)
- [x] **1.2.6** `refresh_tokens` — id, user_id (FK), token_hash, expires_at, revoked
- [ ] **1.2.7** `engineers` — id, name, template, skills_markdown, status, owner_id (FK users)
- [ ] **1.2.8** `engineer_runtimes` — id, engineer_id (FK), container_id, started_at, stopped_at, last_heartbeat_at
- [ ] **1.2.9** `task_runs` — id, task_id (FK), engineer_id (FK nullable), phase (enum), outcome (enum nullable), blocking_reason, started_at, completed_at
- [ ] **1.2.10** `task_run_logs` — id, task_run_id (FK), message, level, created_at
- [ ] **1.2.11** `task_comments` — id, task_id (FK), task_run_id (FK nullable), author_id (FK users nullable), author_type (enum: human | ai), body, action_flag
- [ ] **1.2.12** `evidence_artifacts` — id, task_run_id (FK), artifact_type (enum: screenshot | log | test_result), file_path, filename, created_at
- [ ] **1.2.13** `integrations` — id, owner_id (FK users), provider (github | gitlab | aws), credentials_encrypted, repo_url, default_branch, deployment_config

### 1.3 Enums

- [x] **1.3.1** `ProjectStatus`: setup | running | qa | review | done | deployed
- [x] **1.3.2** `TaskStatus`: pending | in_progress | qa | done
- [x] **1.3.3** `TaskPriority`: high | medium | low
- [x] **1.3.4** `TaskType`: feature | bug | design | infra
- [x] **1.3.5** `ChangelogType`: added | changed | fixed | infra
- [x] **1.3.6** `UserRole`: admin | developer | qa | product | devops
- [ ] **1.3.7** `TaskRunPhase`: grooming | build | testing | deployment
- [ ] **1.3.8** `TaskRunOutcome`: grooming_complete | build_complete | testing_complete | deployment_complete | needs_human_input | blocked | failed
- [ ] **1.3.9** `CommentAuthorType`: human | ai
- [ ] **1.3.10** `EngineerStatus`: idle | running | stopped | error
- [ ] **1.3.11** `ArtifactType`: screenshot | log | test_result

### 1.4 Seed data

- [x] **1.4.1** Seed script that creates the 5 demo users (matching prototype credentials)
- [-] **1.4.2** Seed 2 sample projects with tasks + changelog entries for local dev

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

# GitHub integration
GITHUB_TOKEN=<personal access token>

# AWS deployment (optional)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
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
    engineers.py        # NEW: AI engineer management
    task_runs.py        # NEW: execution tracking + approval
    artifacts.py        # NEW: evidence artifact upload
    board.py            # NEW: kanban board endpoints
    integrations.py     # GitHub + AWS
    ws.py               # WebSocket endpoint
  services/
    auth.py
    users.py
    projects.py
    tasks.py
    agent.py            # AI agent orchestration
    parser.py           # PRD/design → task extraction
    storage.py          # File upload handling
    engineer.py         # NEW: container lifecycle management
    github.py           # NEW: repo, branch, PR operations
    deployment.py       # NEW: AWS S3/CloudFront
  dependencies.py       # get_db, get_current_user, require_role
  alembic/
```

### 2.2 Auth (`/api/auth`)

- [x] **2.2.1** `POST /auth/signup` — create user, return access + refresh tokens
- [x] **2.2.2** `POST /auth/login` — verify credentials, return access + refresh tokens
- [x] **2.2.3** `POST /auth/refresh` — validate refresh token, return new access token
- [x] **2.2.4** `POST /auth/logout` — revoke refresh token
- [x] **2.2.5** `GET /auth/me` — return current user (requires valid JWT)
- [x] **2.2.6** JWT access tokens: HS256, short-lived (60 min)
- [x] **2.2.7** Refresh tokens: stored as hash in DB, 30-day expiry, rotation on use
- [x] **2.2.8** `get_current_user` FastAPI dependency (validates Bearer token)
- [x] **2.2.9** `require_role(*roles)` dependency factory for role-gated endpoints

### 2.3 Users (`/api/users`) — admin only except self-update

- [x] **2.3.1** `GET /users` — list all users (admin)
- [x] **2.3.2** `GET /users/{id}` — get user by id (admin or self)
- [x] **2.3.3** `PATCH /users/{id}` — update name, role (admin); name only (self)
- [x] **2.3.4** `DELETE /users/{id}` — soft-delete / deactivate (admin, cannot delete self)
- [x] **2.3.5** `POST /users/invite` — create inactive user record + return invite link (admin)
- [x] **2.3.6** `PUT /users/{id}/api-keys` — save encrypted API keys (self or admin); encrypt with Fernet before DB write
- [x] **2.3.7** `GET /users/{id}/api-keys` — return masked keys (last 4 chars visible)

### 2.4 Projects (`/api/projects`)

- [x] **2.4.1** `GET /projects` — list projects accessible to current user
- [x] **2.4.2** `POST /projects` — create project (product or admin role)
- [x] **2.4.3** `GET /projects/{id}` — project detail with tasks + changelog
- [x] **2.4.4** `PATCH /projects/{id}` — update name, default_model
- [x] **2.4.5** `DELETE /projects/{id}` — delete project + cascade tasks/changelog
- [-] **2.4.6** `POST /projects/{id}/advance` — advance status to next stage; enforce valid transitions; emit WS event
- [-] **2.4.7** Status transition guards:
  - setup → running: requires ≥1 task
  - running → qa: requires ≥1 task with status `done`
  - qa → review: at least one qa-passing record
  - review → done: admin/developer role only
  - done → deployed: devops or admin role only

### 2.5 Tasks (`/api/projects/{id}/tasks`)

- [x] **2.5.1** `GET /projects/{id}/tasks` — ordered by `position`
- [x] **2.5.2** `POST /projects/{id}/tasks` — create task
- [x] **2.5.3** `PATCH /projects/{id}/tasks/{task_id}` — update title, description, status, priority, type
- [x] **2.5.4** `DELETE /projects/{id}/tasks/{task_id}` — delete task
- [x] **2.5.5** `POST /projects/{id}/tasks/reorder` — accept `[{id, position}]`, bulk-update positions
- [x] **2.5.6** On task status change → recalculate project `progress` = `done_count / total_count * 100`
- [ ] **2.5.7** `POST /tasks/{task_id}/retry` — reset task to pending and clear last run outcome
- [ ] **2.5.8** `POST /tasks/{task_id}/comments` — add human or AI comment
- [ ] **2.5.9** `DELETE /tasks/{task_id}/comments/{comment_id}` — remove comment
- [ ] **2.5.10** `GET /tasks/{task_id}/runs` — list all task run history for a task

### 2.6 Changelog (`/api/projects/{id}/changelog`)

- [x] **2.6.1** `GET /projects/{id}/changelog` — paginated, newest first
- [x] **2.6.2** `POST /projects/{id}/changelog` — internal use by agent service; not user-facing

### 2.7 File uploads (`/api/files`)

- [x] **2.7.1** `POST /files/upload` — multipart upload; accept PDF, MD, TXT (PRD) or PNG/JPG/FIG (design); max 20 MB
- [x] **2.7.2** Store files in `/uploads/{project_id}/` on disk (swap for S3 in prod)
- [x] **2.7.3** Return `{ file_path, filename, size, content_type }`
- [x] **2.7.4** `DELETE /files/{file_path}` — delete file + DB record

### 2.8 Agent service (`/api/agent`)

- [x] **2.8.1** `POST /agent/parse` — accept `{ project_id, prd_file_path, design_file_paths[], model, api_key }` → call LLM to extract tasks → save tasks to DB → return task list
- [-] **2.8.2** `POST /agent/run/{project_id}` — start background task execution (asyncio background task)
- [-] **2.8.3** `GET /agent/status/{project_id}` — return current running task + overall progress
- [ ] **2.8.4** Agent run loop (background task):
  - Pick next `pending` task ordered by priority + position
  - Set task status → `in_progress`, create TaskRun record, emit WS event
  - Call LLM with task context + project PRD
  - On success: set task status → `done`, add changelog entry, update project progress, emit WS
  - On failure: retry once, then set task status back to `pending` with error note
  - When all tasks done: set project status → `qa`
- [x] **2.8.5** BYOK: read encrypted API key from user record, decrypt with Fernet, pass to LLM client — never log
- [x] **2.8.6** Support multiple providers: Anthropic (`anthropic` SDK), OpenAI (`openai` SDK), Groq (`openai`-compatible)
- [x] **2.8.7** PRD parser prompt: structured output (JSON) listing tasks with title, description, priority, type
- [ ] **2.8.8** Rate limit agent runs: max 1 concurrent run per project

### 2.9 Engineers (`/api/engineers`) — NEW

- [ ] **2.9.1** `POST /engineers` — create engineer with name, template, skills_markdown
- [ ] **2.9.2** `GET /engineers` — list engineers with runtime health status
- [ ] **2.9.3** `GET /engineers/{id}` — engineer detail + active runtime info
- [ ] **2.9.4** `PATCH /engineers/{id}` — update name, template, skills_markdown
- [ ] **2.9.5** `DELETE /engineers/{id}` — remove engineer (stop runtime first if running)
- [ ] **2.9.6** `POST /engineers/{id}/launch` — start engineer runtime; record `engineer_runtimes` row
- [ ] **2.9.7** `POST /engineers/{id}/stop` — stop all active runtimes for engineer
- [ ] **2.9.8** `POST /engineer-runtimes/{runtime_id}/heartbeat` — update `last_heartbeat_at`; mark stale if > 60s without heartbeat
- [ ] **2.9.9** `POST /engineer-runtimes/{runtime_id}/stop` — stop specific runtime
- [ ] **2.9.10** `POST /engineer-runtimes/{runtime_id}/restart` — restart a stopped runtime

### 2.10 Task Runs (`/api/task-runs`) — NEW

- [ ] **2.10.1** `GET /task-runs/{id}` — get task run detail including logs and artifacts
- [ ] **2.10.2** `POST /task-runs/{id}/approve` — human approves run outcome; advance task to next phase
- [ ] **2.10.3** `POST /task-runs/{id}/reject` — human rejects run; set outcome to `failed`, task back to `pending`
- [ ] **2.10.4** `POST /agent/task-runs/{id}/heartbeat` — agent reports in-progress status
- [ ] **2.10.5** `POST /agent/task-runs/{id}/logs` — agent submits log lines
- [ ] **2.10.6** `POST /agent/task-runs/{id}/outcome` — agent reports phase outcome (success or blocking)
- [ ] **2.10.7** `POST /agent/poll-next-task` — agent polls for its next pending task (auth by engineer token)

### 2.11 Board (`/api/board`) — NEW

- [ ] **2.11.1** `GET /board` — kanban board spanning all projects; columns = task statuses; returns tasks grouped by status with project info
- [ ] **2.11.2** `GET /projects/{id}/board` — project-specific kanban board
- [ ] **2.11.3** `GET /overview/attention-tasks` — tasks with outcome `needs_human_input` or `blocked` across all projects
- [ ] **2.11.4** `GET /overview/metrics` — workspace stats: project count, engineer count, total tasks, blocked task count

### 2.12 Evidence Artifacts (`/api/artifacts`) — NEW

- [ ] **2.12.1** `POST /artifacts/upload` — upload screenshot, log file, or test result; link to `task_run_id`
- [ ] **2.12.2** `GET /task-runs/{id}/artifacts` — list all artifacts for a run
- [ ] **2.12.3** `DELETE /artifacts/{id}` — remove artifact file + DB record

### 2.13 Integrations (`/api/integrations`)

- [-] **2.13.1** Store GitHub personal access token (encrypted) per project
- [ ] **2.13.2** `POST /integrations/github/clone` — clone repo to local workspace path
- [ ] **2.13.3** `POST /integrations/github/branch` — create feature branch from default branch
- [ ] **2.13.4** `POST /integrations/github/pr` — open pull request with task title + changelog as description
- [ ] **2.13.5** `POST /integrations/aws/deploy` — upload build artifacts to S3 bucket, invalidate CloudFront distribution
- [ ] **2.13.6** `GET /integrations` — list configured integrations with masked credentials

### 2.14 WebSocket (`/ws/{project_id}`)

- [x] **2.14.1** Auth via `token` query param (same JWT)
- [x] **2.14.2** On connect: send current project snapshot
- [-] **2.14.3** Broadcast events: `task.updated`, `task.created`, `project.status_changed`, `changelog.added`, `agent.progress`, `task_run.outcome`, `engineer.heartbeat`
- [-] **2.14.4** Use Redis pub/sub as the broker so multiple API workers can broadcast
- [x] **2.14.5** Reconnection: client should reconnect with exponential backoff; server accepts re-auth on reconnect

### 2.15 Cross-cutting

- [x] **2.15.1** CORS: allow `ALLOWED_ORIGINS` from env
- [x] **2.15.2** Global exception handler: return `{ detail, code }` JSON for all errors
- [x] **2.15.3** Request ID middleware: inject `X-Request-ID` header on all responses
- [x] **2.15.4** Structured JSON logging with request ID, user ID, duration
- [x] **2.15.5** Health check: `GET /health` returns `{ status, db, redis }`
- [x] **2.15.6** OpenAPI docs at `/docs` (disable in prod via env flag)

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
      board/
        page.tsx            # NEW: Kanban board (all projects)
      engineers/
        page.tsx            # NEW: Engineer management
      attention/
        page.tsx            # NEW: Blocked/attention tasks
      users/
        page.tsx            # User management (admin only)
      settings/
        page.tsx            # Profile + API keys + model
  components/
    ui/                     # shadcn primitives
    AppShell.tsx
    ProjectList.tsx
    ProjectDetail.tsx
    TaskCard.tsx
    ChangelogItem.tsx
    WorkflowStepper.tsx
    CreateProjectDialog.tsx
    InviteUserDialog.tsx
    EditUserDialog.tsx
    KanbanBoard.tsx         # NEW
    KanbanColumn.tsx        # NEW
    EngineerCard.tsx        # NEW
    TaskRunTimeline.tsx     # NEW
    CommentThread.tsx       # NEW
    ArtifactUpload.tsx      # NEW
    AttentionTaskCard.tsx   # NEW
    WorkspaceMetrics.tsx    # NEW
    ApproveRejectModal.tsx  # NEW
  lib/
    api.ts
    auth.ts
    ws.ts
    utils.ts
  hooks/
    useProjects.ts
    useTasks.ts
    useUsers.ts
    useAgent.ts
    useProjectSocket.ts
    useEngineers.ts         # NEW
    useTaskRuns.ts          # NEW
    useBoard.ts             # NEW
    useAttentionTasks.ts    # NEW
    useArtifacts.ts         # NEW
  types/
    index.ts
```

### 3.2 Tailwind + shadcn setup

- [x] **3.2.1** Copy `tailwind.config.js` and CSS variables from prototype
- [x] **3.2.2** Copy all shadcn components from prototype: `button`, `badge`, `card`, `dialog`, `progress`, `tabs`, `avatar`, `dropdown`
- [x] **3.2.3** Add `cn` utility

### 3.3 API client (`lib/api.ts`)

- [x] **3.3.1** Typed `apiFetch` wrapper: attaches `Authorization: Bearer <token>`, handles 401 → auto-refresh → retry once, throws typed `ApiError`
- [x] **3.3.2** React Query `queryClient` provider in root layout
- [x] **3.3.3** Hooks (existing):
  - `useCurrentUser()`, `useProjects()`, `useProject(id)`, `useCreateProject()`, `useAdvanceProject(id)`
  - `useTasks(projectId)`, `useUpdateTask()`, `useChangelog(projectId)`
  - `useUsers()`, `useInviteUser()`, `useUpdateUser()`, `useDeleteUser()`
  - `useParseAgent()`, `useRunAgent()`
- [ ] **3.3.4** New hooks:
  - `useEngineers()`, `useCreateEngineer()`, `useLaunchEngineer()`, `useStopEngineer()`
  - `useTaskRuns(taskId)`, `useApproveRun()`, `useRejectRun()`, `useRetryTask()`
  - `useBoard()`, `useProjectBoard(id)`
  - `useAttentionTasks()`, `useWorkspaceMetrics()`
  - `useArtifacts(taskRunId)`, `useUploadArtifact()`
  - `useTaskComments(taskId)`, `useAddComment()`, `useDeleteComment()`
  - `useIntegrations()`, `useSaveIntegration()`

### 3.4 Auth flow

- [x] **3.4.1** Store `access_token` in memory; store `refresh_token` in cookie
- [x] **3.4.2** `AuthContext`: `user`, `login()`, `signup()`, `logout()`, `isLoading`
- [x] **3.4.3** On app load: call `GET /auth/me`; if 401 attempt refresh; if refresh fails redirect `/login`
- [x] **3.4.4** `(app)/layout.tsx`: auth guard + role checks
- [x] **3.4.5** `logout()`: call `POST /auth/logout`, clear tokens, `router.push('/')`

### 3.5 Landing page (`app/(public)/page.tsx`)

- [ ] **3.5.1** Sticky nav with logo, anchor links, Sign in / Get Started buttons
- [ ] **3.5.2** Hero: headline, subheadline, CTA buttons, pipeline badge strip
- [ ] **3.5.3** Features grid (6 cards)
- [ ] **3.5.4** How it works (6-step vertical flow)
- [ ] **3.5.5** BYOK section with model cards
- [ ] **3.5.6** Role cards (5 roles)
- [ ] **3.5.7** Pricing section with monthly/annual toggle and 3 plan cards
- [ ] **3.5.8** CTA banner + footer
- [ ] **3.5.9** All links point to real routes (`/login`, `/signup`)

### 3.6 Login page

- [x] **3.6.1** Port layout from prototype (split panel on desktop)
- [x] **3.6.2** Form: email + password, submit calls `POST /auth/login`, stores tokens, redirects `/projects`
- [x] **3.6.3** Inline error from API (`detail` field)
- [x] **3.6.4** Demo account buttons (pre-fill known seed credentials)
- [x] **3.6.5** Loading spinner on submit

### 3.7 Signup page

- [x] **3.7.1** 2-step form: account details → role picker
- [x] **3.7.2** Step 1 → Step 2 on "Continue"
- [x] **3.7.3** Step 2 submit calls `POST /auth/signup`, stores tokens, redirects `/projects`
- [x] **3.7.4** Show field-level validation errors from Zod + API errors

### 3.8 AppShell

- [x] **3.8.1** Sticky top nav, logo, nav links, bell, user avatar dropdown
- [x] **3.8.2** Mobile hamburger drawer
- [x] **3.8.3** "Team" nav item visible only when `user.role === 'admin'`
- [x] **3.8.4** User dropdown: API Keys & Model → `/settings`, User Management → `/users`, Sign out
- [x] **3.8.5** Active link highlighting via `usePathname()`
- [ ] **3.8.6** Add nav links: "Board" → `/board`, "Engineers" → `/engineers`, "Attention" → `/attention` with blocked-task count badge

### 3.9 Dashboard / Projects page

- [x] **3.9.1** Left sidebar: project list with name, status dot, progress bar, task count
- [x] **3.9.2** "New Project" button opens `CreateProjectDialog`
- [x] **3.9.3** Clicking a project opens detail panel
- [x] **3.9.4** Right panel: `WorkflowStepper`, progress bar, stats row, tabs (Tasks | Changelog)
- [x] **3.9.5** CTA button changes per project status — calls `POST /projects/{id}/advance`
- [x] **3.9.6** Tasks tab: list of `TaskCard` components sorted by position
- [x] **3.9.7** Changelog tab: list of `ChangelogItem` components, paginated
- [x] **3.9.8** Optimistic updates: advancing status + task changes update UI before API confirms
- [x] **3.9.9** Subscribe to WebSocket for this project on panel open; close on unmount

### 3.10 Create Project Dialog

- [x] **3.10.1** Step 1 — Name input
- [x] **3.10.2** Step 2 — Upload PRD + designs via `POST /files/upload`
- [x] **3.10.3** Step 3 — Parse animation: call `POST /agent/parse`; show step-by-step status
- [x] **3.10.4** Step 4 — Preview + edit task list returned by agent
- [x] **3.10.5** On confirm: `POST /projects` then `POST /agent/run/{id}`; navigate to new project

### 3.11 Kanban Board page (`app/(app)/board/page.tsx`) — NEW

- [ ] **3.11.1** Full-width kanban with columns: Pending | In Progress | QA | Done
- [ ] **3.11.2** Task cards grouped by status across all projects; each card shows project name badge
- [ ] **3.11.3** Project filter dropdown to narrow board to one project (calls `GET /projects/{id}/board`)
- [ ] **3.11.4** Drag-to-reorder within a column (react-beautiful-dnd or @dnd-kit); sends `PATCH /tasks/{id}` on drop
- [ ] **3.11.5** Click task card opens task detail slide-over with `TaskRunTimeline` + `CommentThread`
- [ ] **3.11.6** Blocked/attention tasks shown with red border and warning icon
- [ ] **3.11.7** Approve/Reject buttons on task cards where `task_run.outcome === 'needs_human_input'`

### 3.12 Engineer Management page (`app/(app)/engineers/page.tsx`) — NEW

- [ ] **3.12.1** List of engineers with name, template, skills summary, runtime status badge (idle/running/error)
- [ ] **3.12.2** Create engineer dialog: name, template dropdown, skills markdown textarea
- [ ] **3.12.3** Engineer card: heartbeat indicator (green = healthy, red = stale/stopped)
- [ ] **3.12.4** Launch button → `POST /engineers/{id}/launch`; Stop button → `POST /engineers/{id}/stop`
- [ ] **3.12.5** Click engineer to expand runtime history (list of `engineer_runtimes`)
- [ ] **3.12.6** Edit/Delete from engineer card via dropdown
- [ ] **3.12.7** Real-time status updates via WebSocket `engineer.heartbeat` events

### 3.13 Attention Tasks page (`app/(app)/attention/page.tsx`) — NEW

- [ ] **3.13.1** Filtered list of tasks with `needs_human_input` or `blocked` outcomes
- [ ] **3.13.2** Card shows task title, project, blocking reason, age (time since blocked)
- [ ] **3.13.3** Inline Approve + Reject buttons calling `POST /task-runs/{id}/approve` and `reject`
- [ ] **3.13.4** On approve/reject: optimistic remove from list; show toast; invalidate attention query
- [ ] **3.13.5** Empty state: "No tasks need attention" with checkmark illustration

### 3.14 Task Detail Slide-over — NEW

- [ ] **3.14.1** Opens from any TaskCard click (kanban or list view)
- [ ] **3.14.2** Header: task title, status badge, priority badge, assigned engineer
- [ ] **3.14.3** `TaskRunTimeline` — vertical timeline of all runs with phase, outcome, duration
- [ ] **3.14.4** Each run expands to show logs and `EvidenceArtifacts` thumbnails/links
- [ ] **3.14.5** `CommentThread` — list of comments (human blue, AI purple) with add-comment input
- [ ] **3.14.6** Action buttons: Retry, Approve, Reject (shown based on current run outcome)
- [ ] **3.14.7** Artifact upload dropzone linked to active task run

### 3.15 WebSocket integration

- [x] **3.15.1** Connect to `ws://API_HOST/ws/{project_id}?token=<access_token>`
- [x] **3.15.2** On `task.updated` event → update React Query cache
- [x] **3.15.3** On `project.status_changed` → invalidate project query
- [x] **3.15.4** On `changelog.added` → prepend to changelog cache
- [x] **3.15.5** Reconnect with exponential backoff
- [x] **3.15.6** Show connection status indicator
- [ ] **3.15.7** On `task_run.outcome` with `needs_human_input` → increment attention badge counter; show toast
- [ ] **3.15.8** On `engineer.heartbeat` → update engineer runtime status in cache

### 3.16 User Management page — admin only

- [x] **3.16.1** Redirect non-admins to `/projects`
- [x] **3.16.2** Role stat cards, search/filter, member table
- [x] **3.16.3** Invite dialog → `POST /users/invite`
- [x] **3.16.4** Edit dialog → `PATCH /users/{id}`
- [x] **3.16.5** Delete confirmation → `DELETE /users/{id}`
- [x] **3.16.6** Permissions matrix table
- [x] **3.16.7** All mutations invalidate `useUsers()` query on success

### 3.17 Settings page

- [x] **3.17.1** Profile section: name edit → `PATCH /users/{id}`
- [x] **3.17.2** API Keys section: per-provider inline edit → `PUT /users/{id}/api-keys`; display masked
- [x] **3.17.3** Model picker: select from model list; disabled if key missing
- [x] **3.17.4** Show "No key" badge on models without a configured key
- [x] **3.17.5** Success toast on each save
- [ ] **3.17.6** Integrations tab: GitHub token + repo URL + default branch per project; AWS credentials (global)
- [ ] **3.17.7** Connection test button for GitHub: verify token + repo access with `GET /integrations/github/verify`

### 3.18 Workspace Metrics (Dashboard header) — NEW

- [ ] **3.18.1** Metric cards in app header or overview panel: total projects, engineers running, total tasks, blocked tasks
- [ ] **3.18.2** Blocked tasks card links to `/attention`
- [ ] **3.18.3** Data from `GET /overview/metrics`; refresh every 30s or on WS events

---

## 4. Real-time Agent UX

- [-] **4.1** When a project is `running`, show animated "agent is working" indicator in project detail header
- [-] **4.2** Active task card shows `Loader2` spinner and pulsing border
- [-] **4.3** Changelog entries animate in (slide + fade) as the agent adds them in real time
- [-] **4.4** Progress bar smoothly animates as `project.progress` updates via WS
- [-] **4.5** When agent finishes (all tasks `done`), auto-advance project to `qa` and show toast
- [ ] **4.6** Task run outcome banner: when a run needs human input, show dismissable banner with Approve/Reject actions
- [ ] **4.7** Engineer health indicator: pulse dot in engineers list; turns red if heartbeat is stale > 60s

---

## 5. Testing

### 5.1 Backend

- [ ] **5.1.1** pytest + pytest-asyncio setup; test DB using SQLite in-memory
- [ ] **5.1.2** Auth tests: signup, login, refresh, logout, expired token, wrong password
- [ ] **5.1.3** User tests: CRUD, role guards (403 for non-admin), self-update limits
- [ ] **5.1.4** Project tests: create, list, advance (valid + invalid transitions), permission checks
- [ ] **5.1.5** Task tests: CRUD, reorder, progress recalculation
- [ ] **5.1.6** Engineer tests: create, launch/stop, heartbeat stale detection
- [ ] **5.1.7** Task run tests: approve/reject flow, outcome transitions
- [ ] **5.1.8** Agent parser test: mock LLM call, verify task schema extracted correctly
- [ ] **5.1.9** File upload test: valid types accepted, oversized rejected, MIME validation

### 5.2 Frontend

- [ ] **5.2.1** Vitest + Testing Library setup
- [ ] **5.2.2** `AuthContext` unit tests: login/logout flow, token refresh
- [ ] **5.2.3** `apiFetch` unit tests: 401 → refresh → retry, ApiError thrown correctly
- [ ] **5.2.4** `CreateProjectDialog` integration test: step navigation, file upload mock, parse mock
- [ ] **5.2.5** `WorkflowStepper` snapshot: correct step highlighted per status
- [ ] **5.2.6** `UserManagement` page: invite + edit + delete flows with mocked queries
- [ ] **5.2.7** `KanbanBoard` test: tasks render in correct columns; drag-drop mock
- [ ] **5.2.8** `AttentionTaskCard` test: approve/reject mutations fire correctly

### 5.3 E2E (Playwright)

- [ ] **5.3.1** Playwright setup pointing at local `docker-compose` stack
- [ ] **5.3.2** Happy path: sign up → create project → upload PRD → parse → start build → advance to deployed
- [ ] **5.3.3** Auth guard: unauthenticated user redirected to `/login`
- [ ] **5.3.4** Role guard: non-admin cannot access `/users`
- [ ] **5.3.5** Settings: save API key → key appears masked → clear key → model disabled
- [ ] **5.3.6** Kanban: task appears in correct column; drag to new column persists after reload
- [ ] **5.3.7** Engineer: create → launch → heartbeat visible → stop

---

## 6. Infrastructure & Deployment

- [ ] **6.1** `Dockerfile` for API: multi-stage, python 3.12-slim, non-root user
- [ ] **6.2** `Dockerfile` for Web: multi-stage Next.js standalone output
- [ ] **6.3** `docker-compose.yml` for local dev: hot reload for both services + Postgres + Redis
- [ ] **6.4** `docker-compose.prod.yml`: no volume mounts, env from secrets
- [ ] **6.5** Nginx reverse proxy config: `/api/*` → FastAPI, `/*` → Next.js, WebSocket upgrade headers
- [ ] **6.6** Alembic auto-migration on API container startup (`alembic upgrade head` in entrypoint)
- [ ] **6.7** GitHub Actions CI: lint → test → build on every PR
- [ ] **6.8** GitHub Actions deploy workflow: build images → push to registry → SSH deploy
- [ ] **6.9** Secrets: document how to rotate `SECRET_KEY` and `ENCRYPTION_KEY` without breaking sessions

---

## 7. Polish & Beta Hardening

- [ ] **7.1** Rate limit `POST /auth/login` to 10 req/min per IP (slowapi)
- [ ] **7.2** Rate limit `POST /agent/parse` + `/agent/run` to 5 req/min per user
- [ ] **7.3** Input sanitization: strip HTML from all string fields before DB write
- [ ] **7.4** File upload: validate MIME type server-side (not just extension); scan with `python-magic`
- [ ] **7.5** API key encryption: rotate Fernet key support (re-encrypt on next key save)
- [ ] **7.6** Pagination on `/projects`, `/users`, `/changelog`, `/task-runs` (cursor-based, page size 50)
- [ ] **7.7** 404 and 403 pages in Next.js (`not-found.tsx`, middleware redirect)
- [ ] **7.8** `robots.txt` and `sitemap.xml` for landing page SEO
- [ ] **7.9** OpenGraph meta tags on landing page
- [ ] **7.10** Lighthouse score ≥ 90 on landing page (performance, accessibility)
- [ ] **7.11** Engineer skill templates: ship 3 built-in templates (frontend, backend, fullstack) as seed data
- [ ] **7.12** Task run log streaming: stream logs to frontend via WS `task_run.log` events in real time

---

## Build Order (recommended)

```
Phase 1 — Foundation (DONE)
  0.1, 0.3–0.6  Repo & workspace
  1.1–1.4       Database models + seed
  2.2–2.8       Core API (auth, users, projects, tasks, files, agent skeleton)
  3.2–3.10      Core frontend (auth, dashboard, user mgmt, settings)

Phase 2 — Docker & Real Agent (next)
  0.2           docker-compose (Postgres + Redis)
  1.4.2         Complete seed data
  2.8.4         Complete agent run loop
  2.14.4        Redis pub/sub for WS broadcast
  4.1–4.5       Polish real-time agent UX

Phase 3 — Engineers + Task Runs (week 3)
  1.2.7–1.2.12  New DB models (engineers, task_runs, comments, artifacts)
  1.3.7–1.3.11  New enums
  2.9           Engineers API
  2.10          Task runs API (approve/reject)
  2.12          Artifacts API
  3.11          Engineer management page
  3.14          Task detail slide-over (runs, comments, artifacts)
  4.6–4.7       Attention UX

Phase 4 — Kanban + Attention (week 4)
  2.11          Board API
  3.11          Kanban board page
  3.13          Attention tasks page
  3.15.7–3.15.8 New WS events
  3.18          Workspace metrics

Phase 5 — Integrations (week 5)
  2.13.2–2.13.6  GitHub + AWS integration services
  3.17.6–3.17.7  Settings integrations tab

Phase 6 — Landing page (week 5)
  3.5           Port landing page

Phase 7 — Tests + infra (week 6)
  5.1–5.3       Tests
  6.1–6.9       Docker + CI/CD

Phase 8 — Polish (week 7)
  7.1–7.12      Hardening + polish
```

---

## Open Questions

- **File storage**: local disk for beta, S3-compatible (Cloudflare R2) for prod — finalize before §2.7
- **Agent run model**: asyncio background tasks for beta; Celery for scale
- **Engineer containers**: real Docker execution vs simulated for beta — keep simulated until Phase 3
- **LLM cost controls**: add per-user monthly token budget tracking if needed
- **Invite flow**: email sending out of scope for beta — share credentials manually
- **GitHub integration scope**: Phase 5 for real repo operations; Phase 3 uses simulated branch/PR creation
