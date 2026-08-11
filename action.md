# Gravel — Action Items (Gap Analysis vs DevBoss)

Analysis of https://github.com/devbosshub/devboss against current Gravel state.
These are concrete features Gravel is missing that DevBoss has shipped.

---

## Priority 1 — Unblock current build (immediate)

### A. Docker Compose (task 0.2)
DevBoss ships with a full `docker-compose.yml` as the primary dev entrypoint. Gravel has no Compose file, making Redis (required for WS) and Postgres (required for prod parity) unavailable.

**What to build:**
- `docker-compose.yml`: services `web`, `api`, `db` (Postgres 16), `redis`
- Hot-reload mounts for both `apps/api` and `apps/web`
- Entrypoint runs `alembic upgrade head` before starting uvicorn
- `.env.example` already exists — wire vars into Compose

### B. Complete agent run loop (task 2.8.4)
The agent service skeleton exists but doesn't execute tasks. Without a working loop, the core value prop is dead.

**What to build:**
- Background asyncio task that picks `pending` tasks by priority + position
- Creates a `TaskRun` record per execution attempt
- Calls LLM (Anthropic/OpenAI/Groq) with task + PRD context
- Updates task status, emits WS events, writes changelog on success
- Retry-once on failure; set back to `pending` with error note after second failure

### C. Redis WebSocket broadcast (task 2.14.4)
WebSocket manager uses in-process connections only — won't work with multiple workers or Docker.

**What to build:**
- Wire `aioredis` pub/sub into `ws_manager.py`
- Every `emit()` call publishes to a Redis channel `project:{project_id}`
- Each worker subscribes and fans out to its local connections

---

## Priority 2 — AI Engineer Management (DevBoss core differentiator)

DevBoss treats AI agents as first-class "Engineers" — named entities with templates, skill definitions, runtime containers, and health monitoring. Gravel has no equivalent.

### D. Engineer data model + API (tasks 1.2.7–1.2.8, 2.9.1–2.9.10)
**New DB tables:** `engineers`, `engineer_runtimes`

**New API endpoints:**
```
POST   /engineers                          create
GET    /engineers                          list with health status
GET    /engineers/{id}                     detail + active runtime
PATCH  /engineers/{id}                     update
DELETE /engineers/{id}                     remove
POST   /engineers/{id}/launch              start runtime
POST   /engineers/{id}/stop                stop all runtimes
POST   /engineer-runtimes/{id}/heartbeat   agent checks in
POST   /engineer-runtimes/{id}/stop        stop specific
POST   /engineer-runtimes/{id}/restart     restart stopped
```

**Heartbeat logic:** mark runtime `status=error` if no heartbeat in 60s. Emit `engineer.heartbeat` WS event on each check-in so frontend updates live.

### E. Engineer Management page (task 3.12.1–3.12.7)
**New page: `/app/engineers`**

- Grid of engineer cards: name, skills preview, runtime status badge
- Create dialog: name, template (frontend/backend/fullstack), skills markdown editor
- Launch / Stop buttons with loading state
- Heartbeat pulse indicator (green = healthy, red = stale)
- Runtime history expandable per engineer
- Real-time status via WS `engineer.heartbeat` events

---

## Priority 3 — Task Execution Tracking & Human Approval Gates

DevBoss has `TaskRun` entities tracking each execution attempt with phases, outcomes, logs, and human approve/reject gates. Gravel has no execution history.

### F. Task run data model + API (tasks 1.2.9–1.2.10, 2.10.1–2.10.7)
**New DB tables:** `task_runs`, `task_run_logs`

**New API endpoints:**
```
GET    /task-runs/{id}                            detail + logs + artifacts
POST   /task-runs/{id}/approve                    human approves
POST   /task-runs/{id}/reject                     human rejects → task back to pending
POST   /agent/task-runs/{id}/heartbeat            agent reports alive
POST   /agent/task-runs/{id}/logs                 agent submits log lines
POST   /agent/task-runs/{id}/outcome              agent reports phase result
POST   /agent/poll-next-task                      agent polls for next work item
```

**Outcome types:** `grooming_complete | build_complete | testing_complete | deployment_complete | needs_human_input | blocked | failed`

When outcome is `needs_human_input` or `blocked`:
- Emit WS event `task_run.outcome` so frontend shows attention badge
- Add task to "attention" query

### G. Human approval workflow in agent loop (task 2.8.4 update)
Modify agent run loop to pause at strategic gates:
- After AI grooming: emit `needs_human_input` if acceptance criteria are unclear
- After build: create PR, set outcome `build_complete`, wait for human approval before AI testing
- After AI testing: emit outcome with test results; human can approve → deploy or reject → rebuild

---

## Priority 4 — Kanban Board View

DevBoss ships a kanban board as the primary task visualization. Gravel has only list/tab view.

### H. Board API (tasks 2.11.1–2.11.4)
**New endpoints:**
```
GET /board                          all-projects kanban
GET /projects/{id}/board            per-project board
GET /overview/attention-tasks       blocked/needs-input tasks
GET /overview/metrics               workspace stats (project/engineer/task counts)
```

### I. Kanban Board page (tasks 3.11.1–3.11.7)
**New page: `/app/board`**

- Columns: Pending | In Progress | QA | Done
- Task cards show project badge, priority indicator, attention flag
- Project filter dropdown
- Click card → Task Detail Slide-over (see §J)
- Approve/Reject buttons inline on attention tasks
- Drag-to-reorder within columns via `@dnd-kit/core`

### J. Task Detail Slide-over (tasks 3.14.1–3.14.7)
Replaces current task card interaction. Opens from kanban or list.

- Header: title, status, priority, assigned engineer
- `TaskRunTimeline`: vertical list of all runs, each expandable with logs + artifacts
- `CommentThread`: human + AI comments with color coding
- Action bar: Retry / Approve / Reject based on current run state
- Artifact upload dropzone

---

## Priority 5 — Attention Tasks & Workspace Metrics

### K. Attention Tasks page (tasks 3.13.1–3.13.5)
**New page: `/app/attention`**

- Tasks with `needs_human_input` or `blocked` outcome
- Shows blocking reason and time blocked
- Inline approve/reject
- Attention badge count in AppShell nav

### L. Workspace Metrics (task 3.18.1–3.18.3)
Replace empty dashboard with metric cards:
- Total projects, engineers running, total tasks, blocked tasks
- Blocked count links to `/attention`
- Data from `GET /overview/metrics`; auto-refresh on WS events

---

## Priority 6 — Evidence Artifacts

DevBoss lets agents upload screenshots, logs, and test results as proof-of-work attached to task runs.

### M. Artifact upload API + UI (tasks 1.2.12, 2.12.1–2.12.3, 3.14.7)
**New DB table:** `evidence_artifacts`

**New endpoint:**
```
POST /artifacts/upload    multipart; artifact_type + task_run_id
GET  /task-runs/{id}/artifacts
DELETE /artifacts/{id}
```

Frontend: dropzone in Task Detail Slide-over; thumbnail grid for screenshots; log viewer for text files.

---

## Priority 7 — Comment System on Tasks

DevBoss tracks comments from both humans and AI agents on tasks, with action flags.

### N. Task comment API + UI (tasks 1.2.11, 2.5.8–2.5.9, 3.14.5)
**New DB table:** `task_comments`

**New endpoints:**
```
POST   /tasks/{id}/comments            add comment (human or AI)
DELETE /tasks/{id}/comments/{cid}      remove
```

Frontend: `CommentThread` in Task Detail Slide-over. Human comments = blue, AI comments = purple.
Agent service writes AI comments after each phase completes.

---

## Priority 8 — Real GitHub + AWS Integration

DevBoss has working GitHub (clone, branch, PR) and AWS (S3 + CloudFront) integrations. Gravel has the schema but no implementation.

### O. GitHub integration service (tasks 2.13.2–2.13.4)
Using `PyGithub` or raw `httpx` calls with stored personal access token:

```python
# services/github.py
clone_repo(repo_url, workspace_path, token)
create_branch(repo_url, branch_name, base_branch, token)
create_pull_request(repo_url, title, body, head_branch, base_branch, token)
```

Wire into agent run loop: create branch before build, open PR on `build_complete`.

### P. AWS deployment service (tasks 2.13.5)
```python
# services/deployment.py
deploy_to_s3(build_path, bucket_name, aws_key, aws_secret, region)
invalidate_cloudfront(distribution_id, aws_key, aws_secret, region)
```

Called when agent reaches `deployment` phase. Credentials from project integration config (encrypted).

### Q. Integrations settings tab (tasks 3.17.6–3.17.7)
Add "Integrations" tab to Settings page:
- GitHub section: personal access token + repo URL + default branch (per project)
- AWS section: access key + secret + region (global)
- "Test connection" button for GitHub that calls verify endpoint

---

## Priority 9 — Landing Page

Gravel has no public landing page (root `/` redirects to login).

### R. Landing page (tasks 3.5.1–3.5.9)
Port all sections from prototype `src/pages/Landing.tsx`:
- Sticky nav, hero, features grid, how-it-works, BYOK section, role cards, pricing, footer
- Update hero copy to highlight kanban board, engineer management, and human approval gates (new differentiators)

---

## Priority 10 — Infrastructure & CI (before beta)

### S. CI/CD pipeline (tasks 0.7, 6.7–6.8)
- GitHub Actions: lint → test → build on every PR
- Deploy workflow: build Docker images → push to registry → SSH deploy target

### T. Dockerfiles (tasks 6.1–6.2)
- API: multi-stage python 3.12-slim, non-root, `alembic upgrade head` in entrypoint
- Web: multi-stage Next.js standalone output

---

## Quick-wins (can do in parallel with above)

| Item | Effort | Impact |
|------|--------|--------|
| Seed 3 built-in engineer templates (task 7.11) | 1h | Medium — makes engineer creation feel polished |
| `GET /overview/attention-tasks` count in AppShell badge | 2h | High — visible health signal |
| Task retry button on failed tasks (task 2.5.7) | 2h | High — usability without needing full task run model |
| Paginate `/changelog` and `/tasks` list (task 7.6) | 2h | Medium — needed before load testing |
| `robots.txt` + OG tags on landing (tasks 7.8–7.9) | 1h | Low effort, SEO value |
| Add `@dnd-kit` dep now so it's ready for kanban (task 3.11.4) | 30m | Unblocks kanban work |

---

## What DevBoss does NOT have that Gravel should keep as differentiators

- **BYOK (Bring Your Own Key)** — per-user encrypted API keys for Anthropic/OpenAI/Groq. DevBoss uses a single global Codex credential.
- **5-role team structure** — admin/developer/qa/product/devops with permissions matrix. DevBoss has no role system.
- **Signup flow + multi-tenant** — DevBoss is single-tenant (self-hosted). Gravel's signup + invite system enables SaaS multi-tenancy.
- **Next.js App Router** — DevBoss uses Pages Router (Next.js 16.2 but older pattern). Gravel's App Router + RSC is more modern.
