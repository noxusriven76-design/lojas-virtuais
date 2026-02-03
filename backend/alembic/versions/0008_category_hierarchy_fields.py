"""add category hierarchy/admin fields

Revision ID: 0008_category_hierarchy_fields
Revises: 0007_users_instead_of_customers
Create Date: 2026-02-03
"""

from alembic import op
import sqlalchemy as sa


revision = "0008_category_hierarchy_fields"
down_revision = "0007_users_instead_of_customers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("parent_id", sa.Integer(), nullable=True))
    op.add_column("categories", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")))
    op.add_column("categories", sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")))

    op.create_foreign_key(
        "fk_categories_parent_id_categories",
        "categories",
        "categories",
        ["parent_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])
    op.create_index("ix_categories_store_parent", "categories", ["store_id", "parent_id"])

    op.alter_column("categories", "is_active", server_default=None)
    op.alter_column("categories", "sort_order", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_categories_store_parent", table_name="categories")
    op.drop_index("ix_categories_parent_id", table_name="categories")
    op.drop_constraint("fk_categories_parent_id_categories", "categories", type_="foreignkey")

    op.drop_column("categories", "sort_order")
    op.drop_column("categories", "is_active")
    op.drop_column("categories", "parent_id")
