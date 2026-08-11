from datetime import datetime

from pydantic import BaseModel, EmailStr

from models.organization import OrgRole


class OrgOut(BaseModel):
    id: str
    name: str
    slug: str
    role: OrgRole          # the requesting user's role in this org
    member_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class OrgMemberOut(BaseModel):
    user_id: str
    name: str
    email: str
    role: OrgRole
    joined_at: datetime


class OrgDetail(BaseModel):
    id: str
    name: str
    slug: str
    created_at: datetime
    members: list[OrgMemberOut]

    model_config = {"from_attributes": True}


class OrgCreate(BaseModel):
    name: str


class OrgUpdate(BaseModel):
    name: str | None = None


class MemberAdd(BaseModel):
    email: EmailStr
    name: str | None = None
    role: OrgRole = OrgRole.member


class MemberRoleUpdate(BaseModel):
    role: OrgRole
