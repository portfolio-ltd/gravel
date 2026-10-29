"""Graph engineering: workflow success edges, task dependencies, code graphs

Revision ID: 009
Revises: 008
Create Date: 2026-10-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NULL = the next stage by stage_order, so existing workflows are unchanged
    op.add_column("workflow_stages", sa.Column("next_stage_id", sa.String(36), nullable=True))
    # Ids of tasks in the same project that must be done first
    op.add_column("tasks", sa.Column("depends_on", sa.JSON, nullable=True))
    op.create_table(
        "code_graphs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"),
                  nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("repo_url", sa.String(500), nullable=True),
        sa.Column("ref", sa.String(255), nullable=True),
        sa.Column("commit_sha", sa.String(64), nullable=True),
        sa.Column("graph", sa.JSON, nullable=True),
        sa.Column("summary_markdown", sa.Text, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("built_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("code_graphs")
    with op.batch_alter_table("tasks") as b:
        b.drop_column("depends_on")
    with op.batch_alter_table("workflow_stages") as b:
        b.drop_column("next_stage_id")
