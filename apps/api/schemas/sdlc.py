from datetime import datetime

from pydantic import BaseModel, Field

from models.sdlc import DocumentKind, KnowledgeKind, KnowledgeStatus, QuestionStatus
from models.task_run import CommentAuthorType


class TaskDocumentOut(BaseModel):
    id: str
    task_id: str
    kind: DocumentKind
    title: str
    body_markdown: str
    version: int
    author_type: CommentAuthorType
    author_id: str | None
    task_run_id: str | None
    workflow_stage_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskDocumentIn(BaseModel):
    kind: DocumentKind
    title: str = Field(min_length=1, max_length=300)
    body_markdown: str


class QuestionOut(BaseModel):
    id: str
    task_id: str
    question: str
    owner: str | None
    status: QuestionStatus
    blocking: bool
    answer: str | None
    answered_by_id: str | None
    answered_at: datetime | None
    author_type: CommentAuthorType
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionIn(BaseModel):
    question: str = Field(min_length=1)
    owner: str | None = None
    blocking: bool = True


class QuestionUpdate(BaseModel):
    question: str | None = None
    owner: str | None = None
    blocking: bool | None = None
    status: QuestionStatus | None = None
    answer: str | None = None


class KnowledgeOut(BaseModel):
    id: str
    organization_id: str
    project_id: str | None
    kind: KnowledgeKind
    title: str
    body_markdown: str
    status: KnowledgeStatus
    number: int | None
    label: str
    slug: str | None = None
    parent_id: str | None = None
    author_type: CommentAuthorType
    created_by_id: str | None
    source_task_id: str | None
    created_at: datetime
    updated_at: datetime


class KnowledgeIn(BaseModel):
    kind: KnowledgeKind
    title: str = Field(min_length=1, max_length=300)
    body_markdown: str = ""
    project_id: str | None = None
    status: KnowledgeStatus = KnowledgeStatus.accepted
    slug: str | None = Field(None, max_length=200)
    parent_id: str | None = None


class KnowledgeUpdate(BaseModel):
    title: str | None = None
    body_markdown: str | None = None
    status: KnowledgeStatus | None = None
    project_id: str | None = None
    slug: str | None = Field(None, max_length=200)
    parent_id: str | None = None


class KnowledgeRef(BaseModel):
    """A linked entry, enough to render a chip."""
    id: str
    title: str
    kind: KnowledgeKind
    status: KnowledgeStatus
    slug: str | None
    label: str


class KnowledgeLinksOut(BaseModel):
    outgoing: list[KnowledgeRef]
    backlinks: list[KnowledgeRef]
    children: list[KnowledgeRef]
    unresolved: list[str]


class KnowledgeImportOut(BaseModel):
    created: int
    updated: int
    skipped: int
    titles: list[str]


class IssueImportIn(BaseModel):
    state: str = Field("open", pattern="^(open|closed|all)$")
    labels: str | None = None
    limit: int = Field(50, ge=1, le=100)


class PreferencesOut(BaseModel):
    preferences: dict
