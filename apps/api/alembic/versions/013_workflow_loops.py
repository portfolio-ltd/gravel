"""Loop engineering: named, bounded loops in workflows; runs record their loop pass

Revision ID: 013
Revises: 012
Create Date: 2026-11-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workflow_loops",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workflow_id", sa.String(36), sa.ForeignKey("workflows.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("goal", sa.Text(), nullable=True),
        sa.Column("entry_stage_id", sa.String(36), sa.ForeignKey("workflow_stages.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("check_stage_id", sa.String(36), sa.ForeignKey("workflow_stages.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("max_iterations", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("max_cost_usd", sa.Float(), nullable=True),
        sa.Column("on_exhausted", sa.String(20), nullable=False, server_default="ask_human"),
        sa.Column("carry_feedback", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workflow_id", "check_stage_id", name="uq_workflow_loops_check"),
    )
    op.create_index("ix_workflow_loops_workflow_id", "workflow_loops", ["workflow_id"])
    with op.batch_alter_table("task_runs") as b:
        b.add_column(sa.Column("loop_id", sa.String(36), nullable=True))
        b.add_column(sa.Column("loop_iteration", sa.Integer(), nullable=True))
        b.create_index("ix_task_runs_loop_id", ["loop_id"])


def downgrade() -> None:
    with op.batch_alter_table("task_runs") as b:
        b.drop_index("ix_task_runs_loop_id")
        b.drop_column("loop_iteration")
        b.drop_column("loop_id")
    op.drop_index("ix_workflow_loops_workflow_id", table_name="workflow_loops")
    op.drop_table("workflow_loops")
