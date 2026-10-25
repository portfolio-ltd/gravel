"""Per-stage model selection: workflow_stages.model

Revision ID: 008
Revises: 007
Create Date: 2026-10-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NULL = inherit (engineer → project → DEFAULT_MODEL), so existing stages are unchanged
    op.add_column("workflow_stages", sa.Column("model", sa.String(100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("workflow_stages") as b:
        b.drop_column("model")
