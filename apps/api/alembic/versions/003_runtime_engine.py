"""Runtime engine: integrations tables, repo fields, approval gates, runtime tokens

Revision ID: 003
Revises: 002
Create Date: 2026-08-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Integrations tables were previously created only by create_all()
    op.create_table(
        "git_integrations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(36), nullable=False, index=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("base_url", sa.String(500), nullable=True),
        sa.Column("access_token_encrypted", sa.String(2000), nullable=True),
        sa.Column("default_branch", sa.String(100), nullable=False, server_default="main"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "deploy_environments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(36), nullable=False, index=True),
        sa.Column("project_id", sa.String(36), nullable=True, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("region", sa.String(100), nullable=True),
        sa.Column("config_encrypted", sa.String(4000), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.add_column("projects", sa.Column("repo_url", sa.String(500), nullable=True))
    op.add_column("projects", sa.Column("default_branch", sa.String(100), nullable=False, server_default="main"))

    op.add_column("tasks", sa.Column("branch_name", sa.String(255), nullable=True))
    op.add_column("tasks", sa.Column("pr_url", sa.String(500), nullable=True))
    op.add_column("tasks", sa.Column("deploy_url", sa.String(500), nullable=True))

    op.add_column("engineers", sa.Column("model_provider", sa.String(50), nullable=False, server_default="anthropic"))
    op.add_column("engineers", sa.Column("model_name", sa.String(100), nullable=False, server_default="claude-sonnet-4-6"))

    op.add_column("engineer_runtimes", sa.Column("container_name", sa.String(200), nullable=True))
    op.add_column("engineer_runtimes", sa.Column("status_message", sa.String(500), nullable=True))
    op.add_column("engineer_runtimes", sa.Column("runtime_token_hash", sa.String(64), nullable=True))
    op.add_column("engineer_runtimes", sa.Column("current_task_run_id", sa.String(36), nullable=True))
    op.create_index("ix_eng_runtimes_token", "engineer_runtimes", ["runtime_token_hash"])

    op.add_column("task_runs", sa.Column("summary", sa.Text, nullable=True))
    op.add_column("task_runs", sa.Column("approval_required", sa.Boolean, nullable=False, server_default="0"))
    op.add_column("task_runs", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("task_runs", sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("task_runs", "claimed_at")
    op.drop_column("task_runs", "approved_at")
    op.drop_column("task_runs", "approval_required")
    op.drop_column("task_runs", "summary")
    op.drop_index("ix_eng_runtimes_token", table_name="engineer_runtimes")
    op.drop_column("engineer_runtimes", "current_task_run_id")
    op.drop_column("engineer_runtimes", "runtime_token_hash")
    op.drop_column("engineer_runtimes", "status_message")
    op.drop_column("engineer_runtimes", "container_name")
    op.drop_column("engineers", "model_name")
    op.drop_column("engineers", "model_provider")
    op.drop_column("tasks", "deploy_url")
    op.drop_column("tasks", "pr_url")
    op.drop_column("tasks", "branch_name")
    op.drop_column("projects", "default_branch")
    op.drop_column("projects", "repo_url")
    op.drop_table("deploy_environments")
    op.drop_table("git_integrations")
