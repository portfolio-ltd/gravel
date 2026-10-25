# Gravel engineer runtime

The worker behind an "engineer" in Gravel. The API launches one container per
runtime (`apps/api/services/runtime_manager.py`); the container then loops:

1. heartbeat → `POST /api/engineers/runtimes/{id}/heartbeat`
2. claim work → `POST /api/agent/poll-next-task`
3. clone the project repo and check out the task branch — continuing from
   `origin`'s copy when it exists, so review and verify see what build pushed
4. write the task bundle into `.gravel/` (excluded via `.git/info/exclude`,
   never committed): task, stage instructions, comments, project context,
   knowledge base, questions, earlier stage documents, output contract
5. execute the stage with `opencode`, Claude Code (`GRAVEL_EXECUTOR=claude-code`),
   or one LLM call (`GRAVEL_EXECUTOR=llm`)
6. collect the result from `.gravel/output/` (`result.json`, `<kind>.md`)
7. for code-writing roles only (`build`, `custom`, legacy build/testing):
   commit, push, and open a PR after a successful build
8. report → `POST /api/agent/task-runs/{id}/outcome`

Full protocol: [docs/runtime-protocol.md](../../docs/runtime-protocol.md).

## Configuration

Everything arrives as `GRAVEL_*` environment variables injected at launch:
`GRAVEL_API_BASE_URL`, `GRAVEL_ENGINEER_ID`, `GRAVEL_RUNTIME_ID`,
`GRAVEL_RUNTIME_TOKEN` (one-time bearer token), `GRAVEL_MODEL_PROVIDER`,
`GRAVEL_MODEL_NAME` (default `claude-opus-5-5`), `GRAVEL_EXECUTOR`
(`opencode` | `claude-code` | `llm`, set from the API's `RUNTIME_EXECUTOR`),
`GRAVEL_GITHUB_TOKEN`, `GRAVEL_DRY_RUN`. Provider keys
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`) come from the
engineer owner's BYOK settings.

The `claude-code` executor runs `claude -p … --output-format json` headless
with permissions skipped (the container is the sandbox). It needs an
Anthropic model and `ANTHROPIC_API_KEY`; `GRAVEL_CLAUDE_MAX_TURNS` caps its
agent turns (default `0`, no cap). The image pins the CLI version with the
`CLAUDE_CODE_VERSION` build arg:

```bash
docker build --build-arg CLAUDE_CODE_VERSION=2.1.308 -t gravel-engineer:latest apps/runtime
```

## Build and test

```bash
docker build -t gravel-engineer:latest apps/runtime

cd apps/runtime
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -e ".[test]"
.venv/bin/python -m pytest -q     # uses real local git repos, no network
```

## Security

The runtime executes AI-written code with push access to your repository.
Scope `GRAVEL_GITHUB_TOKEN` to the repositories Gravel works on, and run
runtimes on infrastructure you're comfortable treating as untrusted.
