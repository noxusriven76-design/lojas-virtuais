"""payments mvp data model phase 1

Revision ID: 0017_payments_mvp1
Revises: 0016_catalog_jobs_scale
Create Date: 2026-02-13
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0017_payments_mvp1"
down_revision = "0016_catalog_jobs_scale"
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
    if not _has_table("payment_transactions"):
        op.create_table(
            "payment_transactions",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("store_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
            sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=False),
            sa.Column("provider", sa.String(length=40), nullable=False),
            sa.Column("provider_payment_id", sa.String(length=120), nullable=True),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="pending"),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("currency", sa.String(length=8), nullable=False, server_default="BRL"),
            sa.Column("method", sa.String(length=40), nullable=True),
            sa.Column("paid_at", sa.DateTime(), nullable=True),
            sa.Column("refunded_amount", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
            sa.Column("raw_payload", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
    if _has_table("payment_transactions"):
        if not _has_index("payment_transactions", "ix_payment_transactions_id"):
            op.create_index("ix_payment_transactions_id", "payment_transactions", ["id"], unique=False)
        if not _has_index("payment_transactions", "ix_payment_transactions_store_id"):
            op.create_index("ix_payment_transactions_store_id", "payment_transactions", ["store_id"], unique=False)
        if not _has_index("payment_transactions", "ix_payment_transactions_order_id"):
            op.create_index("ix_payment_transactions_order_id", "payment_transactions", ["order_id"], unique=False)
        if not _has_index("payment_transactions", "ix_payment_transactions_provider"):
            op.create_index("ix_payment_transactions_provider", "payment_transactions", ["provider"], unique=False)
        if not _has_index("payment_transactions", "ix_payment_transactions_status"):
            op.create_index("ix_payment_transactions_status", "payment_transactions", ["status"], unique=False)
        if not _has_index("payment_transactions", "ix_payment_tx_store_order"):
            op.create_index("ix_payment_tx_store_order", "payment_transactions", ["store_id", "order_id"], unique=False)
        if not _has_index("payment_transactions", "ix_payment_tx_store_status_created"):
            op.create_index(
                "ix_payment_tx_store_status_created",
                "payment_transactions",
                ["store_id", "status", "created_at"],
                unique=False,
            )

    if not _has_table("payment_refunds"):
        op.create_table(
            "payment_refunds",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("store_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
            sa.Column("payment_transaction_id", sa.Integer(), sa.ForeignKey("payment_transactions.id"), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="requested"),
            sa.Column("provider_refund_id", sa.String(length=120), nullable=True),
            sa.Column("reason", sa.String(length=300), nullable=False, server_default=""),
            sa.Column("raw_payload", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
    if _has_table("payment_refunds"):
        if not _has_index("payment_refunds", "ix_payment_refunds_id"):
            op.create_index("ix_payment_refunds_id", "payment_refunds", ["id"], unique=False)
        if not _has_index("payment_refunds", "ix_payment_refunds_store_id"):
            op.create_index("ix_payment_refunds_store_id", "payment_refunds", ["store_id"], unique=False)
        if not _has_index("payment_refunds", "ix_payment_refunds_payment_transaction_id"):
            op.create_index(
                "ix_payment_refunds_payment_transaction_id",
                "payment_refunds",
                ["payment_transaction_id"],
                unique=False,
            )
        if not _has_index("payment_refunds", "ix_payment_refunds_status"):
            op.create_index("ix_payment_refunds_status", "payment_refunds", ["status"], unique=False)
        if not _has_index("payment_refunds", "ix_payment_refund_store_status_created"):
            op.create_index(
                "ix_payment_refund_store_status_created",
                "payment_refunds",
                ["store_id", "status", "created_at"],
                unique=False,
            )

    if not _has_table("payment_webhook_events"):
        op.create_table(
            "payment_webhook_events",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("store_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=True),
            sa.Column("provider", sa.String(length=40), nullable=False),
            sa.Column("event_id", sa.String(length=120), nullable=False),
            sa.Column("event_type", sa.String(length=80), nullable=False),
            sa.Column("signature_valid", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="received"),
            sa.Column("payload", sa.JSON(), nullable=False),
            sa.Column("error_message", sa.String(length=500), nullable=True),
            sa.Column("processed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("provider", "event_id", name="uq_payment_webhook_provider_event"),
        )
    if _has_table("payment_webhook_events"):
        if not _has_index("payment_webhook_events", "ix_payment_webhook_events_id"):
            op.create_index("ix_payment_webhook_events_id", "payment_webhook_events", ["id"], unique=False)
        if not _has_index("payment_webhook_events", "ix_payment_webhook_events_store_id"):
            op.create_index("ix_payment_webhook_events_store_id", "payment_webhook_events", ["store_id"], unique=False)
        if not _has_index("payment_webhook_events", "ix_payment_webhook_events_provider"):
            op.create_index("ix_payment_webhook_events_provider", "payment_webhook_events", ["provider"], unique=False)
        if not _has_index("payment_webhook_events", "ix_payment_webhook_events_event_type"):
            op.create_index("ix_payment_webhook_events_event_type", "payment_webhook_events", ["event_type"], unique=False)
        if not _has_index("payment_webhook_events", "ix_payment_webhook_events_status"):
            op.create_index("ix_payment_webhook_events_status", "payment_webhook_events", ["status"], unique=False)
        if not _has_index("payment_webhook_events", "ix_payment_webhook_store_status_created"):
            op.create_index(
                "ix_payment_webhook_store_status_created",
                "payment_webhook_events",
                ["store_id", "status", "created_at"],
                unique=False,
            )
        if not _has_unique("payment_webhook_events", "uq_payment_webhook_provider_event"):
            op.create_unique_constraint(
                "uq_payment_webhook_provider_event",
                "payment_webhook_events",
                ["provider", "event_id"],
            )


def downgrade() -> None:
    if _has_table("payment_webhook_events"):
        for index_name in [
            "ix_payment_webhook_store_status_created",
            "ix_payment_webhook_events_status",
            "ix_payment_webhook_events_event_type",
            "ix_payment_webhook_events_provider",
            "ix_payment_webhook_events_store_id",
            "ix_payment_webhook_events_id",
        ]:
            if _has_index("payment_webhook_events", index_name):
                op.drop_index(index_name, table_name="payment_webhook_events")
        if _has_unique("payment_webhook_events", "uq_payment_webhook_provider_event"):
            op.drop_constraint("uq_payment_webhook_provider_event", "payment_webhook_events", type_="unique")
        op.drop_table("payment_webhook_events")

    if _has_table("payment_refunds"):
        for index_name in [
            "ix_payment_refund_store_status_created",
            "ix_payment_refunds_status",
            "ix_payment_refunds_payment_transaction_id",
            "ix_payment_refunds_store_id",
            "ix_payment_refunds_id",
        ]:
            if _has_index("payment_refunds", index_name):
                op.drop_index(index_name, table_name="payment_refunds")
        op.drop_table("payment_refunds")

    if _has_table("payment_transactions"):
        for index_name in [
            "ix_payment_tx_store_status_created",
            "ix_payment_tx_store_order",
            "ix_payment_transactions_status",
            "ix_payment_transactions_provider",
            "ix_payment_transactions_order_id",
            "ix_payment_transactions_store_id",
            "ix_payment_transactions_id",
        ]:
            if _has_index("payment_transactions", index_name):
                op.drop_index(index_name, table_name="payment_transactions")
        op.drop_table("payment_transactions")
