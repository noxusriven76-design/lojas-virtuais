"""store payment methods phase 7

Revision ID: 0018_store_payment_methods
Revises: 0017_payments_mvp1
Create Date: 2026-02-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0018_store_payment_methods"
down_revision = "0017_payments_mvp1"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _has_index(table_name: str, index_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(index.get("name") == index_name for index in inspector.get_indexes(table_name))


def _has_unique(table_name: str, unique_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(item.get("name") == unique_name for item in inspector.get_unique_constraints(table_name))


def upgrade() -> None:
    if not _has_table("store_payment_methods"):
        op.create_table(
            "store_payment_methods",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("store_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
            sa.Column("code", sa.String(length=40), nullable=False),
            sa.Column("label", sa.String(length=120), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("min_amount", sa.Numeric(12, 2), nullable=True),
            sa.Column("max_amount", sa.Numeric(12, 2), nullable=True),
            sa.Column("installments_max", sa.Integer(), nullable=True),
            sa.Column("fee_percent", sa.Numeric(7, 4), nullable=True),
            sa.Column("settlement_days", sa.Integer(), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("store_id", "code", name="uq_store_payment_method_store_code"),
        )

    if _has_table("store_payment_methods"):
        if not _has_index("store_payment_methods", "ix_store_payment_methods_id"):
            op.create_index("ix_store_payment_methods_id", "store_payment_methods", ["id"], unique=False)
        if not _has_index("store_payment_methods", "ix_store_payment_methods_store_id"):
            op.create_index("ix_store_payment_methods_store_id", "store_payment_methods", ["store_id"], unique=False)
        if not _has_index("store_payment_methods", "ix_store_payment_methods_code"):
            op.create_index("ix_store_payment_methods_code", "store_payment_methods", ["code"], unique=False)
        if not _has_index("store_payment_methods", "ix_store_payment_methods_store_active_order"):
            op.create_index(
                "ix_store_payment_methods_store_active_order",
                "store_payment_methods",
                ["store_id", "is_active", "sort_order"],
                unique=False,
            )
        if not _has_unique("store_payment_methods", "uq_store_payment_method_store_code"):
            op.create_unique_constraint(
                "uq_store_payment_method_store_code",
                "store_payment_methods",
                ["store_id", "code"],
            )


def downgrade() -> None:
    if _has_table("store_payment_methods"):
        for index_name in [
            "ix_store_payment_methods_store_active_order",
            "ix_store_payment_methods_code",
            "ix_store_payment_methods_store_id",
            "ix_store_payment_methods_id",
        ]:
            if _has_index("store_payment_methods", index_name):
                op.drop_index(index_name, table_name="store_payment_methods")
        if _has_unique("store_payment_methods", "uq_store_payment_method_store_code"):
            op.drop_constraint("uq_store_payment_method_store_code", "store_payment_methods", type_="unique")
        op.drop_table("store_payment_methods")
