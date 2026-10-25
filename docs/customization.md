# Customizing Gravel

## Appearance (per user)

Settings → Appearance controls:

- **Theme** — light, dark or follow the system
- **Accent color** — presets or any hex color
- **Density** — compact, default or comfortable (scales the whole interface)
- **Corner radius** — sharp, default or round
- **Font** — Inter, Geist, IBM Plex Sans or the system font
- **Navigation** — sidebar (collapsible) or top bar
- **Reduced motion**
- **Board** — which fields cards show (priority, type, tags, stage, criteria
  progress, open questions, links), compact cards, hidden columns
- **Home** — which dashboard widgets appear and in what order

Preferences apply instantly, are cached locally (so pages never flash the
wrong theme), and sync to `PUT /api/users/me/preferences` so they follow you
across devices.

## Organization branding

Org admins can set a default accent color and brand name
(`PATCH /api/organizations/{id}` with `appearance: {accent, brandName}`). A
member's own accent choice overrides the org default.

## Workflows

- Start from a template (`POST /api/workflows/from-template`) or build from
  scratch on the Workflows page.
- Each stage has a **role** (`analyze`, `refine`, `plan`, `build`, `review`,
  `verify`, `deploy`, `custom`). Leave instructions empty to use the role's
  defaults, or write your own — the grounding guidance (knowledge base, earlier
  documents, glossary) is always appended.
- Toggle the approval gate, the open-question gate, AI vs. manual execution,
  the rework target and attempt budget per stage, and optionally pin a stage
  to one engineer.
- Pick a **model** per stage — say a cheap model for Analyze and a strong one
  for Build — or leave it on *Inherit*.

Templates and role instructions live in `apps/api/services/sdlc.py`
(`WORKFLOW_TEMPLATES`, `STAGE_ROLES`). Adding a template is a dictionary entry.

## Models and pricing

- A run's model is resolved as **stage → engineer → project →
  `DEFAULT_MODEL`**: the first one set wins. Leaving a stage on *Inherit* uses
  the engineer that claims the run, then the project's default model. The
  in-process executor has no claiming engineer, so it uses the stage's
  assigned engineer (if any) and then the project. The precedence lives in one
  place, `resolve_model` in `apps/api/services/llm.py`.
- `DEFAULT_MODEL` (env) sets the model used when nothing above chooses one.
- An engineer runtime only holds the API key for its own provider. A stage
  model from another provider falls back to the engineer's model, with a
  warning in the run log.
- The model menu shown in the UI is `apps/api/services/model_catalog.py`
  (served at `GET /api/meta`). Any id the provider accepts can still be typed
  in directly.
- Cost estimates come from the prefix-matched price map in
  `apps/api/services/token_usage.py` (USD per million tokens). Every call is
  recorded with the model it actually used, so per-stage models are priced
  individually and still roll up into the task, project and org totals.

## Knowledge base

Seed the Knowledge page with your decision records, patterns, glossary and
conventions; scope each entry to the org or a single project. Export accepted
knowledge as one markdown file with `GET /api/knowledge/export` — handy to
commit as `docs/KNOWLEDGE.md` in your repository.
