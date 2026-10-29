"""Spec-driven SDLC records: the artifacts a task accumulates on its way to done.

- TaskDocument   — versioned markdown produced by a stage (analysis, spec,
                   plan, BDD scenarios, review, verification) or edited by a human.
- OpenQuestion   — an unresolved decision with a named owner. Blocking
                   questions hold back stages configured to wait for answers.
- KnowledgeEntry — project/org memory every engineer run is grounded in:
                   decision records, patterns, glossary terms, runbooks,
                   conventions and wiki pages. AI runs may only *propose*
                   entries; a human accepts them. Entries link to each other
                   with [[wikilinks]] (services/knowledge_graph.py), which is
                   what the knowledge map draws.
"""
import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from db.base import BaseModel
from models.task_run import CommentAuthorType


class DocumentKind(str, enum.Enum):
    analysis = "analysis"          # is the request well-defined? gaps, missing criteria
    spec = "spec"                  # refined description of the behaviour to build
    plan = "plan"                  # technical plan: changes, risks, decisions, out-of-scope
    scenarios = "scenarios"        # Gherkin acceptance scenarios
    review = "review"              # code review against plan, decisions, criteria
    verification = "verification"  # evidence that acceptance criteria hold
    notes = "notes"                # anything else a stage wants to keep


class QuestionStatus(str, enum.Enum):
    open = "open"
    answered = "answered"
    deferred = "deferred"    # consciously left for later; no longer blocks
    dismissed = "dismissed"  # not a real question


class KnowledgeKind(str, enum.Enum):
    decision = "decision"      # architecture decision record
    pattern = "pattern"        # reusable implementation idiom
    glossary = "glossary"      # domain term and its meaning
    runbook = "runbook"        # operational procedure
    convention = "convention"  # coding / repo / review convention
    wiki = "wiki"              # free-form page; links to other entries with [[wikilinks]]


class KnowledgeStatus(str, enum.Enum):
    proposed = "proposed"
    accepted = "accepted"
    deprecated = "deprecated"
    rejected = "rejected"


class TaskDocument(BaseModel):
    __tablename__ = "task_documents"

    task_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[DocumentKind] = mapped_column(SAEnum(DocumentKind, native_enum=False, length=30), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False, default="")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    author_type: Mapped[CommentAuthorType] = mapped_column(
        SAEnum(CommentAuthorType, native_enum=False, length=50), nullable=False, default=CommentAuthorType.ai
    )
    author_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    task_run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("task_runs.id", ondelete="SET NULL"), nullable=True
    )
    # Stage that produced it — lets the UI group documents by pipeline step
    workflow_stage_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class OpenQuestion(BaseModel):
    __tablename__ = "open_questions"

    task_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    # Free text on purpose: owners are often people outside Gravel ("Legal", "Priya")
    owner: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[QuestionStatus] = mapped_column(
        SAEnum(QuestionStatus, native_enum=False, length=20), nullable=False, default=QuestionStatus.open
    )
    blocking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    answered_by_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    author_type: Mapped[CommentAuthorType] = mapped_column(
        SAEnum(CommentAuthorType, native_enum=False, length=50), nullable=False, default=CommentAuthorType.ai
    )
    source_run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("task_runs.id", ondelete="SET NULL"), nullable=True
    )


class KnowledgeEntry(BaseModel):
    __tablename__ = "knowledge_entries"

    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Null = applies to every project in the org
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    kind: Mapped[KnowledgeKind] = mapped_column(SAEnum(KnowledgeKind, native_enum=False, length=20), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[KnowledgeStatus] = mapped_column(
        SAEnum(KnowledgeStatus, native_enum=False, length=20), nullable=False, default=KnowledgeStatus.accepted
    )
    # Sequential per org for decisions ("DR-0007"); null for other kinds
    number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    author_type: Mapped[CommentAuthorType] = mapped_column(
        SAEnum(CommentAuthorType, native_enum=False, length=50), nullable=False, default=CommentAuthorType.human
    )
    created_by_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    source_task_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    # Stable, URL-safe name unique per org: what [[wikilinks]] and the
    # Obsidian export use. Derived from the title on creation.
    slug: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    # Wiki hierarchy: the page this one sits under (any kind may have a parent)
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("knowledge_entries.id", ondelete="SET NULL"), nullable=True
    )
