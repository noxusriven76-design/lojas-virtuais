"""add coupons and redemptions

Revision ID: 0003_coupons
Revises: 0002_money_decimal
Create Date: 2026-01-29

Adds:
- coupons: stores discount rules
- coupon_redemptions: usage tracking (total/per-user limits)
- orders: coupon_id + coupon_code snapshot
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_coupons"
down_revision = "0002_money_decimal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coupons",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("store_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("percent", sa.Numeric(5, 2), nullable=False, server_default="0.00"),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("usage_limit_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("usage_limit_per_user", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            server_onupdate=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("store_id", "code", name="uq_coupons_store_code"),
    )
    op.create_index("ix_coupons_store_active", "coupons", ["store_id", "active"])
    op.create_index(op.f("ix_coupons_store_id"), "coupons", ["store_id"])
    op.create_index(op.f("ix_coupons_id"), "coupons", ["id"])

    op.create_table(
        "coupon_redemptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("store_id", sa.Integer(), sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("coupon_id", sa.Integer(), sa.ForeignKey("coupons.id"), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id"), nullable=True),
        sa.Column("redeemed_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("subtotal", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column("discount_amount", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
    )
    op.create_index(op.f("ix_coupon_redemptions_id"), "coupon_redemptions", ["id"])
    op.create_index(op.f("ix_coupon_redemptions_store_id"), "coupon_redemptions", ["store_id"])
    op.create_index(op.f("ix_coupon_redemptions_coupon_id"), "coupon_redemptions", ["coupon_id"])
    op.create_index(op.f("ix_coupon_redemptions_customer_id"), "coupon_redemptions", ["customer_id"])
    op.create_index("ix_coupon_redemptions_coupon_customer", "coupon_redemptions", ["coupon_id", "customer_id"])
    op.create_index("ix_coupon_redemptions_order", "coupon_redemptions", ["order_id"])

    op.add_column("orders", sa.Column("coupon_id", sa.Integer(), sa.ForeignKey("coupons.id"), nullable=True))
    op.add_column("orders", sa.Column("coupon_code", sa.String(length=40), nullable=False, server_default=""))
    op.create_index(op.f("ix_orders_coupon_id"), "orders", ["coupon_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_orders_coupon_id"), table_name="orders")
    op.drop_column("orders", "coupon_code")
    op.drop_column("orders", "coupon_id")

    op.drop_index("ix_coupon_redemptions_order", table_name="coupon_redemptions")
    op.drop_index("ix_coupon_redemptions_coupon_customer", table_name="coupon_redemptions")
    op.drop_index(op.f("ix_coupon_redemptions_customer_id"), table_name="coupon_redemptions")
    op.drop_index(op.f("ix_coupon_redemptions_coupon_id"), table_name="coupon_redemptions")
    op.drop_index(op.f("ix_coupon_redemptions_store_id"), table_name="coupon_redemptions")
    op.drop_index(op.f("ix_coupon_redemptions_id"), table_name="coupon_redemptions")
    op.drop_table("coupon_redemptions")

    op.drop_index(op.f("ix_coupons_id"), table_name="coupons")
    op.drop_index(op.f("ix_coupons_store_id"), table_name="coupons")
    op.drop_index("ix_coupons_store_active", table_name="coupons")
    op.drop_table("coupons")
