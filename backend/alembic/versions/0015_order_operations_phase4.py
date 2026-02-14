"""order operations phase 4: timeline, notes and cancellation fields

Revision ID: 0015_order_operations_phase4
Revises: 0014_admin_audit_logs
Create Date: 2026-02-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0015_order_operations_phase4"
down_revision = "0014_admin_audit_logs"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(column.get("name") == column_name for column in inspector.get_columns(table_name))


def _has_index(table_name: str, index_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(index.get("name") == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    if _has_table("order_items") and not _has_column("order_items", "cancelled_quantity"):
        op.add_column(
            "order_items",
            sa.Column("cancelled_quantity", sa.Integer(), nullable=False, server_default="0"),
        )

    if not _has_table("order_events"):
        op.create_table(
            "order_events",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("store_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("event_type", sa.String(length=40), nullable=False),
            sa.Column("from_status", sa.String(length=30), nullable=True),
            sa.Column("to_status", sa.String(length=30), nullable=True),
            sa.Column("note", sa.String(length=1000), nullable=True),
            sa.Column("meta", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    if _has_table("order_events"):
        if not _has_index("order_events", "ix_order_events_id"):
            op.create_index("ix_order_events_id", "order_events", ["id"], unique=False)
        if not _has_index("order_events", "ix_order_events_store_id"):
            op.create_index("ix_order_events_store_id", "order_events", ["store_id"], unique=False)
        if not _has_index("order_events", "ix_order_events_order_id"):
            op.create_index("ix_order_events_order_id", "order_events", ["order_id"], unique=False)
        if not _has_index("order_events", "ix_order_events_user_id"):
            op.create_index("ix_order_events_user_id", "order_events", ["user_id"], unique=False)
        if not _has_index("order_events", "ix_order_events_event_type"):
            op.create_index("ix_order_events_event_type", "order_events", ["event_type"], unique=False)
        if not _has_index("order_events", "ix_order_events_store_order_created"):
            op.create_index(
                "ix_order_events_store_order_created",
                "order_events",
                ["store_id", "order_id", "created_at"],
                unique=False,
            )


def downgrade() -> None:
    if _has_table("order_events"):
        for idx in [
            "ix_order_events_store_order_created",
            "ix_order_events_event_type",
            "ix_order_events_user_id",
            "ix_order_events_order_id",
            "ix_order_events_store_id",
            "ix_order_events_id",
        ]:
            if _has_index("order_events", idx):
                op.drop_index(idx, table_name="order_events")
        op.drop_table("order_events")

    if _has_table("order_items") and _has_column("order_items", "cancelled_quantity"):
        op.drop_column("order_items", "cancelled_quantity")
