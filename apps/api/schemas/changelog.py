from datetime import datetime

from pydantic import BaseModel

from models.changelog import ChangelogType


class ChangelogCreate(BaseModel):
    message: str
    type: ChangelogType = ChangelogType.added
    file_path: str | None = None
    author_id: str | None = None


class ChangelogOut(BaseModel):
    id: str
    project_id: str
    message: str
    type: ChangelogType
    file_path: str | None
    author_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedChangelog(BaseModel):
    items: list[ChangelogOut]
    total: int
    page: int
    page_size: int
