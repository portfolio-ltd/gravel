# Architecture

```
apps/web      Next.js 15 App Router · Tailwind · React Query · dnd-kit
apps/api      FastAPI · SQLAlchemy 2 (async) · Alembic · Postgres or SQLite
apps/runtime  Python worker run as a Docker container per engineer runtime
```

## API layout

```
apps/api/
  main.py            app, CORS, request logging, router registration
  config.py          settings from env (.env discovered up the tree)
  models/            SQLAlchemy models
  schemas/           Pydantic request/response models
  routers/           HTTP + WebSocket endpoints (all under /api, ws at /ws/{project_id})
  services/
    orchestrator.py  the run state machine: stages, gates, rework, bundle
    sdlc.py          the method: stage roles, templates, result contract, artifacts
    agent.py         in-process executor (LLM or simulated) + drain loop
    llm.py           provider-neutral LLM calls (Anthropic / OpenAI / Groq)
    issues.py        GitHub Issues import and comment-back
    harness.py       agent harnesses: templates, resolution (stage → org default → built-in)
    subagents.py     the built-in harness and the .gravel/ files that render any harness
    knowledge_graph  wikilinks, slugs, the map, Obsidian export / markdown import
    code_graph.py    repository mapping (modules, imports, stack, commands)
    runtime_manager  launches/stops engineer containers
    token_usage.py   usage ledger and price map
  alembic/versions/  migrations (run `alembic upgrade head`)
```

## Data model

- **Organization** ← members (admin/member). Everything below is org-scoped.
- **Project** — repo, default model, optional **Workflow**, optional GitHub
  `issues_repo`.
- **Workflow** → ordered **WorkflowStage**s (role, approval gate, open-question
  gate, AI/manual, rework target, success edge, attempt budget, assigned
  engineer, optional model — runs resolve stage → engineer → project →
  `DEFAULT_MODEL` — and optional **harness**).
- **AgentHarness** — org-scoped: subagents, routing per role, test gate, review
  rounds, turn and tool limits, extra instructions; one may be the default.
- **Task** — status, priority, type, `acceptance_criteria` (JSON checklist with
  human/ai source), current stage, branch/PR/deploy links, external issue link.
- **TaskRun** — one execution of a stage/phase: outcome, summary, gate state,
  attempt number, logs (**TaskRunLog**), evidence (**EvidenceArtifact**).
- **TaskComment** — human and AI discussion; `changes_requested` flags.
- **TaskDocument** — versioned stage documents (analysis, spec, plan,
  scenarios, review, verification, notes).
- **OpenQuestion** — question, owner, status (open/answered/deferred/dismissed),
  blocking flag, answer.
- **KnowledgeEntry** — org- or project-scoped decision / pattern / glossary /
  runbook / convention / wiki page with status proposed → accepted (decisions
  get numbers), a unique **slug** for `[[wikilinks]]`, and an optional parent.
- **ExternalLink** — a URL (docs, design, ticket, dashboard, repo, spec) attached
  to a project, task, PRD or knowledge entry.
- **CodeGraph** — one per project: modules, import edges, stack, commands.
- **Engineer** → **EngineerRuntime** (container, token hash, heartbeat, claim).
- **PRD**, **Tag**, **TokenUsage**, **ChangelogEntry**, integrations.

## Run lifecycle

```
enter_stage ──▶ TaskRun (pending)
                   │  claimed by runtime (poll) or in-process drain
                   ▼
            apply_outcome
              ├─ persist artifacts (documents, criteria, questions, knowledge)
              ├─ verdict changes_requested ─▶ treated as failed
              ├─ complete ─▶ open blocking questions? ─▶ park (needs_human_input)
              │             approval gate?           ─▶ park (approval_required)
              │             otherwise                ─▶ enter next stage / done
              ├─ needs_human_input / blocked ─▶ park
              └─ failed ─▶ rework target (within budget) or park
approve ─▶ next stage (or rerun a parked AI stage)
reject  ─▶ request changes: comment + rework target / rerun
```

Parked runs appear on the Attention page, the board and the task panel.

## Real-time updates

The API broadcasts JSON events per project over `/ws/{project_id}`
(`task.updated`, `task.artifacts`, `task_run.outcome`, `agent.progress`,
`changelog.added`, `tasks.imported`, …). With `REDIS_URL` set, events fan out
across API workers via Redis pub/sub; the web app invalidates the matching
React Query caches.

## Security model

- JWT access tokens + rotating refresh tokens; `X-Org-Id` selects the active
  org and membership is checked on every request.
- BYOK provider keys, Git tokens and deploy configs are Fernet-encrypted with
  `ENCRYPTION_KEY`.
- Uploads get sanitized names inside `UPLOAD_DIR` and are only served through
  authenticated, org-checked endpoints.
- Runtime tokens are stored hashed and revoked on stop.
