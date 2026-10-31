# Changelog

All notable changes to Gravel are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (pre-1.0: minor versions may break).

## [Unreleased]

### Added

- Voice input: a microphone button on comments, gate notes, question answers,
  the PRD chat and body, and knowledge entries turns speech into text with the
  browser's Web Speech API (Chrome, Edge, Safari; hidden where unsupported).
  Nothing is sent to Gravel's servers. English variants only for now — the
  language lives under Settings → Profile → Voice input; other locales are
  tracked as a help-wanted issue
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
- Agent harnesses: an organization can define how runs are wrapped — subagents
  (name, prompt, tools, model, roles), routing per stage role, the test gate,
  the review-round stop rule, turn and tool limits, and extra instructions.
  Five built-in templates; one harness is the org default and any workflow
  stage can pin another (`workflow_stages.harness_id`). Runs record theirs
  (`task_runs.harness_id`). The bundle gains `HARNESS.md` and `harness.json`;
  the Claude Code executor applies `--max-turns`, `--allowedTools` and
  `--disallowedTools` from it. Harnesses page with a bundle preview
- Knowledge map: entries link with Obsidian-style `[[wikilinks]]` (by slug or
  title, with aliases and headings); every entry has a unique slug and an
  optional parent; a new `wiki` kind for free-form pages. Each entry has its
  own page with backlinks, links out, unresolved targets (create in one click),
  sub-pages and a local graph. The Map page draws knowledge, projects, tasks,
  PRDs, external links and (per project) code modules as a force-directed
  graph with filters, search and a local view. `KNOWLEDGE.md` for engineers
  flattens wikilinks and includes wiki pages
- Obsidian vault export (zip with front matter, wikilinks intact, `graph.json`)
  and markdown note import (front matter or folder decides the kind; an
  exported note updates its entry)
- External links on projects, tasks, PRDs and knowledge entries (docs, design,
  ticket, dashboard, repo, spec); shown on the project's Sources tab, the task
  panel's Links tab and the Map, and handed to runs as `LINKS.md`
- `AGENTS.md` / `CLAUDE.md` at the repository root: conventions for coding
  agents working on Gravel itself
- Migration `010` adds `agent_harnesses`, `external_links`,
  `knowledge_entries.slug` / `parent_id` (slugs backfilled),
  `workflow_stages.harness_id` and `task_runs.harness_id`

### Fixed

- The board and an open task panel now subscribe to the project's WebSocket,
  so stage changes, gate outcomes and new documents show up without waiting
  for the next poll

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
