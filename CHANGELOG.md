# Changelog

All notable changes to Gravel are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (pre-1.0: minor versions may break).

## [Unreleased]

### Added

- Per-stage model selection: each workflow stage can name its own model (for
  example a cheaper model for Analyze and a stronger one for Build). Runs
  resolve their model as stage → engineer → project → `DEFAULT_MODEL`, and the
  runtime poll response carries the resolved `model` and `model_provider`.
  Migration `008` adds `workflow_stages.model` (#11)
- Workflow graph: stages name a success edge (`next_stage_id`, default the next
  stage by order) next to the rework edge, so workflows can branch and loop; a
  stop rule parks a task that re-enters one stage 10 times without a human
  approval. The workflow editor draws the graph and flags unreachable stages (#22)
- Task graph: tasks depend on other tasks in the same project (`depends_on`,
  cycles rejected). Running a project queues only ready tasks and finishing one
  queues its dependents; PRD parsing proposes dependencies. The project page has
  a graph view, cards show what a task waits on, and the task panel edits
  dependencies (#23)
- Code graph: map a project's GitHub repository into modules, import edges,
  stack, commands and entry points, with an optional LLM architecture overview.
  Built when a project gets a repository and on demand (Code tab); every run
  receives `CODE_MAP.md` scoped to its task. New project dialog can start from
  an existing repository (#24)
- Claude Code runs get role-specific subagents (`--agents`) and, for
  code-writing stages with known test commands, a Stop-hook test gate
  (`--settings`), all under `.gravel/` (#25)
- Migration `009` adds `workflow_stages.next_stage_id`, `tasks.depends_on` and
  the `code_graphs` table

## [0.1.0] - 2026-10-25

First open-source release.

### Added

- Spec-driven delivery workflow: Analyze → Refine spec → Plan → Build → Review → Verify,
  with approval gates, open-question gates and a bounded rework loop
- Editable workflows with three built-in templates
- Project knowledge (decisions, patterns, glossary, runbooks, conventions) handed to every run
- Engineer runtimes (Docker), an in-process executor and an offline simulated mode
- Bring-your-own-key LLM providers (Anthropic, OpenAI, Groq) with a per-task usage ledger
- GitHub Issues import and stage results posted back to issues
- PRDs with AI chat and task splitting; organizations, roles and tags
- Customizable UI: theme, accent, density, navigation layout and board card fields
- Email verification and password reset
- Multi-arch (amd64/arm64) container images on GHCR

[Unreleased]: https://github.com/portfolio-ltd/gravel/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/portfolio-ltd/gravel/releases/tag/v0.1.0
