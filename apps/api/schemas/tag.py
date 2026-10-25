from datetime import datetime

from pydantic import BaseModel


class TagOut(BaseModel):
    id: str
    organization_id: str
    name: str
    color: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    name: str
    color: str = "#6366f1"


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class TagIdsIn(BaseModel):
    tag_ids: list[str]
