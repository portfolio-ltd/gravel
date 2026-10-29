# The knowledge map

Gravel's knowledge base — decision records, patterns, glossary terms,
runbooks, conventions and **wiki pages** — is a graph, not a list. Entries
link to each other with Obsidian-style wikilinks, the Map page draws the
whole thing, and the lot exports as an Obsidian vault.

## Wikilinks

In any knowledge entry (and in task descriptions, task documents and PRDs):

```
[[Invoice]]                   by title, case-insensitive
[[invoice]]                   by slug
[[invoice|an invoice]]        with display text
[[Stream large exports#Why]]  a heading (ignored for resolution)
```

Every entry gets a **slug** when it is created (`Stream large exports` →
`stream-large-exports`, unique per organization). Renaming keeps the slug so
links don't break; the editor can set a new one. Links resolve by slug first,
then by title.

In the app, a wikilink opens `/knowledge/by-slug/<target>`, which jumps to the
entry — or, when nothing matches, offers to **create** the page with that
title. Unresolved links also show on the Map and on each entry's page.

Engineer runs cannot follow links, so `KNOWLEDGE.md` in the bundle flattens
them to plain text; the Obsidian export keeps them.

## Wiki pages and hierarchy

The `wiki` kind is for free-form pages: overviews, how an area fits together,
onboarding. Any entry can have a **parent** (Sits under), so wiki pages form a
tree; the Knowledge page lists the Wiki kind as that tree, and an entry's page
shows its breadcrumb and sub-pages. Cycles are rejected.

Accepted wiki pages are handed to engineer runs under a `## Wiki` heading in
`KNOWLEDGE.md`, like every other accepted kind.

## Each entry's page

`/knowledge/<id>` shows the entry, its **backlinks** (entries that link here),
**links out**, **unresolved** targets with a one-click create, sub-pages, its
external links, and a **local graph** of its neighbourhood.

## The Map

`/map` draws the organization's graph:

| Node | Comes from |
|---|---|
| Knowledge entry (coloured by kind) | `knowledge_entries` |
| Task | tasks of the org's projects |
| PRD | PRDs that mention an entry (all PRDs in the org-wide view) |
| Project | projects |
| External link | `external_links` |
| Code module | the project's code graph (project-scoped view only) |

| Edge | Meaning |
|---|---|
| `wikilink` | an entry's body links to another entry |
| `mentions` | a task (title, description or documents) or PRD links to an entry |
| `proposed` | the task whose run proposed the entry |
| `parent` | wiki hierarchy |
| `scope` | an entry applies to a project; a task or module belongs to one |
| `depends` | task graph dependency |
| `link` | an external link hangs off a project, task, PRD or entry |
| `import` | code graph import between modules |

Controls: scope to a project, show/hide node types and knowledge kinds, hide
unlinked nodes, search (matches light up), **Local** view with depth 1–3 around
the selected node. Drag pans, wheel zooms, dragging a node moves it; click
selects (the side panel lists its connections), double-click opens.

The layout is a small force simulation (`apps/web/lib/forceLayout.ts`): no
third-party graph library, deterministic for the same graph.

## External links

Anything with a URL that an engineer should know about — the Figma file, the
ticket in another tracker, a Grafana dashboard, an RFC — can be attached to a
**project**, **task**, **PRD** or **knowledge entry** (kinds: docs, design,
ticket, dashboard, repo, spec, other). They show on the project's Sources tab,
the task panel's Links tab, each knowledge entry's page, and the Map.

Engineer runs receive the project's and the task's links as `.gravel/LINKS.md`,
and the grounding guidance tells them to open those before guessing at
designs, tickets or external specs.

## Obsidian export and import

**Export** (Map → Obsidian vault, or Knowledge → Import / export) downloads a
zip that opens directly as an Obsidian vault:

```
Decisions/   Patterns/   Glossary/   Runbooks/   Conventions/   Wiki/
Tasks/<project>/   PRDs/   Projects/
graph.json   README.md
```

Each note has front matter (`gravel_id`, `kind`, `status`, `project`,
`parent`, `tags`, `updated`), the body with wikilinks intact, and a `## Links`
section for its external links. Task notes link to the tasks they depend on
and the knowledge their runs proposed. `graph.json` is the same graph the Map
draws.

**Import** (Knowledge → Import / export → Import markdown notes) accepts
markdown files — a folder from Obsidian, say. Front matter `kind:` (or
`type:`) sets the kind; otherwise the folder name does (`Runbooks/…` →
runbook), and anything else becomes a wiki page. A note whose `gravel_id`
matches an existing entry **updates** it; so does a matching title. Wikilinks
are kept as written and resolve once the linked notes exist. Imported notes
are accepted straight away (a person uploaded them).

## API

```
GET  /api/map?project_id=&tasks=true&code=true
GET  /api/knowledge/{id}
GET  /api/knowledge/{id}/links            outgoing, backlinks, children, unresolved
GET  /api/knowledge/by-slug/{slug}        slug or title; 404 when nothing matches
GET  /api/knowledge/export                KNOWLEDGE.md for engineers (links flattened)
GET  /api/knowledge/export/obsidian       the vault zip (?project_id= to scope)
POST /api/knowledge/import                multipart `files` (.md), ?project_id=
GET/POST/PATCH/DELETE /api/links          ?entity_type=task&entity_id=…
```
