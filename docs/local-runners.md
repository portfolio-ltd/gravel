# Local runners, the CLI and the VS Code extension

Use a hosted Gravel (for example trygravel.com) from your terminal and editor,
and let the AI work run **on your machine** with the AI CLI you are already
signed in to — Claude Code or OpenAI's Codex CLI. You don't need an API key in
Gravel, and your model credentials never reach the server.

```
hosted Gravel  ◀── HTTPS ──▶  gravel work on your laptop
(tasks, gates, docs)          ├─ fresh checkouts in ~/.cache/gravel/work
                              └─ claude / codex, signed in with your own account
VS Code extension ── same API ── tasks, "Needs you", approve, start the runner
```

## Quick start

```bash
pip install "git+https://github.com/portfolio-ltd/gravel#subdirectory=apps/runtime"
gravel login --server https://api.trygravel.com   # approve the code in the browser
gravel work --executor claude-code                # or: --executor codex
```

`gravel login` uses device login: the CLI shows a code, you approve it at
`/cli` in the web app, and the CLI receives an API token (stored in
`~/.config/gravel/credentials.json`, mode 600). You can also create a token
under **Settings → CLI & tokens** and run `gravel login --token grv_…`.

Other commands: `gravel whoami`, `gravel projects`, `gravel tasks PROJECT_ID`,
`gravel gates`, `gravel approve RUN_ID [-m note]`, `gravel reject RUN_ID -m note`.

## What `gravel work` does

1. Registers this machine as a **local runner** (`POST /api/runners/register`
   with your API token) and gets a runtime token for it. The runner shows up on
   the Engineers page with its machine name, executor and online state.
2. Speaks the normal [runtime protocol](runtime-protocol.md): poll for a run,
   clone the repo into a fresh workspace, write the `.gravel/` bundle, execute,
   push the task branch, open a PR, report the result.
3. Answers **model calls** for you in a second thread (see *Keyless projects*).
4. On Ctrl+C, `kill`, or the terminal closing, marks itself offline. A runner
   that stops heartbeating counts as offline after 3 minutes; starting
   `gravel work` again on the same machine retires the old registration.

| Flag | Default | Meaning |
|---|---|---|
| `--executor` | `claude-code` | `claude-code`, `codex` or `opencode` — the CLI you're signed in to |
| `--model` | Gravel's model, or Codex's default | Model passed to the executor |
| `--name` | hostname | How the machine shows up in Gravel |
| `--team` | off | Take runs from the whole organization, not just projects you own |
| `--ssh` | off | Clone GitHub repos over SSH with your own keys |
| `--workdir` | `~/.cache/gravel/work` | Where task checkouts go |
| `--account` | none | Label for the AI account the CLI is signed in to (env `GRAVEL_ACCOUNT`); see *Several AI accounts* |
| `--once` | off | Take at most one run, then exit |

**Whose work it takes.** A runner is personal by default: it only claims runs
from projects you own, because it spends your own subscription. `--team` makes
it serve everyone in the organization.

**Git and pull requests.** Your own git credentials are used to clone and
push (`--ssh` for SSH keys). Pull requests are opened with your `gh` login when
no `GRAVEL_GITHUB_TOKEN` is set.

**Codex.** Runs `codex exec --sandbox workspace-write` (network off inside the
sandbox) and reads the final message from `--output-last-message`. Extra flags
go in `GRAVEL_CODEX_ARGS`. A Gravel model that isn't an OpenAI model is not
passed through, so Codex uses its own default.

## Several AI accounts

Claude Code and Codex each keep their login in a directory you can choose:
`CLAUDE_CONFIG_DIR` for Claude Code, `CODEX_HOME` for Codex. `gravel work`
passes your environment to the CLI, so you can run one runner per account on
the same machine, each labelled with `--account`:

```bash
# sign each account in once
CLAUDE_CONFIG_DIR=~/.claude-work  claude        # then /login with the work account
CODEX_HOME=~/.codex-personal      codex login

# one runner per account (separate terminals)
CLAUDE_CONFIG_DIR=~/.claude-work  gravel work --executor claude-code --account work
CODEX_HOME=~/.codex-personal      gravel work --executor codex       --account personal
```

- Labels are case-insensitive (`Work` and `work` are the same account).
- Without `--name`, the runner is named `<hostname> (<account>)`. That way two
  runners on one machine don't retire each other when they start.
- **Pin a project** under its **Settings → Runs on**: only runners with that
  label take its runs. Docker runtimes, unlabelled runners, other accounts and
  the in-process executor all leave them alone. If no runner for the account
  is online, the runs wait in the queue. A labelled runner still takes
  unpinned work.
- **Engineers → AI accounts** groups your runners by person and account, with
  the projects pinned to each and their runs, agent time and tokens over the
  last 7 days. Subscription usage is recorded at $0, so there is no cost
  column. Each run records the account that claimed it
  (`task_runs.runner_account`).
- Keyless model calls (PRD parsing and chat, code-graph overviews) are not
  tied to a project, so any of your online runners answers them.

Using several accounts doesn't change what each provider allows. Check their
terms, especially before using one person's plan to serve a team (`--team`).

## Keyless projects

Some AI work happens on the server rather than in a run: stages executed
in-process when no runtime is online, PRD parsing, splitting and chat, and the
code-graph overview. When you have **no API key** for the model and a runner of
yours is **online**, each of these calls becomes a job your runner answers with
your AI CLI, in an empty directory with no repository access
(`apps/runtime/gravel_runtime/jobs.py`). The call waits up to
`RUNNER_JOB_TIMEOUT_SECONDS` (240 s) for the answer.

Once you have set up a runner, your key-less runs **wait** for it instead of
producing simulated output, and start as soon as it comes online.

The usage ledger records this work as `runner/<model>` at no cost, since your
own subscription pays for it.

**Long requests behind a proxy.** A model call answered by your runner (or a
big model with a key) can take longer than a proxy allows — Cloudflare drops a
request after 100 s. The web app therefore sends PRD parsing, splitting and
chat with `Prefer: respond-async`: the API answers `202 {operation_id, poll}`
at once, runs the request in the background, and `GET /api/operations/{id}`
returns its status code and body when it's done (kept for a day). Requests
without the header behave as before. Only the paths in
`apps/api/services/async_operations.py` (`ASYNC_PATHS`) can run this way.

## Before you rely on a subscription

Check your AI provider's terms for using a subscription this way. Gravel never
sees or stores your Claude or ChatGPT login — it only asks the CLI on your
machine to do the work — but the terms for automated use are the provider's.
API keys in **Settings → Models & keys** remain fully supported.

## The VS Code extension

`apps/vscode` adds a Gravel view to VS Code: sign in with the same device
login, browse projects and tasks (with what each is waiting on), see the
**Needs you** gates and approve or request changes, open a task's spec, plan
and review as one markdown document, and start `gravel work` in a terminal.
See [apps/vscode/README.md](../apps/vscode/README.md) for installing it.

## API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET/POST /api/users/me/tokens`, `DELETE …/{id}` | user | List, create (plaintext once), revoke API tokens |
| `POST /api/auth/device/start` | none | Start a device login → device code, user code, URLs |
| `POST /api/auth/device/token` | none | Poll: `pending`, `approved` (+ `access_token`, once), `denied`, `expired` |
| `GET /api/auth/device/{user_code}`, `POST /api/auth/device/decision` | user | The `/cli` page looks the code up and approves or denies it |
| `POST /api/runners/register` | user | Become a local runner → runtime token |
| `POST /api/agent/poll-next-job`, `POST /api/agent/jobs/{id}/result` | runtime | Take and answer a keyless model call |
| `POST /api/agent/runner/stop` | runtime | Go offline |
| `GET /api/overview/accounts` | user | Local runners by person and AI account, pinned projects, last-7-days usage |
| `PATCH /api/projects/{id}` `{runner_account}` | user | Pin a project to an account (`""` or `null` unpins) |

API tokens (`grv_…`) are accepted anywhere a session token is, stored only as
SHA-256 hashes, and can expire. Migration `011` adds `api_tokens`,
`device_authorizations`, `llm_jobs` and the local-runner columns on
`engineer_runtimes` (`kind`, `host_label`, `owner_user_id`, `scope`, `executor`).

Migration `012` adds `engineer_runtimes.account_label`, `projects.runner_account`
and `task_runs.runner_account`.
