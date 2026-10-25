"""Spec-driven SDLC: task documents, open questions, knowledge base, stage
roles, acceptance criteria, GitHub issue sync, UI preferences.

Revision ID: 007
Revises: 006
Create Date: 2026-10-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "task_documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("body_markdown", sa.Text, nullable=False, server_default=""),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("author_type", sa.String(50), nullable=False, server_default="ai"),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("task_run_id", sa.String(36), sa.ForeignKey("task_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("workflow_stage_id", sa.String(36), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_task_documents_task_id", "task_documents", ["task_id"])

    op.create_table(
        "open_questions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("task_id", sa.String(36), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("owner", sa.String(200), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("blocking", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("answer", sa.Text, nullable=True),
        sa.Column("answered_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("author_type", sa.String(50), nullable=False, server_default="ai"),
        sa.Column("source_run_id", sa.String(36), sa.ForeignKey("task_runs.id", ondelete="SET NULL"), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_open_questions_task_id", "open_questions", ["task_id"])

    op.create_table(
        "knowledge_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("body_markdown", sa.Text, nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="accepted"),
        sa.Column("number", sa.Integer, nullable=True),
        sa.Column("author_type", sa.String(50), nullable=False, server_default="human"),
        sa.Column("created_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_task_id", sa.String(36), sa.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_knowledge_entries_organization_id", "knowledge_entries", ["organization_id"])
    op.create_index("ix_knowledge_entries_project_id", "knowledge_entries", ["project_id"])

    op.add_column("tasks", sa.Column("acceptance_criteria", sa.JSON, nullable=True))
    op.add_column("tasks", sa.Column("external_source", sa.String(30), nullable=True))
    op.add_column("tasks", sa.Column("external_id", sa.String(200), nullable=True))
    op.add_column("tasks", sa.Column("external_url", sa.String(500), nullable=True))
    op.create_index("ix_tasks_external_id", "tasks", ["external_id"])

    op.add_column("workflows", sa.Column("template_key", sa.String(60), nullable=True))
    op.add_column("workflow_stages", sa.Column("role", sa.String(40), nullable=False, server_default="custom"))
    op.add_column("workflow_stages", sa.Column("block_on_open_questions", sa.Boolean, nullable=False,
                                               server_default=sa.false()))

    op.add_column("users", sa.Column("preferences", sa.JSON, nullable=True))
    op.add_column("organizations", sa.Column("appearance", sa.JSON, nullable=True))

    op.add_column("projects", sa.Column("issues_repo", sa.String(300), nullable=True))
    op.add_column("projects", sa.Column("post_issue_comments", sa.Boolean, nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("projects") as b:
        b.drop_column("post_issue_comments")
        b.drop_column("issues_repo")
    with op.batch_alter_table("organizations") as b:
        b.drop_column("appearance")
    with op.batch_alter_table("users") as b:
        b.drop_column("preferences")
    with op.batch_alter_table("workflow_stages") as b:
        b.drop_column("block_on_open_questions")
        b.drop_column("role")
    with op.batch_alter_table("workflows") as b:
        b.drop_column("template_key")
    op.drop_index("ix_tasks_external_id", table_name="tasks")
    with op.batch_alter_table("tasks") as b:
        b.drop_column("external_url")
        b.drop_column("external_id")
        b.drop_column("external_source")
        b.drop_column("acceptance_criteria")
    op.drop_table("knowledge_entries")
    op.drop_table("open_questions")
    op.drop_table("task_documents")
