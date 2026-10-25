"""Spec-driven SDLC endpoints: task documents, open questions, acceptance
criteria, the knowledge base, and GitHub issue import."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from config import settings
from db.base import new_uuid
from dependencies import DB, CurrentOrg, CurrentUser
from models.project import Project
from models.sdlc import (
    KnowledgeEntry,
    KnowledgeKind,
    KnowledgeStatus,
    OpenQuestion,
    QuestionStatus,
    TaskDocument,
)
from models.task import Task
from models.task_run import CommentAuthorType
from schemas.sdlc import (
    IssueImportIn,
    KnowledgeIn,
    KnowledgeOut,
    KnowledgeUpdate,
    QuestionIn,
    QuestionOut,
    QuestionUpdate,
    TaskDocumentIn,
    TaskDocumentOut,
)
from schemas.task import CriteriaUpdate, TaskOut
from services import sdlc, ws_manager
from services.model_catalog import MODEL_CATALOG

router = APIRouter(tags=["sdlc"])


async def _task_or_404(db, task_id: str, org) -> Task:
    task = await db.get(Task, task_id, options=[selectinload(Task.project)])
    if not task or not task.project or task.project.organization_id != org.id:
        raise HTTPException(404, "Task not found")
    return task


async def _notify(task: Task) -> None:
    await ws_manager.broadcast(task.project_id, {"type": "task.artifacts", "task_id": task.id})


# ── Meta ──────────────────────────────────────────────────────────────────────

@router.get("/meta")
async def meta(current_user: CurrentUser):
    """Everything the UI needs to render pickers: models, stage roles, templates."""
    return {
        "default_model": settings.DEFAULT_MODEL,
        "models": MODEL_CATALOG,
        "stage_roles": [
            {"key": key, "label": r["label"], "description": r["description"],
             "produces": [k.value for k in r["produces"]], "default_instructions": r["instructions"]}
            for key, r in sdlc.STAGE_ROLES.items()
        ],
        "workflow_templates": [
            {"key": key, "name": t["name"], "description": t["description"], "recommended": t["recommended"],
             "stages": [{k: v for k, v in s.items()} for s in t["stages"]]}
            for key, t in sdlc.WORKFLOW_TEMPLATES.items()
        ],
    }


# ── Documents ─────────────────────────────────────────────────────────────────

@router.get("/tasks/{task_id}/documents", response_model=list[TaskDocumentOut])
async def list_documents(task_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB, history: bool = False):
    """Latest version of each document kind, or every version with ?history=true."""
    await _task_or_404(db, task_id, org)
    if history:
        rows = (await db.execute(
            select(TaskDocument).where(TaskDocument.task_id == task_id)
            .order_by(TaskDocument.kind, TaskDocument.version.desc())
        )).scalars().all()
        return list(rows)
    return list((await sdlc.latest_documents(db, task_id)).values())


@router.post("/tasks/{task_id}/documents", response_model=TaskDocumentOut, status_code=201)
async def save_document(task_id: str, body: TaskDocumentIn, current_user: CurrentUser, org: CurrentOrg, db: DB):
    """A human edit — stored as a new version, never overwriting history."""
    task = await _task_or_404(db, task_id, org)
    doc = TaskDocument(
        id=new_uuid(), task_id=task.id, kind=body.kind, title=body.title, body_markdown=body.body_markdown,
        version=await sdlc.next_document_version(db, task.id, body.kind),
        author_type=CommentAuthorType.human, author_id=current_user.id,
    )
    db.add(doc)
    await db.flush()
    await _notify(task)
    return doc


# ── Acceptance criteria ──────────────────────────────────────────────────────

@router.put("/tasks/{task_id}/acceptance-criteria", response_model=TaskOut)
async def set_criteria(task_id: str, body: CriteriaUpdate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    task = await _task_or_404(db, task_id, org)
    previous = {c.get("id"): c for c in (task.acceptance_criteria or []) if isinstance(c, dict)}
    items = []
    for item in body.items:
        text = item.text.strip()
        if not text:
            continue
        before = previous.get(item.id) if item.id else None
        # Untouched AI criteria stay AI-authored (and replaceable); edits become human-owned
        source = before.get("source", "human") if before and before.get("text") == text else "human"
        items.append({"id": item.id or new_uuid()[:8], "text": text, "done": item.done, "source": source})
    task.acceptance_criteria = items
    await db.flush()
    await db.refresh(task, ["tags"])
    await _notify(task)
    return task


# ── Open questions ───────────────────────────────────────────────────────────

@router.get("/tasks/{task_id}/questions", response_model=list[QuestionOut])
async def list_questions(task_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    await _task_or_404(db, task_id, org)
    return list((await db.execute(
        select(OpenQuestion).where(OpenQuestion.task_id == task_id).order_by(OpenQuestion.created_at)
    )).scalars())


@router.post("/tasks/{task_id}/questions", response_model=QuestionOut, status_code=201)
async def add_question(task_id: str, body: QuestionIn, current_user: CurrentUser, org: CurrentOrg, db: DB):
    task = await _task_or_404(db, task_id, org)
    q = OpenQuestion(id=new_uuid(), task_id=task.id, question=body.question.strip(), owner=body.owner,
                     blocking=body.blocking, author_type=CommentAuthorType.human)
    db.add(q)
    await db.flush()
    await _notify(task)
    return q


async def _question_or_404(db, question_id: str, org) -> tuple[OpenQuestion, Task]:
    q = await db.get(OpenQuestion, question_id)
    if not q:
        raise HTTPException(404, "Question not found")
    return q, await _task_or_404(db, q.task_id, org)


@router.patch("/questions/{question_id}", response_model=QuestionOut)
async def update_question(question_id: str, body: QuestionUpdate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    q, task = await _question_or_404(db, question_id, org)
    fields = body.model_dump(exclude_unset=True)
    if "answer" in fields and fields["answer"] and "status" not in fields:
        fields["status"] = QuestionStatus.answered
    if fields.get("status") == QuestionStatus.answered and not (fields.get("answer") or q.answer):
        raise HTTPException(400, "An answered question needs an answer")
    for key, value in fields.items():
        setattr(q, key, value)
    if fields.get("status") == QuestionStatus.answered:
        q.answered_by_id, q.answered_at = current_user.id, datetime.now(timezone.utc)
    elif fields.get("status") == QuestionStatus.open:
        q.answered_by_id = q.answered_at = None
    await db.flush()
    await _notify(task)
    return q


@router.delete("/questions/{question_id}", status_code=204)
async def delete_question(question_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    q, task = await _question_or_404(db, question_id, org)
    await db.delete(q)
    await db.flush()
    await _notify(task)


# ── Knowledge base ───────────────────────────────────────────────────────────

def _knowledge_out(e: KnowledgeEntry) -> KnowledgeOut:
    return KnowledgeOut(
        id=e.id, organization_id=e.organization_id, project_id=e.project_id, kind=e.kind, title=e.title,
        body_markdown=e.body_markdown, status=e.status, number=e.number, label=sdlc.knowledge_label(e),
        author_type=e.author_type, created_by_id=e.created_by_id, source_task_id=e.source_task_id,
        created_at=e.created_at, updated_at=e.updated_at,
    )


async def _check_project(db, project_id: str | None, org) -> None:
    if project_id:
        p = await db.get(Project, project_id)
        if not p or p.organization_id != org.id:
            raise HTTPException(400, "Project not found in this organization")


async def _assign_decision_number(db, entry: KnowledgeEntry) -> None:
    if entry.kind == KnowledgeKind.decision and entry.number is None and entry.status == KnowledgeStatus.accepted:
        current = (await db.execute(select(func.max(KnowledgeEntry.number)).where(
            KnowledgeEntry.organization_id == entry.organization_id, KnowledgeEntry.kind == KnowledgeKind.decision,
        ))).scalar_one()
        entry.number = (current or 0) + 1


@router.get("/knowledge", response_model=list[KnowledgeOut])
async def list_knowledge(current_user: CurrentUser, org: CurrentOrg, db: DB, kind: KnowledgeKind | None = None,
                         status: KnowledgeStatus | None = None, project_id: str | None = None):
    q = select(KnowledgeEntry).where(KnowledgeEntry.organization_id == org.id)
    if kind:
        q = q.where(KnowledgeEntry.kind == kind)
    if status:
        q = q.where(KnowledgeEntry.status == status)
    if project_id:
        q = q.where((KnowledgeEntry.project_id.is_(None)) | (KnowledgeEntry.project_id == project_id))
    rows = (await db.execute(q.order_by(KnowledgeEntry.kind, KnowledgeEntry.number, KnowledgeEntry.title))).scalars()
    return [_knowledge_out(e) for e in rows]


@router.post("/knowledge", response_model=KnowledgeOut, status_code=201)
async def create_knowledge(body: KnowledgeIn, current_user: CurrentUser, org: CurrentOrg, db: DB):
    await _check_project(db, body.project_id, org)
    entry = KnowledgeEntry(
        id=new_uuid(), organization_id=org.id, project_id=body.project_id, kind=body.kind, title=body.title.strip(),
        body_markdown=body.body_markdown, status=body.status, author_type=CommentAuthorType.human,
        created_by_id=current_user.id,
    )
    await _assign_decision_number(db, entry)
    db.add(entry)
    await db.flush()
    return _knowledge_out(entry)


async def _entry_or_404(db, entry_id: str, org) -> KnowledgeEntry:
    entry = await db.get(KnowledgeEntry, entry_id)
    if not entry or entry.organization_id != org.id:
        raise HTTPException(404, "Knowledge entry not found")
    return entry


@router.patch("/knowledge/{entry_id}", response_model=KnowledgeOut)
async def update_knowledge(entry_id: str, body: KnowledgeUpdate, current_user: CurrentUser, org: CurrentOrg, db: DB):
    entry = await _entry_or_404(db, entry_id, org)
    fields = body.model_dump(exclude_unset=True)
    if "project_id" in fields:
        await _check_project(db, fields["project_id"], org)
    for key, value in fields.items():
        if value is not None or key == "project_id":
            setattr(entry, key, value)
    await _assign_decision_number(db, entry)
    await db.flush()
    return _knowledge_out(entry)


@router.delete("/knowledge/{entry_id}", status_code=204)
async def delete_knowledge(entry_id: str, current_user: CurrentUser, org: CurrentOrg, db: DB):
    entry = await _entry_or_404(db, entry_id, org)
    await db.delete(entry)
    await db.flush()


@router.get("/knowledge/export", response_model=None)
async def export_knowledge(current_user: CurrentUser, org: CurrentOrg, db: DB, project_id: str | None = None):
    """Accepted knowledge as one markdown document (e.g. to commit as docs/KNOWLEDGE.md)."""
    from fastapi.responses import PlainTextResponse
    project = await db.get(Project, project_id) if project_id else None
    if project_id and (not project or project.organization_id != org.id):
        raise HTTPException(404, "Project not found")
    q = select(KnowledgeEntry).where(KnowledgeEntry.organization_id == org.id,
                                     KnowledgeEntry.status == KnowledgeStatus.accepted)
    if project_id:
        q = q.where((KnowledgeEntry.project_id.is_(None)) | (KnowledgeEntry.project_id == project_id))
    entries = list((await db.execute(q.order_by(KnowledgeEntry.kind, KnowledgeEntry.number))).scalars())
    return PlainTextResponse(sdlc.render_knowledge(entries), media_type="text/markdown")


# ── GitHub issue import ──────────────────────────────────────────────────────

@router.post("/projects/{project_id}/issues/import")
async def import_github_issues(project_id: str, body: IssueImportIn, current_user: CurrentUser, org: CurrentOrg, db: DB):
    from services.issues import import_issues
    project = await db.get(Project, project_id)
    if not project or project.organization_id != org.id:
        raise HTTPException(404, "Project not found")
    try:
        result = await import_issues(db, project, state=body.state, labels=body.labels, limit=body.limit)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
    await ws_manager.broadcast(project.id, {"type": "tasks.imported", **result})
    return result
