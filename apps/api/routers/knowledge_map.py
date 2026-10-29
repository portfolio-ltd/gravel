"""The knowledge map: the org-wide graph, per-entry links, Obsidian export and markdown import."""
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from db.base import new_uuid
from dependencies import DB, CurrentOrg, CurrentUser
from models.project import Project
from models.sdlc import KnowledgeEntry, KnowledgeKind
from models.task_run import CommentAuthorType
from schemas.sdlc import KnowledgeImportOut, KnowledgeLinksOut, KnowledgeOut, KnowledgeRef
from services import knowledge_graph as kg
from services import sdlc

router = APIRouter(tags=["knowledge-map"])

MAX_IMPORT_FILES = 200
MAX_NOTE_BYTES = 512_000


def _ref(e: KnowledgeEntry) -> KnowledgeRef:
    return KnowledgeRef(id=e.id, title=e.title, kind=e.kind, status=e.status, slug=e.slug, label=sdlc.knowledge_label(e))


def _out(e: KnowledgeEntry) -> KnowledgeOut:
    return KnowledgeOut(
        id=e.id, organization_id=e.organization_id, project_id=e.project_id, kind=e.kind, title=e.title,
        body_markdown=e.body_markdown, status=e.status, number=e.number, label=sdlc.knowledge_label(e),
        slug=e.slug, parent_id=e.parent_id, author_type=e.author_type, created_by_id=e.created_by_id,
        source_task_id=e.source_task_id, created_at=e.created_at, updated_at=e.updated_at,
    )


@router.get("/map")
async def knowledge_map(current_user: CurrentUser, org: CurrentOrg, db: DB, project_id: str | None = None,
                        tasks: bool = True, code: bool = True):
    """Nodes and edges for the Map page: knowledge entries joined by wikilinks, plus the projects, tasks,
    PRDs, external links and (per project) code modules they connect to."""
    if project_id:
        project = await db.get(Project, project_id)
        if not project or project.organization_id != org.id:
            raise HTTPException(404, "Project not found")
    return await kg.build_map(db, org.id, project_id=project_id, include_tasks=tasks, include_code=code)


@router.get("/knowledge/export/obsidian")
async def export_obsidian(current_user: CurrentUser, org: CurrentOrg, db: DB, project_id: str | None = None):
    """The knowledge base (plus tasks, PRDs and projects) as a zip that opens as an Obsidian vault."""
    if project_id:
        project = await db.get(Project, project_id)
        if not project or project.organization_id != org.id:
            raise HTTPException(404, "Project not found")
    data = await kg.export_vault(db, org.id, project_id=project_id)
    name = f"gravel-vault-{org.slug or 'export'}.zip"
    return Response(content=data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/knowledge/by-slug/{slug}", response_model=KnowledgeOut)
async def knowledge_by_slug(slug: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    entry = (await db.execute(select(KnowledgeEntry).where(
        KnowledgeEntry.organization_id == org.id, KnowledgeEntry.slug == slug.lower()))).scalar_one_or_none()
    if entry is None:
        resolver = kg.Resolver(await kg.org_entries(db, org.id))
        entry = resolver.resolve(slug)
    if entry is None:
        raise HTTPException(404, "Knowledge entry not found")
    return _out(entry)


@router.post("/knowledge/import", response_model=KnowledgeImportOut)
async def import_notes(current_user: CurrentUser, org: CurrentOrg, db: DB, files: list[UploadFile] = File(...),
                       project_id: str | None = None):
    """Import markdown notes (an Obsidian folder, say) as knowledge entries.

    Front matter decides the kind (`kind:` or `type:`), status and slug; a
    `gravel_id` from an earlier export updates that entry instead of creating
    one. Notes without a kind become wiki pages. Wikilinks are kept as-is and
    resolve once the linked notes exist.
    """
    if project_id:
        project = await db.get(Project, project_id)
        if not project or project.organization_id != org.id:
            raise HTTPException(404, "Project not found")
    if len(files) > MAX_IMPORT_FILES:
        raise HTTPException(400, f"At most {MAX_IMPORT_FILES} files per import")
    created = updated = skipped = 0
    titles: list[str] = []
    existing = {e.id: e for e in await kg.org_entries(db, org.id)}
    by_title = {kg._key(e.title): e for e in existing.values()}
    for upload in files:
        name = upload.filename or "note.md"
        if not name.lower().endswith((".md", ".markdown", ".txt")):
            skipped += 1
            continue
        raw = await upload.read()
        if len(raw) > MAX_NOTE_BYTES:
            skipped += 1
            continue
        try:
            note = kg.parse_markdown_note(name, raw.decode("utf-8"))
        except UnicodeDecodeError:
            skipped += 1
            continue
        if note["skip"] or not note["title"] or not note["body_markdown"]:
            skipped += 1
            continue
        target = existing.get(note["gravel_id"] or "") or by_title.get(kg._key(note["title"]))
        if target is not None:
            target.body_markdown = note["body_markdown"]
            # Only a note that names its kind may change one; decisions keep their number
            if note["kind_explicit"] and target.kind != note["kind"] and target.kind != KnowledgeKind.decision:
                target.kind = note["kind"]
            updated += 1
        else:
            target = KnowledgeEntry(
                id=new_uuid(), organization_id=org.id, project_id=project_id, kind=note["kind"],
                title=note["title"], body_markdown=note["body_markdown"], status=note["status"],
                author_type=CommentAuthorType.human, created_by_id=current_user.id,
                slug=await kg.unique_slug(db, org.id, note["title"], wanted=note["slug"]),
            )
            db.add(target)
            await db.flush()
            existing[target.id] = target
            by_title[kg._key(target.title)] = target
            created += 1
        await sdlc.assign_decision_number(db, target)
        await db.flush()
        titles.append(target.title)
    return KnowledgeImportOut(created=created, updated=updated, skipped=skipped, titles=titles)


@router.get("/knowledge/{entry_id}", response_model=KnowledgeOut)
async def get_knowledge(entry_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    entry = await db.get(KnowledgeEntry, entry_id)
    if not entry or entry.organization_id != org.id:
        raise HTTPException(404, "Knowledge entry not found")
    return _out(entry)


@router.get("/knowledge/{entry_id}/links", response_model=KnowledgeLinksOut)
async def knowledge_links(entry_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    """Outgoing wikilinks, backlinks, child pages and unresolved targets for one entry."""
    entry = await db.get(KnowledgeEntry, entry_id)
    if not entry or entry.organization_id != org.id:
        raise HTTPException(404, "Knowledge entry not found")
    links = kg.entry_links(entry, await kg.org_entries(db, org.id))
    return KnowledgeLinksOut(
        outgoing=[_ref(e) for e in links["outgoing"]], backlinks=[_ref(e) for e in links["backlinks"]],
        children=[_ref(e) for e in links["children"]], unresolved=links["unresolved"],
    )
