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

## Home dashboard

Home shows what the engineers are doing and what is waiting on you. Every
figure comes from recorded runs; nothing is estimated from outside data.

- **This week**: four cards for the last 7 days, each compared with the 7
  days before. *Waiting for you* counts open human gates and how long the
  oldest has waited. *Stages finished* counts runs that completed their stage
  (not ones that stopped for a person or failed). *Agent time* adds up
  claimed → finished time of runs that ended in the window. *LLM spend* comes
  from the usage ledger.
- **Needs your approval**: open gates with who did the work, the stage and
  how long it has waited, with Approve / Request changes / Stop in the row.
- **Running now** (`GET /api/overview/running`): every run without an
  outcome, claimed or queued. Each row shows the engineer, *Step n of m* in the
  project's pipeline, and a live elapsed timer. The bar fills against
  **Usually ~X**, the median duration of the last 20 successful runs of the same
  stage (or phase) in the organization, shown only once there are at least 3.
  A claimed run without a heartbeat for 3 minutes shows **No heartbeat for X**.

- **Ask your engineers** (next to the greeting): type or dictate a request
  and pick a project. The first line becomes the task title, and the full text
  is kept in the description when the title is shortened or there are more
  lines. **Add task** puts it in the backlog. **Add & start** also queues that
  one task on its first stage
  (`POST /api/projects/{id}/tasks/{task_id}/start`). Unlike the project's Run
  button, it leaves other pending tasks alone. It is refused (409) while the
  task's dependencies are unfinished. With no engineer runtime online, the
  in-process executor runs it. ⌘↵ adds, ⇧⌘↵ adds and starts.

The sidebar's **Recent** list shows the projects you opened last in this
browser (kept in local storage), topped up with the projects with the latest
activity.

Widgets added in a release are slotted into saved layouts once (next to
the widget before them); hiding one afterwards sticks.

## Voice input (per user)

Every prose field — task comments, "request changes" notes, answers to open
questions, the PRD chat and body, knowledge entries — has a microphone button.
It uses the browser's Web Speech API, so recognition happens in the browser
(Chrome, Edge and Safari; Firefox has no implementation, and the button is
hidden there). Gravel never receives audio.

Settings → Profile → **Voice input** picks the dictation language. Only
English variants (US, UK, India, Australia) are offered today: a locale is
listed in `apps/web/lib/dictation.ts` once someone has tested it, and the
preference falls back to `en-US` for anything else. Adding a language is a
small, well-scoped contribution — see the open "Voice input: more languages"
issue.

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
