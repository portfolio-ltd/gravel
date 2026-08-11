from datetime import datetime

from pydantic import BaseModel

from models.prd import PRDStatus
from models.task_run import CommentAuthorType
from schemas.tag import TagOut


class PRDListOut(BaseModel):
    id: str
    organization_id: str
    title: str
    summary: str | None
    status: PRDStatus
    created_by_user_id: str | None
    comment_count: int = 0
    tags: list[TagOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PRDCommentOut(BaseModel):
    id: str
    prd_id: str
    author_id: str | None
    author_type: CommentAuthorType
    body: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PRDOut(PRDListOut):
    body_markdown: str
    comments: list[PRDCommentOut] = []


class PRDCreate(BaseModel):
    title: str
    summary: str | None = None
    body_markdown: str = ""


class PRDUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    body_markdown: str | None = None
    status: PRDStatus | None = None


class PRDCommentCreate(BaseModel):
    body: str


class PRDChatRequest(BaseModel):
    message: str
    model: str | None = None


class PRDChatResponse(BaseModel):
    reply: str
    updated_body: str | None = None
    model: str
    tokens_in: int = 0
    tokens_out: int = 0


class PRDSplitOut(BaseModel):
    task_titles: list[str]


class PRDConvertRequest(BaseModel):
    project_ids: list[str]
    task_titles: list[str]


class PRDConvertOut(BaseModel):
    created_count: int
