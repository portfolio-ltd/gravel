"""Organizations (real tenancy), PRDs, tags, token usage + personal-org backfill

Revision ID: 005
Revises: 004
Create Date: 2026-08-10
"""
import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ORG_ID_TABLES = ["projects", "engineers", "git_integrations", "deploy_environments", "workflows"]


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"], unique=True)

    op.create_table(
        "organization_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="member"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_org_member"),
    )
    op.create_index("ix_org_members_org", "organization_members", ["organization_id"])
    op.create_index("ix_org_members_user", "organization_members", ["user_id"])

    op.create_table(
        "tags",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("color", sa.String(20), nullable=False, server_default="#6366f1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "name", name="uq_tag_org_name"),
    )
    op.create_index("ix_tags_org", "tags", ["organization_id"])

    op.create_table(
        "prds",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("body_markdown", sa.Text, nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_by_user_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_prds_org", "prds", ["organization_id"])

    op.create_table(
        "prd_comments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("prd_id", sa.String(36), nullable=False),
        sa.Column("author_id", sa.String(36), nullable=True),
        sa.Column("author_type", sa.String(10), nullable=False, server_default="human"),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_prd_comments_prd", "prd_comments", ["prd_id"])

    op.create_table(
        "task_tags",
        sa.Column("task_id", sa.String(36), nullable=False),
        sa.Column("tag_id", sa.String(36), nullable=False),
        sa.PrimaryKeyConstraint("task_id", "tag_id"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "prd_tags",
        sa.Column("prd_id", sa.String(36), nullable=False),
        sa.Column("tag_id", sa.String(36), nullable=False),
        sa.PrimaryKeyConstraint("prd_id", "tag_id"),
        sa.ForeignKeyConstraint(["prd_id"], ["prds.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "token_usages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("organization_id", sa.String(36), nullable=True),
        sa.Column("task_id", sa.String(36), nullable=True),
        sa.Column("task_run_id", sa.String(36), nullable=True),
        sa.Column("prd_id", sa.String(36), nullable=True),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("tokens_in", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Float, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    for col in ("user_id", "organization_id", "task_id", "task_run_id", "prd_id"):
        op.create_index(f"ix_token_usages_{col}", "token_usages", [col])

    for table in ORG_ID_TABLES:
        op.add_column(table, sa.Column("organization_id", sa.String(36), nullable=True))
        op.create_index(f"ix_{table}_organization", table, ["organization_id"])

    _backfill_personal_orgs()


def _backfill_personal_orgs() -> None:
    """Every existing user gets a personal org (admin membership) and their
    owned rows move into it."""
    bind = op.get_bind()
    now = datetime.now(timezone.utc)
    users = bind.execute(sa.text("SELECT id, name FROM users")).fetchall()
    for user_id, name in users:
        org_id = str(uuid.uuid4())
        bind.execute(
            sa.text(
                "INSERT INTO organizations (id, name, slug, created_at, updated_at) "
                "VALUES (:id, :name, :slug, :now, :now)"
            ),
            {"id": org_id, "name": f"{name}'s Org", "slug": f"personal-{user_id[:8]}", "now": now},
        )
        bind.execute(
            sa.text(
                "INSERT INTO organization_members (id, organization_id, user_id, role, created_at, updated_at) "
                "VALUES (:id, :org, :user, 'admin', :now, :now)"
            ),
            {"id": str(uuid.uuid4()), "org": org_id, "user": user_id, "now": now},
        )
        for table in ORG_ID_TABLES:
            bind.execute(
                sa.text(f"UPDATE {table} SET organization_id = :org WHERE owner_id = :user"),
                {"org": org_id, "user": user_id},
            )


def downgrade() -> None:
    for table in reversed(ORG_ID_TABLES):
        op.drop_index(f"ix_{table}_organization", table_name=table)
        op.drop_column(table, "organization_id")
    for col in ("prd_id", "task_run_id", "task_id", "organization_id", "user_id"):
        op.drop_index(f"ix_token_usages_{col}", table_name="token_usages")
    op.drop_table("token_usages")
    op.drop_table("prd_tags")
    op.drop_table("task_tags")
    op.drop_index("ix_prd_comments_prd", table_name="prd_comments")
    op.drop_table("prd_comments")
    op.drop_index("ix_prds_org", table_name="prds")
    op.drop_table("prds")
    op.drop_index("ix_tags_org", table_name="tags")
    op.drop_table("tags")
    op.drop_index("ix_org_members_user", table_name="organization_members")
    op.drop_index("ix_org_members_org", table_name="organization_members")
    op.drop_table("organization_members")
    op.drop_index("ix_organizations_slug", table_name="organizations")
    op.drop_table("organizations")
