"""money fields -> DECIMAL(10,2)

Revision ID: 0002_money_decimal
Revises: 0001_initial
Create Date: 2026-01-27

We previously stored monetary values using FLOAT, which can introduce rounding
errors. This migration switches those columns to a fixed-precision numeric
type (DECIMAL/NUMERIC).
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_money_decimal"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use batch operations for better compatibility (e.g., SQLite in dev/tests).
    with op.batch_alter_table("products") as batch:
        batch.alter_column(
            "base_price",
            existing_type=sa.Float(),
            type_=sa.Numeric(10, 2),
            existing_nullable=False,
        )

    with op.batch_alter_table("product_variants") as batch:
        batch.alter_column(
            "price",
            existing_type=sa.Float(),
            type_=sa.Numeric(10, 2),
            existing_nullable=False,
        )

    with op.batch_alter_table("orders") as batch:
        for col in ("shipping_price", "subtotal", "discount", "total"):
            batch.alter_column(
                col,
                existing_type=sa.Float(),
                type_=sa.Numeric(10, 2),
                existing_nullable=False,
            )

    with op.batch_alter_table("order_items") as batch:
        for col in ("unit_price", "line_total"):
            batch.alter_column(
                col,
                existing_type=sa.Float(),
                type_=sa.Numeric(10, 2),
                existing_nullable=False,
            )


def downgrade() -> None:
    with op.batch_alter_table("order_items") as batch:
        for col in ("unit_price", "line_total"):
            batch.alter_column(
                col,
                existing_type=sa.Numeric(10, 2),
                type_=sa.Float(),
                existing_nullable=False,
            )

    with op.batch_alter_table("orders") as batch:
        for col in ("shipping_price", "subtotal", "discount", "total"):
            batch.alter_column(
                col,
                existing_type=sa.Numeric(10, 2),
                type_=sa.Float(),
                existing_nullable=False,
            )

    with op.batch_alter_table("product_variants") as batch:
        batch.alter_column(
            "price",
            existing_type=sa.Numeric(10, 2),
            type_=sa.Float(),
            existing_nullable=False,
        )

    with op.batch_alter_table("products") as batch:
        batch.alter_column(
            "base_price",
            existing_type=sa.Numeric(10, 2),
            type_=sa.Float(),
            existing_nullable=False,
        )
