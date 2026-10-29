"""Gravel's spec-driven delivery method.

A task moves through stages, each with a *role*. The role supplies default
instructions, decides which documents the stage produces, and decides how the
stage's result is interpreted (e.g. a review that requests changes sends the
task back for rework). The principles every role follows:

  * Nothing is invented. A gap becomes an open question with an owner, not a
    confident guess.
  * Plans precede code, and code is checked against the plan.
  * Project knowledge (decision records, patterns, glossary, runbooks,
    conventions) grounds every run; runs may propose new knowledge, humans
    accept it.
  * Humans approve at the gates the workflow defines.

Stages report results through one contract (STAGE_RESULT_SCHEMA), whether they
run in-process (services/agent.py) or in an engineer runtime container.
"""
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.base import new_uuid
from models.project import Project
from models.sdlc import (
    DocumentKind,
    KnowledgeEntry,
    KnowledgeKind,
    KnowledgeStatus,
    OpenQuestion,
    QuestionStatus,
    TaskDocument,
)
from models.task import Task
from models.task_run import CommentAuthorType

# ── Stage roles ───────────────────────────────────────────────────────────────

_GROUNDING = (
    "Ground your work in .gravel/KNOWLEDGE.md (accepted decision records, patterns, "
    "glossary, runbooks, conventions, wiki pages), in .gravel/CODE_MAP.md when present (the "
    "repository's modules, how they depend on each other, and its commands), in .gravel/LINKS.md "
    "when present (designs, tickets and external specs this work refers to), and in "
    "the documents earlier stages produced under .gravel/docs/. Use the glossary's terms. If you discover something the "
    "next engineer should not have to rediscover — a decision, a reusable pattern, "
    "a domain term, an operational gotcha — propose it as a knowledge entry "
    "(at most three per run; most runs propose none)."
)

STAGE_ROLES: dict[str, dict] = {
    "analyze": {
        "label": "Analyze request",
        "description": "Checks the request is well-defined before anyone plans it.",
        "produces": [DocumentKind.analysis],
        "pushes_code": False,
        "effort": "medium",
        "instructions": (
            "Decide whether this task is defined well enough to plan. Do not plan or "
            "build anything, and do not rewrite the description.\n\n"
            "Assess three things and give each a one-word verdict (Clear / Needs work):\n"
            "1. Intent — who is affected, what behaviour changes, why it matters, and "
            "what is explicitly out of scope.\n"
            "2. Consistency — does the description agree with linked designs, the PRD, "
            "and the glossary? List concrete contradictions or gaps.\n"
            "3. Acceptance criteria — are they testable, and do they cover the main path "
            "plus at least one failure or edge case? List the missing ones in "
            "Given/When/Then-friendly wording.\n\n"
            "Keep the analysis document short — a reader should finish it in a minute. "
            "Only propose acceptance criteria you can derive from the description, "
            "designs, or project knowledge. Every unknown becomes an open question with "
            "a suggested owner (a role or a name), never an assumption."
        ),
    },
    "refine": {
        "label": "Refine spec",
        "description": "Turns the analysis and the answers people gave into a clear spec.",
        "produces": [DocumentKind.spec],
        "pushes_code": False,
        "effort": "medium",
        "instructions": (
            "Write a refined specification for this task, using the analysis, the "
            "comment thread, and the answered questions in .gravel/QUESTIONS.md.\n\n"
            "The spec document has three parts:\n"
            "1. Narrative — who the user is, what changes for them, why, what is in and "
            "out of scope, and the states the design implies (loading, empty, error). "
            "Prose, sized to the feature.\n"
            "2. Decisions — one line per resolved question: the question, the decision, "
            "and where it came from (which comment or answer, by whom).\n"
            "3. Still open — every question nobody has answered, with its owner.\n\n"
            "Resolve an open question only when a comment or answer makes a direct, "
            "specific statement about it; the latest statement wins. Report those in "
            "resolved_questions with the answer and its source. Never fill a gap with "
            "plausible prose — an unanswered question stays open. Return the complete, "
            "updated acceptance criteria list."
        ),
    },
    "plan": {
        "label": "Technical plan",
        "description": "Plans the change, its risks and its test scenarios — no code.",
        "produces": [DocumentKind.plan, DocumentKind.scenarios],
        "pushes_code": False,
        "effort": "high",
        "instructions": (
            "Produce a technical plan an engineer could execute without guessing. Write "
            "no code — describe changes in prose. Inspect the repository if one is "
            "available.\n\n"
            "The plan document has these sections:\n"
            "1. Summary — two or three sentences.\n"
            "2. Changes — grouped by area (data, API, UI, infra…), one bullet per file "
            "or module: what changes and why. Name new functions or types, don't write "
            "them. List the project patterns the plan applies.\n"
            "3. Risks — a table: risk, severity (High/Medium/Low), mitigation.\n"
            "4. Decisions — which accepted decision records this plan relies on and how "
            "it honours them; any new or changed decision it needs (also propose those "
            "as knowledge entries of kind 'decision'), or a one-line note that none is "
            "needed.\n"
            "5. Out of scope — what this task deliberately does not do, and why.\n\n"
            "Also produce a scenarios document: a Gherkin feature with at least one "
            "scenario per acceptance criterion, plus the notable edge cases.\n\n"
            "Anything you cannot decide from the material available is an open question "
            "with an owner. The plan cannot be approved while blocking questions remain."
        ),
    },
    "build": {
        "label": "Build",
        "description": "Implements the approved plan with tests, on the task branch.",
        "produces": [],
        "pushes_code": True,
        "effort": "high",
        "instructions": (
            "Implement the approved plan (.gravel/docs/PLAN.md) on the task branch.\n\n"
            "Work through the plan section by section: change the code, add or update "
            "tests next to each change, and run the project's lint, type-check and test "
            "commands before moving on. Apply the patterns and honour the decisions the "
            "plan names. If .gravel/docs/REVIEW.md or the comments request changes, "
            "address every blocking finding.\n\n"
            "Do not add scope the plan doesn't contain, do not change a recorded "
            "decision, and never weaken a test to make it pass. If the plan cannot be "
            "implemented as written, stop and report needs_human_input explaining which "
            "part and why. Summarize what changed and how you verified it."
        ),
    },
    "review": {
        "label": "Review",
        "description": "Reviews the change against the plan, decisions and criteria.",
        "produces": [DocumentKind.review],
        "pushes_code": False,
        "effort": "high",
        "instructions": (
            "Review the change on the task branch against the default branch. Do not "
            "modify code.\n\n"
            "Check, and report findings under these headings with file:line references:\n"
            "- Plan adherence — every planned change is present; nothing unplanned slipped in.\n"
            "- Decisions & patterns — no recorded decision is silently violated; the "
            "patterns the plan named are actually applied.\n"
            "- Acceptance coverage — every criterion has a scenario and a test exercising it.\n"
            "- Quality — naming per conventions and glossary, error handling, leftover "
            "debug code, TODOs, secrets.\n"
            "- Risks — each planned mitigation is present.\n\n"
            "Mark each finding Blocking or Suggestion. Set verdict to "
            "'changes_requested' when any blocking finding exists, otherwise 'pass'. "
            "State findings factually; don't pad an empty section."
        ),
    },
    "verify": {
        "label": "Verify",
        "description": "Proves each acceptance criterion holds, with evidence.",
        "produces": [DocumentKind.verification],
        "pushes_code": False,
        "effort": "medium",
        "instructions": (
            "Verify the implementation on the task branch without rewriting it.\n\n"
            "Run the strongest checks available (test suites, builds, the scenarios in "
            ".gravel/docs/SCENARIOS.feature, manual checks where possible). The "
            "verification document lists every acceptance criterion with Pass/Fail and "
            "the evidence: commands run and the relevant output.\n\n"
            "Set verdict to 'pass' only when every criterion passes; otherwise "
            "'changes_requested' with what failed. Report needs_human_input when only "
            "a person can judge a criterion (e.g. visual design)."
        ),
    },
    "deploy": {
        "label": "Deploy",
        "description": "Ships the change using the project's deploy configuration.",
        "produces": [],
        "pushes_code": False,
        "effort": "medium",
        "instructions": (
            "Deploy the change using the project's deployment configuration and "
            "runbooks. Capture evidence: the deployed URL, release identifiers, logs. "
            "Report blocked when credentials or configuration are missing, failed when "
            "the deployment errored. Do not re-run QA here."
        ),
    },
    "custom": {
        "label": "Custom",
        "description": "Your own instructions; no documents are expected.",
        "produces": [],
        "pushes_code": True,
        "effort": "medium",
        "instructions": "",
    },
}

ROLE_KEYS = tuple(STAGE_ROLES)


def role_of(stage) -> dict:
    return STAGE_ROLES.get(getattr(stage, "role", None) or "custom", STAGE_ROLES["custom"])


def stage_instructions(stage) -> str:
    """Stage instructions = user text, else the role's defaults; always grounded."""
    role = role_of(stage)
    body = (stage.stage_instructions or "").strip() or role["instructions"] \
        or f"Complete the '{stage.name}' stage for this task."
    return f"{body}\n\n{_GROUNDING}"


# ── Workflow templates ───────────────────────────────────────────────────────

def _stage(name: str, role: str, *, approval: bool = False, ai: bool = True,
           block_questions: bool = False, rework_to: str | None = None, attempts: int = 3) -> dict:
    return {
        "name": name, "role": role, "requires_human_approval": approval,
        "is_ai_executable": ai, "block_on_open_questions": block_questions,
        "rework_to": rework_to, "max_rework_attempts": attempts,
    }


WORKFLOW_TEMPLATES: dict[str, dict] = {
    "spec-driven": {
        "name": "Spec-driven delivery",
        "description": "Analyze → refine the spec → plan → build → review → verify. "
                       "Humans approve the spec, the plan, and the final verification; "
                       "open questions block the plan; failed reviews loop back to build.",
        "recommended": True,
        "stages": [
            _stage("Analyze", "analyze"),
            _stage("Refine spec", "refine", approval=True),
            _stage("Plan", "plan", approval=True, block_questions=True),
            _stage("Build", "build"),
            _stage("Review", "review", rework_to="Build"),
            _stage("Verify", "verify", approval=True, rework_to="Build"),
        ],
    },
    "plan-build-review": {
        "name": "Plan, build, review",
        "description": "A lighter loop for well-specified work: an approved plan, "
                       "then build with automated review and a final human sign-off.",
        "recommended": False,
        "stages": [
            _stage("Plan", "plan", approval=True, block_questions=True),
            _stage("Build", "build"),
            _stage("Review", "review", approval=True, rework_to="Build"),
        ],
    },
    "classic": {
        "name": "Groom, build, test, deploy",
        "description": "The classic four-phase pipeline with a human gate after each phase.",
        "recommended": False,
        "stages": [
            _stage("Groom", "analyze", approval=True),
            _stage("Build", "build", approval=True),
            _stage("Test", "verify", approval=True, rework_to="Build"),
            _stage("Deploy", "deploy"),
        ],
    },
}


async def instantiate_template(db: AsyncSession, template_key: str, owner_id: str,
                               organization_id: str | None, name: str | None = None):
    """Create a workflow from a template, wiring rework targets by stage name."""
    from fastapi import HTTPException

    from models.workflow import Workflow, WorkflowStage

    tpl = WORKFLOW_TEMPLATES.get(template_key)
    if not tpl:
        raise HTTPException(404, f"Unknown workflow template '{template_key}'")
    base = name or tpl["name"]
    wf_name, n = base, 2
    while (await db.execute(select(Workflow.id).where(
            Workflow.organization_id == organization_id, Workflow.name == wf_name))).scalar_one_or_none():
        wf_name, n = f"{base} ({n})", n + 1

    wf = Workflow(id=new_uuid(), owner_id=owner_id, organization_id=organization_id,
                  name=wf_name, description=tpl["description"], template_key=template_key)
    db.add(wf)
    await db.flush()
    by_name: dict[str, WorkflowStage] = {}
    for i, spec in enumerate(tpl["stages"]):
        stage = WorkflowStage(
            id=new_uuid(), workflow_id=wf.id, name=spec["name"], stage_order=i, role=spec["role"],
            requires_human_approval=spec["requires_human_approval"],
            is_ai_executable=spec["is_ai_executable"],
            block_on_open_questions=spec["block_on_open_questions"],
            max_rework_attempts=spec["max_rework_attempts"],
        )
        db.add(stage)
        by_name[spec["name"]] = stage
    await db.flush()
    for spec in tpl["stages"]:
        if spec["rework_to"]:
            by_name[spec["name"]].rework_target_stage_id = by_name[spec["rework_to"]].id
    await db.flush()
    await db.refresh(wf, ["stages"])
    return wf


async def workflow_for_template(db: AsyncSession, template_key: str, owner_id: str, organization_id: str | None):
    """Reuse the org's workflow built from this template, or create it."""
    from models.workflow import Workflow
    existing = (await db.execute(
        select(Workflow).where(Workflow.organization_id == organization_id, Workflow.template_key == template_key)
        .order_by(Workflow.created_at)
    )).scalars().first()
    return existing or await instantiate_template(db, template_key, owner_id, organization_id)


# ── Stage result contract ─────────────────────────────────────────────────────

DOCUMENT_KINDS = [k.value for k in DocumentKind]
KNOWLEDGE_KINDS = [k.value for k in KnowledgeKind]

STAGE_RESULT_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "required": ["outcome", "summary", "blocking_reason", "verdict", "documents",
                 "acceptance_criteria", "open_questions", "resolved_questions", "knowledge"],
    "properties": {
        "outcome": {"type": "string", "enum": ["completed", "needs_human_input", "blocked", "failed"]},
        "summary": {"type": "string"},
        "blocking_reason": {"type": "string"},
        "verdict": {"type": "string", "enum": ["pass", "changes_requested", "none"]},
        "documents": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["kind", "title", "body"],
            "properties": {"kind": {"type": "string", "enum": DOCUMENT_KINDS},
                           "title": {"type": "string"}, "body": {"type": "string"}}}},
        "acceptance_criteria": {"type": "array", "items": {"type": "string"}},
        "open_questions": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["question", "owner"],
            "properties": {"question": {"type": "string"}, "owner": {"type": "string"}}}},
        "resolved_questions": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["id", "answer"],
            "properties": {"id": {"type": "string"}, "answer": {"type": "string"}}}},
        "knowledge": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["kind", "title", "body"],
            "properties": {"kind": {"type": "string", "enum": KNOWLEDGE_KINDS},
                           "title": {"type": "string"}, "body": {"type": "string"}}}},
    },
}

OUTPUT_CONTRACT_MD = """# Reporting your result

When you finish, write `.gravel/output/result.json` (and, if your environment
prints a final message, end it with the same JSON object):

```json
{
  "outcome": "completed | needs_human_input | blocked | failed",
  "summary": "what you did and how you verified it",
  "blocking_reason": "why you stopped (empty when completed)",
  "verdict": "pass | changes_requested | none",
  "documents": [{"kind": "analysis|spec|plan|scenarios|review|verification|notes",
                 "title": "...", "body": "markdown"}],
  "acceptance_criteria": ["the complete list, only if you are revising it"],
  "open_questions": [{"question": "...", "owner": "who should answer"}],
  "resolved_questions": [{"id": "question id from QUESTIONS.md", "answer": "... (source)"}],
  "knowledge": [{"kind": "decision|pattern|glossary|runbook|convention",
                 "title": "...", "body": "markdown"}]
}
```

Long documents may instead be written as files: `.gravel/output/<kind>.md`
(e.g. `plan.md`, `review.md`) or `.gravel/output/scenarios.feature`. Every
field except `outcome` and `summary` may be empty. `verdict` matters only for
review and verify stages. Never commit anything under `.gravel/`.
"""


@dataclass
class StageArtifacts:
    documents: list[dict] = field(default_factory=list)
    acceptance_criteria: list[str] | None = None
    open_questions: list[dict] = field(default_factory=list)
    resolved_questions: list[dict] = field(default_factory=list)
    knowledge: list[dict] = field(default_factory=list)
    verdict: str | None = None

    @classmethod
    def from_payload(cls, data: dict | None) -> "StageArtifacts":
        data = data or {}
        criteria = data.get("acceptance_criteria")
        return cls(
            documents=[d for d in (data.get("documents") or []) if isinstance(d, dict)],
            acceptance_criteria=[str(c) for c in criteria if str(c).strip()] if criteria else None,
            open_questions=[q for q in (data.get("open_questions") or []) if isinstance(q, dict)],
            resolved_questions=[q for q in (data.get("resolved_questions") or []) if isinstance(q, dict)],
            knowledge=[k for k in (data.get("knowledge") or []) if isinstance(k, dict)],
            verdict=data.get("verdict") if data.get("verdict") in ("pass", "changes_requested") else None,
        )

    @property
    def empty(self) -> bool:
        return not (self.documents or self.acceptance_criteria or self.open_questions
                    or self.resolved_questions or self.knowledge)


def _norm(text: str) -> str:
    return re.sub(r"\W+", " ", text or "").strip().lower()


async def next_document_version(db: AsyncSession, task_id: str, kind: DocumentKind) -> int:
    current = (await db.execute(
        select(func.max(TaskDocument.version)).where(TaskDocument.task_id == task_id, TaskDocument.kind == kind)
    )).scalar_one()
    return (current or 0) + 1


async def apply_artifacts(db: AsyncSession, task: Task, project: Project, artifacts: StageArtifacts,
                          run_id: str | None = None, stage_id: str | None = None) -> None:
    """Persist what a stage produced. Never deletes human work."""
    for doc in artifacts.documents:
        try:
            kind = DocumentKind(doc.get("kind"))
        except ValueError:
            kind = DocumentKind.notes
        body = str(doc.get("body") or "").strip()
        if not body:
            continue
        db.add(TaskDocument(
            id=new_uuid(), task_id=task.id, kind=kind,
            title=str(doc.get("title") or kind.value.title())[:300], body_markdown=body,
            version=await next_document_version(db, task.id, kind),
            author_type=CommentAuthorType.ai, task_run_id=run_id, workflow_stage_id=stage_id,
        ))
        await db.flush()

    if artifacts.acceptance_criteria is not None:
        task.acceptance_criteria = merge_ai_criteria(task.acceptance_criteria, artifacts.acceptance_criteria)

    questions = list((await db.execute(select(OpenQuestion).where(OpenQuestion.task_id == task.id))).scalars())
    known = {_norm(q.question) for q in questions}
    for q in artifacts.open_questions:
        text = str(q.get("question") or "").strip()
        if not text or _norm(text) in known:
            continue
        known.add(_norm(text))
        db.add(OpenQuestion(
            id=new_uuid(), task_id=task.id, question=text[:4000],
            owner=(str(q.get("owner") or "").strip() or None), author_type=CommentAuthorType.ai,
            source_run_id=run_id,
        ))

    by_id = {q.id: q for q in questions}
    now = datetime.now(timezone.utc)
    for r in artifacts.resolved_questions:
        q = by_id.get(str(r.get("id") or ""))
        answer = str(r.get("answer") or "").strip()
        if q and answer and q.status == QuestionStatus.open:
            q.status, q.answer, q.answered_at = QuestionStatus.answered, answer, now

    for k in artifacts.knowledge[:3]:
        try:
            kind = KnowledgeKind(k.get("kind"))
        except ValueError:
            continue
        title, body = str(k.get("title") or "").strip(), str(k.get("body") or "").strip()
        if not title or not body or not project.organization_id:
            continue
        dup = (await db.execute(select(KnowledgeEntry.id).where(
            KnowledgeEntry.organization_id == project.organization_id,
            KnowledgeEntry.kind == kind, func.lower(KnowledgeEntry.title) == title.lower(),
        ))).scalar_one_or_none()
        if dup:
            continue
        from services.knowledge_graph import unique_slug
        db.add(KnowledgeEntry(
            id=new_uuid(), organization_id=project.organization_id, project_id=project.id,
            kind=kind, title=title[:300], body_markdown=body, status=KnowledgeStatus.proposed,
            author_type=CommentAuthorType.ai, source_task_id=task.id,
            slug=await unique_slug(db, project.organization_id, title[:300]),
        ))
    await db.flush()


def merge_ai_criteria(existing: list | None, proposed: list[str]) -> list[dict]:
    """Human-written criteria are kept verbatim; AI-written ones are replaced."""
    kept = [c for c in (existing or []) if isinstance(c, dict) and c.get("source") == "human"]
    done_by_text = {_norm(c.get("text", "")): bool(c.get("done")) for c in (existing or []) if isinstance(c, dict)}
    seen = {_norm(c["text"]) for c in kept}
    merged = list(kept)
    for text in proposed:
        key = _norm(text)
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append({"id": new_uuid()[:8], "text": text.strip(), "done": done_by_text.get(key, False),
                       "source": "ai"})
    return merged


async def open_blocking_questions(db: AsyncSession, task_id: str) -> int:
    return (await db.execute(select(func.count()).select_from(OpenQuestion).where(
        OpenQuestion.task_id == task_id, OpenQuestion.status == QuestionStatus.open,
        OpenQuestion.blocking.is_(True),
    ))).scalar_one()


# ── Engineer bundle ───────────────────────────────────────────────────────────

_DOC_FILES = {
    DocumentKind.analysis: "docs/ANALYSIS.md",
    DocumentKind.spec: "docs/SPEC.md",
    DocumentKind.plan: "docs/PLAN.md",
    DocumentKind.scenarios: "docs/SCENARIOS.feature",
    DocumentKind.review: "docs/REVIEW.md",
    DocumentKind.verification: "docs/VERIFICATION.md",
    DocumentKind.notes: "docs/NOTES.md",
}


async def latest_documents(db: AsyncSession, task_id: str) -> dict[DocumentKind, TaskDocument]:
    docs = (await db.execute(
        select(TaskDocument).where(TaskDocument.task_id == task_id).order_by(TaskDocument.version)
    )).scalars().all()
    return {d.kind: d for d in docs}  # later versions overwrite earlier


async def accepted_knowledge(db: AsyncSession, project: Project) -> list[KnowledgeEntry]:
    if not project.organization_id:
        return []
    return list((await db.execute(
        select(KnowledgeEntry).where(
            KnowledgeEntry.organization_id == project.organization_id,
            KnowledgeEntry.status == KnowledgeStatus.accepted,
            (KnowledgeEntry.project_id.is_(None)) | (KnowledgeEntry.project_id == project.id),
        ).order_by(KnowledgeEntry.kind, KnowledgeEntry.number, KnowledgeEntry.title)
    )).scalars())


def knowledge_label(entry: KnowledgeEntry) -> str:
    if entry.kind == KnowledgeKind.decision and entry.number:
        return f"DR-{entry.number:04d}: {entry.title}"
    return entry.title


def render_knowledge(entries: list[KnowledgeEntry]) -> str:
    """Accepted knowledge as one markdown document. [[wikilinks]] become plain
    text (agents cannot follow them); the Obsidian export keeps them."""
    from services.knowledge_graph import Resolver, flatten_wikilinks
    if not entries:
        return "# Project knowledge\n\nNo accepted knowledge yet.\n"
    headings = {
        KnowledgeKind.decision: "Decision records", KnowledgeKind.pattern: "Patterns",
        KnowledgeKind.glossary: "Glossary", KnowledgeKind.runbook: "Runbooks",
        KnowledgeKind.convention: "Conventions", KnowledgeKind.wiki: "Wiki",
    }
    resolver = Resolver(entries)
    out = ["# Project knowledge"]
    for kind, heading in headings.items():
        group = [e for e in entries if e.kind == kind]
        if group:
            out.append(f"\n## {heading}")
            out += [f"\n### {knowledge_label(e)}\n\n{flatten_wikilinks(e.body_markdown.strip(), resolver)}"
                    for e in group]
    return "\n".join(out) + "\n"


def render_links(links: list, task_title: str | None = None) -> str:
    """External links for the project and the task, grouped by what they hang off."""
    if not links:
        return "# Links\n\nNo external links recorded.\n"
    out = ["# Links", "", "Where the rest of this work lives. Open these before guessing at designs, tickets "
           "or external specs."]
    for scope, label in (("project", "Project"), ("task", f"Task: {task_title}" if task_title else "Task")):
        group = [link for link in links if link.entity_type.value == scope]
        if group:
            out.append(f"\n## {label}")
            for link in group:
                line = f"- [{link.title}]({link.url}) — {link.kind.value}"
                if link.description:
                    line += f": {link.description.strip()}"
                out.append(line)
    return "\n".join(out) + "\n"


def render_criteria(task: Task) -> str:
    items = [c for c in (task.acceptance_criteria or []) if isinstance(c, dict)]
    if not items:
        return "- None recorded yet."
    return "\n".join(f"- [{'x' if c.get('done') else ' '}] AC-{i}: {c.get('text', '')}" for i, c in enumerate(items, 1))


def render_questions(questions: list[OpenQuestion]) -> str:
    if not questions:
        return "# Questions\n\nNo questions recorded.\n"
    out = ["# Questions"]
    for status in (QuestionStatus.open, QuestionStatus.answered, QuestionStatus.deferred):
        group = [q for q in questions if q.status == status]
        if not group:
            continue
        out.append(f"\n## {status.value.title()}")
        for q in group:
            line = f"- [{q.id}] {q.question}"
            if q.owner:
                line += f" — owner: {q.owner}"
            if q.answer:
                line += f"\n  - Answer: {q.answer}"
            out.append(line)
    return "\n".join(out) + "\n"


async def bundle_files(db: AsyncSession, task: Task, project: Project) -> dict[str, str]:
    """Extra .gravel/ files: knowledge, questions, code map, earlier documents, contract."""
    questions = list((await db.execute(
        select(OpenQuestion).where(OpenQuestion.task_id == task.id).order_by(OpenQuestion.created_at)
    )).scalars())
    knowledge = await accepted_knowledge(db, project)
    files = {
        "KNOWLEDGE.md": render_knowledge(knowledge),
        "QUESTIONS.md": render_questions(questions),
        "OUTPUT_CONTRACT.md": OUTPUT_CONTRACT_MD,
    }
    from models.link import ExternalLink, LinkEntityType
    links = list((await db.execute(select(ExternalLink).where(
        ExternalLink.organization_id == (project.organization_id or ""),
        ((ExternalLink.entity_type == LinkEntityType.project) & (ExternalLink.entity_id == project.id))
        | ((ExternalLink.entity_type == LinkEntityType.task) & (ExternalLink.entity_id == task.id)),
    ).order_by(ExternalLink.kind, ExternalLink.title))).scalars())
    if links:
        files["LINKS.md"] = render_links(links, task.title)
    from models.code_graph import CodeGraphStatus
    from services.code_graph import get_for_project, render_for_task
    graph = await get_for_project(db, project.id)
    if graph is not None and graph.status == CodeGraphStatus.ready and graph.graph:
        task_text = f"{task.title}\n{task.description}\n{render_criteria(task)}"
        files["CODE_MAP.md"] = render_for_task(graph, task_text, knowledge)
    for kind, doc in (await latest_documents(db, task.id)).items():
        files[_DOC_FILES[kind]] = doc.body_markdown
    return files


# ── Simulated output (no API key) ────────────────────────────────────────────

def simulated_result(role: str, task: Task, open_questions: list[OpenQuestion]) -> dict:
    """Plausible, clearly-labelled output so the whole flow is demoable offline."""
    title = task.title
    criteria = [c.get("text") for c in (task.acceptance_criteria or []) if isinstance(c, dict)] or [
        f"Given a signed-in user, when they use '{title}', then the expected result is shown",
        f"Given invalid input, when they use '{title}', then a clear error explains how to fix it",
    ]
    note = "_Simulated output — add an API key in Settings → API keys for real engineering._\n\n"
    result: dict = {"outcome": "completed", "summary": f"[simulated] {STAGE_ROLES.get(role, STAGE_ROLES['custom'])['label']}: {title}",
                    "blocking_reason": "", "verdict": "none", "documents": [], "acceptance_criteria": [],
                    "open_questions": [], "resolved_questions": [], "knowledge": []}
    if role == "analyze":
        result["documents"] = [{"kind": "analysis", "title": f"Analysis — {title}", "body": note + (
            "**Intent** — Needs work: the description doesn't say who the primary user is.\n\n"
            "**Consistency** — Clear: no linked designs to compare against.\n\n"
            "**Acceptance criteria** — Needs work: add an error-path criterion.")}]
        result["acceptance_criteria"] = criteria
        result["open_questions"] = [{"question": f"Who is the primary user of '{title}', and what do they do today instead?",
                                     "owner": "Product owner"}]
    elif role == "refine":
        result["documents"] = [{"kind": "spec", "title": f"Spec — {title}", "body": note + (
            f"## Narrative\n\n{task.description or title}\n\n## Decisions\n\n- None yet.\n\n"
            "## Still open\n\n" + ("\n".join(f"- {q.question} — owner: {q.owner or 'unassigned'}"
                                             for q in open_questions) or "- Nothing open."))}]
        result["acceptance_criteria"] = criteria
    elif role == "plan":
        result["documents"] = [
            {"kind": "plan", "title": f"Plan — {title}", "body": note + (
                "## Summary\n\nImplement the behaviour described in the spec behind the existing API.\n\n"
                "## Changes\n\n- **API** — add an endpoint for the new behaviour, validated by the existing schema layer.\n"
                "- **UI** — add the screen state and wire it to the endpoint.\n\n"
                "## Risks\n\n| Risk | Severity | Mitigation |\n|---|---|---|\n"
                "| Input edge cases | Medium | Scenario per error path |\n\n"
                "## Decisions\n\nNo new decision needed.\n\n## Out of scope\n\n- Bulk operations.")},
            {"kind": "scenarios", "title": "Acceptance scenarios", "body": f"Feature: {title}\n" + "".join(
                f"\n  Scenario: AC-{i}\n    # {c}\n" for i, c in enumerate(criteria, 1))},
        ]
    elif role == "review":
        result["verdict"] = "pass"
        result["documents"] = [{"kind": "review", "title": f"Review — {title}", "body": note + (
            "**Plan adherence** — all planned changes present.\n\n**Decisions & patterns** — no violations.\n\n"
            "**Acceptance coverage** — every criterion has a scenario.\n\n**Verdict** — pass.")}]
    elif role == "verify":
        result["verdict"] = "pass"
        result["documents"] = [{"kind": "verification", "title": f"Verification — {title}", "body": note + "\n".join(
            f"- AC-{i}: Pass — simulated check" for i, _ in enumerate(criteria, 1))}]
    return result
