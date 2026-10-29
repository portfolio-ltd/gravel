"""The knowledge map: wikilinks, backlinks, slugs, and the org-wide graph.

Knowledge entries (and task descriptions, task documents and PRDs) link to
each other with Obsidian-style wikilinks:

    [[Invoice]]                 by title (case-insensitive) or slug
    [[invoice|an invoice]]      with display text
    [[Stream large exports#Why]] a heading, ignored for resolution

The map joins those links with the structure Gravel already knows — which
task proposed an entry, which tasks depend on each other, which project an
entry applies to, external links, and the code graph's modules — into one
graph the Map page draws and the Obsidian export writes out as a vault.
"""
import io
import json
import re
import unicodedata
import zipfile
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.code_graph import CodeGraph, CodeGraphStatus
from models.link import ExternalLink
from models.prd import PRD
from models.project import Project
from models.sdlc import KnowledgeEntry, KnowledgeKind, KnowledgeStatus, TaskDocument
from models.task import Task

WIKILINK_RE = re.compile(r"\[\[([^\[\]|#]+?)(?:#([^\[\]|]*))?(?:\|([^\[\]]+?))?\]\]")
FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.DOTALL)

KIND_FOLDERS = {
    KnowledgeKind.decision: "Decisions", KnowledgeKind.pattern: "Patterns", KnowledgeKind.glossary: "Glossary",
    KnowledgeKind.runbook: "Runbooks", KnowledgeKind.convention: "Conventions", KnowledgeKind.wiki: "Wiki",
}


# ── Slugs and wikilinks ──────────────────────────────────────────────────────

def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:180] or "entry"


async def unique_slug(db: AsyncSession, organization_id: str, title: str, exclude_id: str | None = None,
                      wanted: str | None = None) -> str:
    base = slugify(wanted or title)
    q = select(KnowledgeEntry.id, KnowledgeEntry.slug).where(
        KnowledgeEntry.organization_id == organization_id, KnowledgeEntry.slug.like(f"{base}%"))
    taken = {slug for entry_id, slug in (await db.execute(q)).all() if entry_id != exclude_id}
    slug, n = base, 2
    while slug in taken:
        slug, n = f"{base}-{n}", n + 1
    return slug


def parse_wikilinks(text: str | None) -> list[str]:
    """Link targets in order of appearance, duplicates removed, headings dropped."""
    seen: list[str] = []
    for m in WIKILINK_RE.finditer(text or ""):
        target = m.group(1).strip()
        if target and target not in seen:
            seen.append(target)
    return seen


def _key(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip()).lower()


class Resolver:
    """Resolves wikilink targets to entries by slug, then by title; both case-insensitive."""

    def __init__(self, entries: list[KnowledgeEntry]):
        self.by_slug = {e.slug: e for e in entries if e.slug}
        self.by_title = {_key(e.title): e for e in entries}

    def resolve(self, target: str) -> KnowledgeEntry | None:
        key = _key(target)
        return self.by_slug.get(key) or self.by_slug.get(slugify(target)) or self.by_title.get(key)


def flatten_wikilinks(text: str, resolver: Resolver | None = None) -> str:
    """[[target|alias]] → alias, [[target]] → the entry's title (or the raw target).

    Engineer bundles are plain markdown read by agents that cannot follow
    links, so the link becomes its text and the heading is kept as "(see X)".
    """
    def sub(m: re.Match) -> str:
        target, heading, alias = m.group(1).strip(), (m.group(2) or "").strip(), (m.group(3) or "").strip()
        entry = resolver.resolve(target) if resolver else None
        label = alias or (entry.title if entry else target)
        return f"{label} (see “{heading}” under {entry.title if entry else target})" if heading and not alias else label
    return WIKILINK_RE.sub(sub, text or "")


# ── Per-entry links ──────────────────────────────────────────────────────────

async def org_entries(db: AsyncSession, organization_id: str) -> list[KnowledgeEntry]:
    return list((await db.execute(select(KnowledgeEntry).where(
        KnowledgeEntry.organization_id == organization_id).order_by(KnowledgeEntry.title))).scalars())


def entry_links(entry: KnowledgeEntry, entries: list[KnowledgeEntry]) -> dict:
    """Outgoing links, backlinks and unresolved targets for one entry."""
    resolver = Resolver(entries)
    outgoing, unresolved = [], []
    for target in parse_wikilinks(entry.body_markdown):
        hit = resolver.resolve(target)
        if hit is None:
            unresolved.append(target)
        elif hit.id != entry.id and hit not in outgoing:
            outgoing.append(hit)
    backlinks = []
    for other in entries:
        if other.id == entry.id:
            continue
        for target in parse_wikilinks(other.body_markdown):
            hit = resolver.resolve(target)
            if hit is not None and hit.id == entry.id:
                backlinks.append(other)
                break
    children = [e for e in entries if e.parent_id == entry.id]
    return {"outgoing": outgoing, "backlinks": backlinks, "unresolved": unresolved, "children": children}


# ── The map ──────────────────────────────────────────────────────────────────

def _node(id_: str, type_: str, label: str, **extra) -> dict:
    return {"id": id_, "type": type_, "label": label, **extra}


async def build_map(db: AsyncSession, organization_id: str, project_id: str | None = None,
                    include_tasks: bool = True, include_code: bool = True) -> dict:
    """Nodes and edges for the Map page. Everything is org-scoped; `project_id` narrows tasks,
    code modules and project-specific knowledge to one project."""
    entries = await org_entries(db, organization_id)
    if project_id:
        entries = [e for e in entries if e.project_id in (None, project_id)]
    resolver = Resolver(entries)
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    edge_keys: set[tuple] = set()
    unresolved: dict[str, list[str]] = defaultdict(list)

    def add_edge(source: str, target: str, type_: str) -> None:
        key = (source, target, type_)
        if source != target and key not in edge_keys and source in nodes and target in nodes:
            edge_keys.add(key)
            edges.append({"source": source, "target": target, "type": type_})

    projects_q = select(Project).where(Project.organization_id == organization_id)
    if project_id:
        projects_q = projects_q.where(Project.id == project_id)
    projects = list((await db.execute(projects_q)).scalars())
    for p in projects:
        nodes[f"project:{p.id}"] = _node(f"project:{p.id}", "project", p.name, href=f"/projects?id={p.id}",
                                         project_id=p.id)

    for e in entries:
        nodes[f"knowledge:{e.id}"] = _node(
            f"knowledge:{e.id}", "knowledge", e.title, kind=e.kind.value, status=e.status.value, slug=e.slug,
            project_id=e.project_id, href=f"/knowledge/{e.id}",
        )
    for e in entries:
        src = f"knowledge:{e.id}"
        for target in parse_wikilinks(e.body_markdown):
            hit = resolver.resolve(target)
            if hit is None:
                unresolved[src].append(target)
            else:
                add_edge(src, f"knowledge:{hit.id}", "wikilink")
        if e.parent_id:
            add_edge(f"knowledge:{e.parent_id}", src, "parent")
        if e.project_id and f"project:{e.project_id}" in nodes:
            add_edge(f"project:{e.project_id}", src, "scope")

    tasks: list[Task] = []
    if include_tasks and projects:
        tasks = list((await db.execute(select(Task).where(
            Task.project_id.in_([p.id for p in projects])).order_by(Task.position))).scalars())
        for t in tasks:
            nodes[f"task:{t.id}"] = _node(
                f"task:{t.id}", "task", t.title, status=t.status.value, project_id=t.project_id,
                href=f"/board?project={t.project_id}&task={t.id}",
            )
        for t in tasks:
            tid = f"task:{t.id}"
            add_edge(f"project:{t.project_id}", tid, "scope")
            for dep in t.depends_on or []:
                add_edge(f"task:{dep}", tid, "depends")
            for target in parse_wikilinks(f"{t.title}\n{t.description}"):
                hit = resolver.resolve(target)
                if hit is not None:
                    add_edge(tid, f"knowledge:{hit.id}", "mentions")
        for e in entries:
            if e.source_task_id and f"task:{e.source_task_id}" in nodes:
                add_edge(f"task:{e.source_task_id}", f"knowledge:{e.id}", "proposed")
        if tasks:
            docs = (await db.execute(select(TaskDocument.task_id, TaskDocument.body_markdown).where(
                TaskDocument.task_id.in_([t.id for t in tasks])))).all()
            for task_id, body in docs:
                for target in parse_wikilinks(body):
                    hit = resolver.resolve(target)
                    if hit is not None:
                        add_edge(f"task:{task_id}", f"knowledge:{hit.id}", "mentions")

    prds = list((await db.execute(select(PRD).where(PRD.organization_id == organization_id))).scalars())
    for prd in prds:
        pid = f"prd:{prd.id}"
        targets = parse_wikilinks(prd.body_markdown)
        hits = [resolver.resolve(t) for t in targets]
        if not project_id or any(h is not None for h in hits):
            nodes[pid] = _node(pid, "prd", prd.title, status=prd.status.value, href=f"/prds/{prd.id}")
            for hit in hits:
                if hit is not None:
                    add_edge(pid, f"knowledge:{hit.id}", "mentions")

    links = list((await db.execute(select(ExternalLink).where(
        ExternalLink.organization_id == organization_id))).scalars())
    for link in links:
        owner = f"{link.entity_type.value}:{link.entity_id}"
        if owner not in nodes:
            continue
        lid = f"link:{link.id}"
        nodes[lid] = _node(lid, "link", link.title, kind=link.kind.value, url=link.url, href=link.url)
        add_edge(owner, lid, "link")

    if include_code and project_id:
        graph = (await db.execute(select(CodeGraph).where(CodeGraph.project_id == project_id))).scalar_one_or_none()
        if graph is not None and graph.status == CodeGraphStatus.ready and graph.graph:
            for m in graph.graph.get("modules", []):
                mid = f"module:{project_id}:{m['id']}"
                nodes[mid] = _node(mid, "module", m.get("label") or m["id"], project_id=project_id,
                                   purpose=m.get("purpose", ""), href=f"/projects?id={project_id}&tab=code")
                add_edge(f"project:{project_id}", mid, "scope")
            for e in graph.graph.get("edges", []):
                add_edge(f"module:{project_id}:{e['source']}", f"module:{project_id}:{e['target']}", "import")

    degree: dict[str, int] = defaultdict(int)
    for e in edges:
        degree[e["source"]] += 1
        degree[e["target"]] += 1
    for n in nodes.values():
        n["degree"] = degree.get(n["id"], 0)
    return {
        "nodes": list(nodes.values()), "edges": edges,
        "unresolved": [{"source": k, "targets": v} for k, v in unresolved.items()],
        "counts": {t: sum(1 for n in nodes.values() if n["type"] == t)
                   for t in ("knowledge", "task", "prd", "project", "link", "module")},
    }


# ── Obsidian vault export / markdown import ──────────────────────────────────

def _frontmatter(data: dict) -> str:
    lines = ["---"]
    for key, value in data.items():
        if value is None or value == [] or value == "":
            continue
        if isinstance(value, list):
            lines.append(f"{key}:")
            lines += [f"  - {json.dumps(v) if not isinstance(v, str) else _yaml_str(v)}" for v in value]
        elif isinstance(value, bool):
            lines.append(f"{key}: {'true' if value else 'false'}")
        elif isinstance(value, (int, float)):
            lines.append(f"{key}: {value}")
        else:
            lines.append(f"{key}: {_yaml_str(str(value))}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def _yaml_str(value: str) -> str:
    return json.dumps(value) if re.search(r'[:#\[\]{}&*!|>\'"%@`]|^\s|\s$', value) or value == "" else value


def _safe_name(text: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "-", text or "").strip(" .") or "untitled"
    return cleaned[:120]


async def export_vault(db: AsyncSession, organization_id: str, project_id: str | None = None) -> bytes:
    """A zip that opens as an Obsidian vault: one note per entry, task and PRD, wikilinks intact."""
    data = await build_map(db, organization_id, project_id=project_id, include_code=True)
    entries = await org_entries(db, organization_id)
    if project_id:
        entries = [e for e in entries if e.project_id in (None, project_id)]
    by_id = {e.id: e for e in entries}
    projects = {p.id: p for p in (await db.execute(select(Project).where(
        Project.organization_id == organization_id))).scalars()}
    links_by_owner: dict[str, list[ExternalLink]] = defaultdict(list)
    for link in (await db.execute(select(ExternalLink).where(
            ExternalLink.organization_id == organization_id))).scalars():
        links_by_owner[f"{link.entity_type.value}:{link.entity_id}"].append(link)

    def links_section(owner: str) -> str:
        items = links_by_owner.get(owner) or []
        if not items:
            return ""
        return "\n\n## Links\n\n" + "\n".join(f"- [{link.title}]({link.url}) ({link.kind.value})" for link in items)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        names_used: set[str] = set()

        def unique(path: str) -> str:
            candidate, n = path, 2
            while candidate in names_used:
                stem, ext = path.rsplit(".", 1)
                candidate, n = f"{stem}-{n}.{ext}", n + 1
            names_used.add(candidate)
            return candidate

        for e in entries:
            folder = KIND_FOLDERS[e.kind]
            front = _frontmatter({
                "gravel_id": e.id, "kind": e.kind.value, "status": e.status.value,
                "number": e.number, "project": projects[e.project_id].name if e.project_id in projects else None,
                "parent": by_id[e.parent_id].slug if e.parent_id in by_id else None,
                "aliases": [e.slug] if e.slug and _key(e.slug) != _key(e.title) else [],
                "tags": ["gravel", e.kind.value],
                "updated": e.updated_at.isoformat() if e.updated_at else None,
            })
            body = e.body_markdown.strip()
            zf.writestr(unique(f"{folder}/{_safe_name(e.title)}.md"),
                        f"{front}# {e.title}\n\n{body}{links_section(f'knowledge:{e.id}')}\n")

        task_nodes = [n for n in data["nodes"] if n["type"] == "task"]
        if task_nodes:
            tasks = {t.id: t for t in (await db.execute(select(Task).where(
                Task.id.in_([n["id"].split(":", 1)[1] for n in task_nodes])))).scalars()}
            for t in tasks.values():
                project = projects.get(t.project_id)
                related = [by_id[e.id] for e in entries if e.source_task_id == t.id]
                deps = [tasks[d] for d in (t.depends_on or []) if d in tasks]
                front = _frontmatter({
                    "gravel_id": t.id, "type": "task", "status": t.status.value, "priority": t.priority.value,
                    "project": project.name if project else None, "tags": ["gravel", "task", t.status.value],
                })
                extra = ""
                if deps:
                    extra += "\n\n## Depends on\n\n" + "\n".join(f"- [[{_safe_name(d.title)}]]" for d in deps)
                if related:
                    extra += "\n\n## Knowledge proposed here\n\n" + "\n".join(f"- [[{_safe_name(e.title)}]]" for e in related)
                criteria = "\n".join(f"- [{'x' if c.get('done') else ' '}] {c.get('text', '')}"
                                     for c in (t.acceptance_criteria or []) if isinstance(c, dict))
                zf.writestr(unique(f"Tasks/{_safe_name(project.name if project else 'Project')}/{_safe_name(t.title)}.md"),
                            f"{front}# {t.title}\n\n{t.description.strip()}\n"
                            + (f"\n## Acceptance criteria\n\n{criteria}\n" if criteria else "")
                            + extra + links_section(f"task:{t.id}") + "\n")

        for prd in (await db.execute(select(PRD).where(PRD.organization_id == organization_id))).scalars():
            front = _frontmatter({"gravel_id": prd.id, "type": "prd", "status": prd.status.value, "tags": ["gravel", "prd"]})
            zf.writestr(unique(f"PRDs/{_safe_name(prd.title)}.md"),
                        f"{front}# {prd.title}\n\n{(prd.body_markdown or '').strip()}{links_section(f'prd:{prd.id}')}\n")

        for p in projects.values():
            if project_id and p.id != project_id:
                continue
            front = _frontmatter({"gravel_id": p.id, "type": "project", "status": p.status.value,
                                  "repo": p.repo_url, "tags": ["gravel", "project"]})
            zf.writestr(unique(f"Projects/{_safe_name(p.name)}.md"),
                        f"{front}# {p.name}\n\n- Status: {p.status.value}\n- Repository: {p.repo_url or 'none'}\n"
                        + links_section(f"project:{p.id}") + "\n")

        zf.writestr("graph.json", json.dumps(data, indent=2, default=str))
        zf.writestr("README.md", (
            "# Gravel knowledge vault\n\nExported from Gravel on "
            f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}. Open this folder as an Obsidian "
            "vault: notes are grouped by kind, `[[wikilinks]]` are preserved, and `graph.json` holds the "
            "same graph the Map page draws. Front matter carries each note's Gravel id so a later import "
            "can update rather than duplicate.\n"
        ))
    return buf.getvalue()


def parse_markdown_note(filename: str, content: str) -> dict:
    """A markdown note (optionally with YAML-ish front matter) → fields for a knowledge entry."""
    meta: dict = {}
    body = content
    m = FRONTMATTER_RE.match(content)
    if m:
        body = content[m.end():]
        for line in m.group(1).splitlines():
            if ":" in line and not line.startswith((" ", "-")):
                key, _, value = line.partition(":")
                meta[key.strip().lower()] = value.strip().strip('"').strip("'")
    title = meta.get("title")
    heading = re.match(r"\s*#\s+(.+)", body)
    if not title and heading:
        title = heading.group(1).strip()
        body = body[heading.end():]
    if not title:
        title = re.sub(r"\.(md|markdown)$", "", filename.rsplit("/", 1)[-1], flags=re.IGNORECASE)
    kind = meta.get("kind") or meta.get("type") or ""
    try:
        kind_value = KnowledgeKind(kind)
    except ValueError:
        folder = filename.rsplit("/", 1)[0].lower() if "/" in filename else ""
        kind_value = next((k for k, f in KIND_FOLDERS.items() if f.lower() == folder.rsplit("/", 1)[-1]),
                          KnowledgeKind.wiki)
    try:
        status = KnowledgeStatus(meta.get("status") or "accepted")
    except ValueError:
        status = KnowledgeStatus.accepted
    return {"title": title[:300], "body_markdown": body.strip(), "kind": kind_value, "status": status,
            "gravel_id": meta.get("gravel_id"), "slug": meta.get("slug") or None, "parent": meta.get("parent")}
