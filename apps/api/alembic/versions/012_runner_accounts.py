"""Runner accounts: label local runners by the AI account they use, pin projects to one

Revision ID: 012
Revises: 011
Create Date: 2026-11-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("engineer_runtimes") as b:
        b.add_column(sa.Column("account_label", sa.String(100), nullable=True))
    with op.batch_alter_table("projects") as b:
        b.add_column(sa.Column("runner_account", sa.String(100), nullable=True))
    with op.batch_alter_table("task_runs") as b:
        b.add_column(sa.Column("runner_account", sa.String(100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("task_runs") as b:
        b.drop_column("runner_account")
    with op.batch_alter_table("projects") as b:
        b.drop_column("runner_account")
    with op.batch_alter_table("engineer_runtimes") as b:
        b.drop_column("account_label")
