# Contributing to Gravel

Thanks for helping! Bug reports, docs fixes, new stage roles and workflow
templates, and UI polish are all welcome.

## Where to start

- Look for issues labelled
  [`good first issue`](https://github.com/portfolio-ltd/gravel/labels/good%20first%20issue)
  or [`help wanted`](https://github.com/portfolio-ltd/gravel/labels/help%20wanted).
  Comment on an issue before starting so work isn't duplicated.
- Questions and ideas go to
  [Discussions](https://github.com/portfolio-ltd/gravel/discussions); bugs and
  agreed features go to issues.
- For anything larger than a bug fix, open an issue or discussion first so the
  approach can be agreed before you write code.

## Development setup

Prerequisites: Python 3.12, [uv](https://docs.astral.sh/uv/), Node 22, git,
and Docker if you want real engineer runtimes.

```bash
cp .env.example .env

# API
cd apps/api
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt ruff
.venv/bin/alembic upgrade head && .venv/bin/python seed.py
.venv/bin/uvicorn main:app --reload --port 8000

# Web
cd apps/web
npm ci
npm run dev
```

Set `RUNTIME_MODE=simulated` to work without Docker; leave provider keys empty
to use simulated engineer output.

## Checks (run before opening a PR)

```bash
# API
cd apps/api && .venv/bin/ruff check . && .venv/bin/python -m pytest -q

# Runtime
cd apps/runtime && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -e ".[test]" \
  && .venv/bin/python -m pytest -q

# Web
cd apps/web && npx tsc --noEmit && npm run lint && npm test
```

CI runs the same checks plus a production web build.

## Conventions

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- **Schema changes** need an Alembic migration in `apps/api/alembic/versions/`
  that upgrades and downgrades cleanly.
- **Tests**: new behaviour comes with tests; bug fixes come with a regression
  test where practical.
- **UI**: use the theme tokens (`bg-card`, `text-muted-foreground`,
  `bg-primary`, `text-success`…) so components work in light and dark mode and
  with every accent color.
- No contributor license agreement or DCO sign-off is required. By submitting a
  contribution you agree it is licensed under the Apache License 2.0.

## Pull requests

- Branch from `main`, keep PRs focused, and fill in the PR template.
- CI must pass, and a maintainer review is required before merge.
- PRs are squash-merged; the PR title becomes the commit message, so write it
  as a Conventional Commit.
- Label the PR (`enhancement`, `bug`, `documentation`, `breaking`) — labels
  decide where it appears in the release notes.

## Releases

Gravel follows [Semantic Versioning](https://semver.org/); before 1.0, minor
versions may contain breaking changes. To cut a release, a maintainer:

1. moves the `[Unreleased]` entries in [CHANGELOG.md](CHANGELOG.md) under the
   new version and bumps the version in `apps/web/package.json`,
   `apps/api/main.py` and `apps/runtime/pyproject.toml`;
2. merges that change, then tags it: `git tag v0.2.0 && git push origin v0.2.0`.

The tag triggers the release workflow, which publishes multi-arch
(amd64/arm64) images to `ghcr.io/portfolio-ltd/gravel-{api,web,engineer}` and
creates a GitHub release with generated notes.

## Proposing a stage role or workflow template

Roles and templates live in `apps/api/services/sdlc.py`. Open an issue first
describing:

1. the problem the stage solves and when a team would use it;
2. its default instructions, written as concrete guidance for an engineer;
3. which documents it produces and how its result is interpreted (verdicts,
   gates, rework);
4. a test in `apps/api/tests/test_sdlc_flow.py` exercising it end to end.

## Reporting security issues

Please don't open public issues for vulnerabilities — see [SECURITY.md](SECURITY.md).
