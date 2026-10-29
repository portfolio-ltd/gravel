"""Agent harnesses, knowledge map (slugs, wiki pages, parents) and external links

Revision ID: 010
Revises: 009
Create Date: 2026-10-29
"""
import re
import unicodedata
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:180] or "entry"


def upgrade() -> None:
    op.create_table(
        "agent_harnesses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("template_key", sa.String(60), nullable=True),
        sa.Column("executor", sa.String(20), nullable=False, server_default="any"),
        sa.Column("roles", sa.JSON, nullable=True),
        sa.Column("agents", sa.JSON, nullable=True),
        sa.Column("routing", sa.JSON, nullable=True),
        sa.Column("instructions_markdown", sa.Text, nullable=True),
        sa.Column("test_gate", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("max_review_rounds", sa.Integer, nullable=False, server_default="2"),
        sa.Column("max_turns", sa.Integer, nullable=False, server_default="0"),
        sa.Column("allowed_tools", sa.JSON, nullable=True),
        sa.Column("disallowed_tools", sa.JSON, nullable=True),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    with op.batch_alter_table("workflow_stages") as b:
        b.add_column(sa.Column("harness_id", sa.String(36), nullable=True))
        b.create_foreign_key("fk_stage_harness", "agent_harnesses", ["harness_id"], ["id"], ondelete="SET NULL")
    with op.batch_alter_table("task_runs") as b:
        b.add_column(sa.Column("harness_id", sa.String(36), nullable=True))
        b.create_foreign_key("fk_run_harness", "agent_harnesses", ["harness_id"], ["id"], ondelete="SET NULL")

    with op.batch_alter_table("knowledge_entries") as b:
        b.add_column(sa.Column("slug", sa.String(200), nullable=True))
        b.add_column(sa.Column("parent_id", sa.String(36), nullable=True))
        b.create_index("ix_knowledge_entries_slug", ["slug"])
        b.create_foreign_key("fk_knowledge_parent", "knowledge_entries", ["parent_id"], ["id"], ondelete="SET NULL")

    op.create_table(
        "external_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("entity_id", sa.String(36), nullable=False, index=True),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False, server_default="other"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Backfill slugs so existing entries can be linked to right away
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, organization_id, title FROM knowledge_entries ORDER BY created_at"
    )).fetchall()
    taken: dict[str, set[str]] = {}
    for entry_id, org_id, title in rows:
        base = _slugify(title or "")
        slug, n = base, 2
        used = taken.setdefault(org_id, set())
        while slug in used:
            slug, n = f"{base}-{n}", n + 1
        used.add(slug)
        conn.execute(sa.text("UPDATE knowledge_entries SET slug = :slug WHERE id = :id"),
                     {"slug": slug, "id": entry_id})


def downgrade() -> None:
    op.drop_table("external_links")
    with op.batch_alter_table("knowledge_entries") as b:
        b.drop_constraint("fk_knowledge_parent", type_="foreignkey")
        b.drop_index("ix_knowledge_entries_slug")
        b.drop_column("parent_id")
        b.drop_column("slug")
    with op.batch_alter_table("task_runs") as b:
        b.drop_constraint("fk_run_harness", type_="foreignkey")
        b.drop_column("harness_id")
    with op.batch_alter_table("workflow_stages") as b:
        b.drop_constraint("fk_stage_harness", type_="foreignkey")
        b.drop_column("harness_id")
    op.drop_table("agent_harnesses")
