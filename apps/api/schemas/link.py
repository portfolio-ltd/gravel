from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl, field_validator

from models.link import LinkEntityType, LinkKind


class LinkIn(BaseModel):
    entity_type: LinkEntityType
    entity_id: str
    url: str = Field(min_length=1, max_length=2000)
    title: str = Field("", max_length=300)
    kind: LinkKind = LinkKind.other
    description: str | None = None

    @field_validator("url")
    @classmethod
    def _http_only(cls, value: str) -> str:
        HttpUrl(value)  # raises on anything that is not an http(s) URL
        return value


class LinkUpdate(BaseModel):
    url: str | None = Field(None, min_length=1, max_length=2000)
    title: str | None = Field(None, max_length=300)
    kind: LinkKind | None = None
    description: str | None = None

    @field_validator("url")
    @classmethod
    def _http_only(cls, value: str | None) -> str | None:
        if value is not None:
            HttpUrl(value)
        return value


class LinkOut(BaseModel):
    id: str
    organization_id: str
    entity_type: LinkEntityType
    entity_id: str
    url: str
    title: str
    kind: LinkKind
    description: str | None
    created_by_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
