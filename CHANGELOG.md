# Changelog

All notable changes to Gravel are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (pre-1.0: minor versions may break).

## [Unreleased]

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
