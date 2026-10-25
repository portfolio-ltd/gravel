# Engineer runtime protocol

An engineer runtime is a worker that claims task runs from the API, does the
work in a git workspace, and reports a structured result. The reference
implementation lives in `apps/runtime`; any program that speaks this protocol
can be an engineer.

## Authentication

Launching an engineer (`POST /api/engineers/{id}/launch`) returns a one-time
**runtime token**. The container receives it as `GRAVEL_RUNTIME_TOKEN` and
sends it as `Authorization: Bearer <token>` on every call. Stopping the
engineer revokes the token and re-queues any claimed run.

Environment injected at launch: `GRAVEL_API_BASE_URL`, `GRAVEL_ENGINEER_ID`,
`GRAVEL_RUNTIME_ID`, `GRAVEL_RUNTIME_TOKEN`, `GRAVEL_MODEL_PROVIDER`,
`GRAVEL_MODEL_NAME`, `GRAVEL_EXECUTOR`, `GRAVEL_POLL_INTERVAL_SECONDS`,
`GRAVEL_HEARTBEAT_INTERVAL_SECONDS`, optional `GRAVEL_GITHUB_TOKEN`, and the
owner's provider key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GROQ_API_KEY`).

## Endpoints

| Method & path | Purpose |
|---|---|
| `POST /api/engineers/runtimes/{runtime_id}/heartbeat` | Runtime liveness |
| `POST /api/agent/poll-next-task` | Claim the oldest pending run in the engineer's org (one at a time) |
| `POST /api/agent/task-runs/{run_id}/heartbeat` | Run liveness while working |
| `POST /api/agent/task-runs/{run_id}/logs` | `{message, level}` — appears in the run timeline |
| `POST /api/agent/task-runs/{run_id}/outcome` | Report the result (once per run) |

### Poll response

```json
{
  "task_run": {"id": "…", "phase": "build", "workflow_stage_id": "…", "attempt_number": 1, …},
  "task": {"id": "…", "title": "…", "description": "…", "branch_name": null, …},
  "project": {"id": "…", "repo_url": "https://github.com/acme/web", "default_branch": "main", …},
  "workflow_stage": {"name": "Plan", "role": "plan", "produces": ["plan", "scenarios"],
                     "is_first": false, "is_last": false, "requires_human_approval": true},
  "bundle": {"TASK.md": "…", "STAGE_INSTRUCTIONS.md": "…", "docs/PLAN.md": "…", …},
  "model": "claude-haiku-5-5",
  "model_provider": "anthropic"
}
```

An empty poll returns `{"task_run": null, …}`.

`model` is the model resolved for this run — the stage's model, else the
engineer's, else the project's default, else `DEFAULT_MODEL` — and
`model_provider` is the provider that serves it. Runtimes should run the task
on that model and report it in the outcome's `model` field so usage is priced
correctly. A runtime without a key for `model_provider` falls back to its
launch model (`GRAVEL_MODEL_NAME`) and says so in the run log; runtimes that
ignore these fields keep using their launch model.

### Outcome payload

```json
{
  "outcome": "build_complete | needs_human_input | blocked | failed",
  "summary": "…",
  "blocking_reason": "…",
  "branch_name": "gravel/task-1a2b3c4d",
  "pr_url": "https://github.com/acme/web/pull/42",
  "deploy_url": null,
  "tokens_in": 12000, "tokens_out": 3400, "model": "claude-opus-5-5",
  "verdict": "pass | changes_requested",
  "documents": [{"kind": "plan", "title": "Plan", "body": "…"}],
  "acceptance_criteria": ["…"],
  "open_questions": [{"question": "…", "owner": "…"}],
  "resolved_questions": [{"id": "…", "answer": "…"}],
  "knowledge": [{"kind": "decision", "title": "…", "body": "…"}]
}
```

Workflow stage runs report `build_complete` for any successful stage; legacy
phase runs report the phase's own `*_complete` outcome. Every structured field
is optional — older runtimes that send only `outcome` and `summary` keep working.

## The `.gravel/` bundle

The runtime writes the bundle into `<repo>/.gravel/` and adds `/.gravel/` to
the clone's `.git/info/exclude`, so bundle files are never committed and the
project's own `.gitignore` is untouched. Paths that would escape `.gravel/`
are ignored.

```
.gravel/
  TASK.md                 title, requirements, acceptance criteria, source issue
  STAGE_INSTRUCTIONS.md   stage name, role, instructions (+ grounding guidance)
  COMMENTS.md             the task's comment thread
  PROJECT_CONTEXT.md      repo, branches, resolved model, engineer skills
  KNOWLEDGE.md            accepted decisions, patterns, glossary, runbooks, conventions
  QUESTIONS.md            open / answered / deferred questions with ids
  OUTPUT_CONTRACT.md      how to report the result
  docs/ANALYSIS.md        latest stage documents, when they exist
  docs/SPEC.md
  docs/PLAN.md
  docs/SCENARIOS.feature
  docs/REVIEW.md
  docs/VERIFICATION.md
  output/                 the engineer writes its result here
```

### Reporting from the workspace

An engineer reports by writing `.gravel/output/result.json` (the contract
above, with `outcome` = `completed | needs_human_input | blocked | failed`) and
ending its final message with the same JSON. Long documents may instead be
written as files named after their kind — `.gravel/output/plan.md`,
`review.md`, `scenarios.feature`, … — which take precedence over inline
documents of the same kind.

## Git behaviour

- Every workflow stage works on the task branch (`gravel/task-<id8>` unless the
  task already has one). If the branch exists on `origin`, the runtime
  continues from it, so review and verify see what build pushed.
- Only **code-writing roles** (`build`, `custom`, and the legacy build/testing
  phases) commit and push. Analyze, refine, plan, review, verify and deploy
  only read the repository and send documents back to Gravel.
- A pull request is opened (or reused) after a successful build that pushed.
