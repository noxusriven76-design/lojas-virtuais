"""ensure products.image_url for local uploads

Revision ID: 0009_product_image_url_uploads
Revises: 0008_category_hierarchy_fields
Create Date: 2026-02-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0009_product_image_url_uploads"
down_revision = "0008_category_hierarchy_fields"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = inspector.get_columns(table_name)
    return any(c["name"] == column_name for c in cols)


def upgrade() -> None:
    if not _has_column("products", "image_url"):
        op.add_column("products", sa.Column("image_url", sa.String(length=500), nullable=True))
        return

    op.alter_column("products", "image_url", existing_type=sa.String(length=500), nullable=True)


def downgrade() -> None:
    if _has_column("products", "image_url"):
        op.alter_column(
            "products",
            "image_url",
            existing_type=sa.String(length=500),
            nullable=False,
            server_default="",
        )
