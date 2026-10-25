"""Custom workflows: stage builder tables, project/task/run stage columns

Revision ID: 004
Revises: 003
Create Date: 2026-08-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workflows",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(36), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("owner_id", "name", name="uq_workflows_owner_name"),
    )

    op.create_table(
        "workflow_stages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workflow_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("stage_order", sa.Integer, nullable=False),
        sa.Column("assigned_engineer_id", sa.String(36), nullable=True),
        sa.Column("requires_human_approval", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("is_ai_executable", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("stage_instructions", sa.Text, nullable=True),
        sa.Column("max_rework_attempts", sa.Integer, nullable=False, server_default="3"),
        sa.Column("rework_target_stage_id", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_workflow_stages_workflow", "workflow_stages", ["workflow_id"])

    op.add_column("projects", sa.Column("workflow_id", sa.String(36), nullable=True))

    op.add_column("tasks", sa.Column("workflow_stage_id", sa.String(36), nullable=True))
    op.create_index("ix_tasks_workflow_stage", "tasks", ["workflow_stage_id"])
    op.add_column("tasks", sa.Column("rework_count", sa.Integer, nullable=False, server_default="0"))

    op.add_column("task_runs", sa.Column("workflow_stage_id", sa.String(36), nullable=True))
    op.create_index("ix_task_runs_workflow_stage", "task_runs", ["workflow_stage_id"])
    op.add_column("task_runs", sa.Column("attempt_number", sa.Integer, nullable=False, server_default="1"))


def downgrade() -> None:
    op.drop_column("task_runs", "attempt_number")
    op.drop_index("ix_task_runs_workflow_stage", table_name="task_runs")
    op.drop_column("task_runs", "workflow_stage_id")
    op.drop_column("tasks", "rework_count")
    op.drop_index("ix_tasks_workflow_stage", table_name="tasks")
    op.drop_column("tasks", "workflow_stage_id")
    op.drop_column("projects", "workflow_id")
    op.drop_index("ix_workflow_stages_workflow", table_name="workflow_stages")
    op.drop_table("workflow_stages")
    op.drop_table("workflows")
