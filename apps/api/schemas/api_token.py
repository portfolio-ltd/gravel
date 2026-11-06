from datetime import datetime

from pydantic import BaseModel, Field


class ApiTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)  # None = never


class ApiTokenOut(BaseModel):
    id: str
    name: str
    prefix: str
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiTokenCreated(ApiTokenOut):
    token: str  # the plaintext, returned exactly once


class DeviceStart(BaseModel):
    client_name: str = Field(default="Gravel client", max_length=100)


class DeviceStartOut(BaseModel):
    device_code: str
    user_code: str
    verification_uri: str
    verification_uri_complete: str
    interval: int
    expires_in: int


class DevicePoll(BaseModel):
    device_code: str


class DeviceDecision(BaseModel):
    user_code: str
    approve: bool = True


class DeviceInfo(BaseModel):
    user_code: str
    client_name: str
    status: str
    expires_at: datetime
