"""Local runners: API tokens, device login, local engineer runtimes, runner LLM jobs,
async operations for long requests

Revision ID: 011
Revises: 010
Create Date: 2026-11-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "api_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("prefix", sa.String(16), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )
    op.create_table(
        "device_authorizations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("device_code_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("user_code", sa.String(16), nullable=False, index=True),
        sa.Column("client_name", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        *_timestamps(),
    )
    with op.batch_alter_table("engineer_runtimes") as b:
        b.add_column(sa.Column("kind", sa.String(20), nullable=False, server_default="docker"))
        b.add_column(sa.Column("host_label", sa.String(200), nullable=True))
        b.add_column(sa.Column("owner_user_id", sa.String(36), nullable=True))
        b.add_column(sa.Column("scope", sa.String(20), nullable=False, server_default="org"))
        b.add_column(sa.Column("executor", sa.String(40), nullable=True))
    op.create_table(
        "llm_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("system", sa.Text, nullable=True),
        sa.Column("prompt", sa.Text, nullable=False),
        sa.Column("json_schema", sa.JSON, nullable=True),
        sa.Column("max_tokens", sa.Integer, nullable=False, server_default="4000"),
        sa.Column("runtime_id", sa.String(36), nullable=True),
        sa.Column("result_text", sa.Text, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("tokens_in", sa.Integer, nullable=True),
        sa.Column("tokens_out", sa.Integer, nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )
    op.create_table(
        "async_operations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("method", sa.String(10), nullable=False),
        sa.Column("path", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("http_status", sa.Integer, nullable=True),
        sa.Column("body", sa.JSON, nullable=True),
        *_timestamps(),
    )


def downgrade() -> None:
    op.drop_table("async_operations")
    op.drop_table("llm_jobs")
    with op.batch_alter_table("engineer_runtimes") as b:
        for column in ("executor", "scope", "owner_user_id", "host_label", "kind"):
            b.drop_column(column)
    op.drop_table("device_authorizations")
    op.drop_table("api_tokens")
