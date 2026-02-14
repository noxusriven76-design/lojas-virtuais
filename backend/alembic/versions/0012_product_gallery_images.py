"""add product_images table for multi-image gallery

Revision ID: 0012_product_gallery_images
Revises: 0011_store_contents
Create Date: 2026-02-04
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0012_product_gallery_images"
down_revision = "0011_store_contents"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _has_index(table_name: str, index_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = inspector.get_indexes(table_name)
    return any(index.get("name") == index_name for index in indexes)


def upgrade() -> None:
    if not _has_table("product_images"):
        op.create_table(
            "product_images",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("store_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
            sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
            sa.Column("image_url", sa.String(length=500), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_cover", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
        op.create_index("ix_product_images_id", "product_images", ["id"], unique=False)
        op.create_index("ix_product_images_store_product", "product_images", ["store_id", "product_id"], unique=False)
        op.create_index("ix_product_images_store_cover", "product_images", ["store_id", "is_cover"], unique=False)

    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.execute(
            """
            INSERT INTO product_images (store_id, product_id, image_url, sort_order, is_cover)
            SELECT p.store_id, p.id, p.image_url, 0, 1
            FROM products p
            WHERE p.image_url IS NOT NULL
              AND p.image_url <> ''
              AND NOT EXISTS (
                SELECT 1
                FROM product_images pi
                WHERE pi.product_id = p.id
              )
            """
        )
    else:
        op.execute(
            """
            INSERT INTO product_images (store_id, product_id, image_url, sort_order, is_cover)
            SELECT p.store_id, p.id, p.image_url, 0, 1
            FROM products p
            WHERE p.image_url IS NOT NULL
              AND p.image_url <> ''
              AND NOT EXISTS (
                SELECT 1
                FROM product_images pi
                WHERE pi.product_id = p.id
              )
            """
        )


def downgrade() -> None:
    if not _has_table("product_images"):
        return
    if _has_index("product_images", "ix_product_images_store_cover"):
        op.drop_index("ix_product_images_store_cover", table_name="product_images")
    if _has_index("product_images", "ix_product_images_store_product"):
        op.drop_index("ix_product_images_store_product", table_name="product_images")
    if _has_index("product_images", "ix_product_images_id"):
        op.drop_index("ix_product_images_id", table_name="product_images")
    op.drop_table("product_images")
