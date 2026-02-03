"""add stores.logo_url for uploaded store logo

Revision ID: 0010_store_logo_url
Revises: 0009_product_image_url_uploads
Create Date: 2026-02-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0010_store_logo_url"
down_revision = "0009_product_image_url_uploads"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = inspector.get_columns(table_name)
    return any(c["name"] == column_name for c in cols)


def upgrade() -> None:
    if not _has_column("stores", "logo_url"):
        op.add_column("stores", sa.Column("logo_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    if _has_column("stores", "logo_url"):
        op.drop_column("stores", "logo_url")
