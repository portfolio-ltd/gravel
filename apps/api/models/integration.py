import enum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Boolean
from db.base import BaseModel, TimestampMixin


class GitProvider(str, enum.Enum):
    github    = "github"
    gitlab    = "gitlab"
    bitbucket = "bitbucket"
    gitea     = "gitea"


class DeployProvider(str, enum.Enum):
    aws    = "aws"
    gcp    = "gcp"
    azure  = "azure"
    custom = "custom"


class GitIntegration(BaseModel, TimestampMixin):
    __tablename__ = "git_integrations"

    owner_id:               Mapped[str]       = mapped_column(String(36), index=True)
    provider:               Mapped[str]       = mapped_column(String(20))   # GitProvider value
    name:                   Mapped[str]       = mapped_column(String(120))  # display name
    base_url:               Mapped[str | None] = mapped_column(String(500)) # Gitea / self-hosted
    access_token_encrypted: Mapped[str | None] = mapped_column(String(2000))
    default_branch:         Mapped[str]       = mapped_column(String(100), default="main")
    is_active:              Mapped[bool]      = mapped_column(Boolean, default=True)


class DeployEnvironment(BaseModel, TimestampMixin):
    __tablename__ = "deploy_environments"

    owner_id:           Mapped[str]       = mapped_column(String(36), index=True)
    project_id:         Mapped[str | None] = mapped_column(String(36), index=True)  # null = global
    name:               Mapped[str]       = mapped_column(String(120))   # e.g. "staging"
    provider:           Mapped[str]       = mapped_column(String(20))    # DeployProvider value
    region:             Mapped[str | None] = mapped_column(String(100))
    config_encrypted:   Mapped[str | None] = mapped_column(String(4000)) # JSON blob
    is_active:          Mapped[bool]      = mapped_column(Boolean, default=True)
