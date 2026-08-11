"""Add engineers, task_runs, comments, artifacts

Revision ID: 002
Revises: 001
Create Date: 2026-04-17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "engineers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("template", sa.String(100), nullable=False, server_default="fullstack"),
        sa.Column("skills_markdown", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="idle"),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_engineers_owner", "engineers", ["owner_id"])

    op.create_table(
        "engineer_runtimes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("engineer_id", sa.String(36), sa.ForeignKey("engineers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("container_id", sa.String(200), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_eng_runtimes_engineer", "engineer_runtimes", ["engineer_id"])

    op.create_table(
        "task_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("engineer_id", sa.String(36), sa.ForeignKey("engineers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("phase", sa.String(30), nullable=False, server_default="build"),
        sa.Column("outcome", sa.String(50), nullable=True),
        sa.Column("blocking_reason", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_task_runs_task", "task_runs", ["task_id"])

    op.create_table(
        "task_run_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_run_id", sa.String(36), sa.ForeignKey("task_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("level", sa.String(20), nullable=False, server_default="info"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_task_run_logs_run", "task_run_logs", ["task_run_id"])

    op.create_table(
        "task_comments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_run_id", sa.String(36), sa.ForeignKey("task_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("author_type", sa.String(10), nullable=False, server_default="human"),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("action_flag", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_task_comments_task", "task_comments", ["task_id"])

    op.create_table(
        "evidence_artifacts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_run_id", sa.String(36), sa.ForeignKey("task_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("artifact_type", sa.String(20), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_artifacts_run", "evidence_artifacts", ["task_run_id"])


def downgrade() -> None:
    op.drop_table("evidence_artifacts")
    op.drop_table("task_comments")
    op.drop_table("task_run_logs")
    op.drop_table("task_runs")
    op.drop_table("engineer_runtimes")
    op.drop_table("engineers")
