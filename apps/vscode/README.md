# Gravel for VS Code

Work with a hosted Gravel from the editor. The extension is a thin client over
Gravel's REST API: it has no runtime dependencies and keeps your token in VS
Code's secret storage.

- **Needs you** lists every gate waiting on a decision across your projects,
  with a count badge. **Approve** (optional note) or **Request changes**
  (required note; the task goes back for rework) inline or from the context
  menu.
- **Projects** lists your projects; expand one to see its tasks with their
  status, priority and how many unfinished tasks each is waiting on.
- **Open task** (click a task or a gate) renders the task as one markdown
  document — status, description, acceptance criteria as a checklist,
  dependencies, PR link, then the latest version of each document (analysis,
  spec, plan, scenarios, review, verification) — and opens the preview.
- **Open in browser** jumps to the project or its board in the web app.
- **Start local runner** opens a terminal named "Gravel runner" and runs
  `gravel work`, so tasks run on your machine with your own Claude Code, Codex
  or opencode login.

Views refresh every `gravel.refreshSeconds` seconds and after each gate action.

## Install

From this folder:

```bash
npm ci && npm run compile
```

Then either open `apps/vscode` in VS Code and press **F5** (an Extension
Development Host starts with the extension loaded), or build a package and
install it:

```bash
npx @vscode/vsce package          # writes gravel-vscode-<version>.vsix
code --install-extension gravel-vscode-*.vsix
```

## Sign in

Open the Gravel view in the activity bar and choose **Sign in**
(`Gravel: Sign In`). VS Code shows a short code and a button that opens your
Gravel in the browser; confirm the code there and the extension picks up the
token. Cancel the progress notification to stop waiting.

To use an API token instead, create one in Gravel under **Settings → API
tokens** and run `Gravel: Sign In with API Token`. `Gravel: Sign Out` removes
the stored token.

Tokens are stored per API URL, so pointing `gravel.apiUrl` at another server
asks you to sign in to that server.

## Settings

| Setting | Default | |
|---|---|---|
| `gravel.apiUrl` | `https://api.trygravel.com` | API base URL, without `/api`. Use `http://localhost:8000` for local development. |
| `gravel.webUrl` | `https://trygravel.com` | Web app base URL, for Open in Browser. |
| `gravel.refreshSeconds` | `60` | Auto-refresh interval; `0` turns it off. |
| `gravel.runnerExecutor` | `claude-code` | Passed to `gravel work --executor` (`claude-code`, `codex`, `opencode`). |
| `gravel.orgId` | empty | Organization to work in, sent as `X-Org-Id`. Empty uses your default organization. |

## Running tasks locally

The extension does not execute tasks itself. **Start local runner** runs the
`gravel` CLI from [`apps/runtime`](https://github.com/portfolio-ltd/gravel/tree/main/apps/runtime), which polls Gravel for work and
runs it with the agent CLI you are already logged in to:

```bash
pip install ./apps/runtime     # from the repository root; installs the gravel command
gravel login                   # once
gravel work --executor claude-code
```

If the runner reports that you are not signed in, run `gravel login` in the
"Gravel runner" terminal and start it again.

## Development

```bash
npm run watch     # recompile on change
npm run lint      # type-check
npm test          # compiles, then runs the pure helpers' tests with node --test
```

`src/format.ts` holds the logic that does not need VS Code (task markdown,
"waiting on" counts, error text, URLs) and is covered by `src/test/`.
