# Gravel Engineer Runtime

The containerized worker behind an "engineer" in Gravel. The API launches one
container per runtime (see `apps/api/services/runtime_manager.py`); the
container then:

1. sends heartbeats to `/api/engineers/runtimes/{id}/heartbeat`
2. polls `/api/agent/poll-next-task` for pending task runs owned by its owner
3. clones the project repo, checks out the task branch, writes the task bundle
   (`TASK.md`, `COMMENTS.md`, `PROJECT_CONTEXT.md`, `STAGE_INSTRUCTIONS.md`)
4. executes the phase with `opencode` (or a single LLM call with
   `GRAVEL_EXECUTOR=llm`)
5. pushes the branch, opens a PR after build, and reports the structured
   outcome to `/api/agent/task-runs/{id}/outcome`

All configuration arrives as `GRAVEL_*` environment variables injected at
launch, including a one-time bearer token (`GRAVEL_RUNTIME_TOKEN`) that
authenticates every API call. Provider keys (`ANTHROPIC_API_KEY`, …) come from
the owner's BYOK settings; `GRAVEL_GITHUB_TOKEN` from the owner's GitHub
integration.

Build locally:

```bash
docker build -t gravel-engineer:latest apps/runtime
```
