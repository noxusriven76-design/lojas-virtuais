"""add store_contents for banner/highlight/institutional texts

Revision ID: 0011_store_contents
Revises: 0010_store_logo_url
Create Date: 2026-02-04
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0011_store_contents"
down_revision = "0010_store_logo_url"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if _has_table("store_contents"):
        return

    op.create_table(
        "store_contents",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("store_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("banner_title", sa.String(length=180), nullable=False, server_default=""),
        sa.Column("banner_subtitle", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("banner_image_url", sa.String(length=500), nullable=True),
        sa.Column("highlight_title", sa.String(length=180), nullable=False, server_default=""),
        sa.Column("highlight_text", sa.Text(), nullable=False),
        sa.Column("institutional_text", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("store_id", name="uq_store_contents_store_id"),
    )
    op.create_index("ix_store_contents_id", "store_contents", ["id"], unique=False)
    op.create_index("ix_store_contents_store_id", "store_contents", ["store_id"], unique=False)


def downgrade() -> None:
    if not _has_table("store_contents"):
        return
    op.drop_index("ix_store_contents_store_id", table_name="store_contents")
    op.drop_index("ix_store_contents_id", table_name="store_contents")
    op.drop_table("store_contents")
