"""multi-tenant indexes + constraints hardening

Revision ID: 0006_tenant_indexes_constraints
Revises: 0005_seed_core_stores
Create Date: 2026-01-30

Goals:
- Add composite indexes scoped by store_id for better performance.
- Ensure per-store uniqueness where required (e.g. SKU).
- Ensure every store-scoped table has store_id NOT NULL (support_messages).
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_tenant_indexes_constraints"
down_revision = "0005_seed_core_stores"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Uniques scoped by store_id ---
    # ProductVariant: SKU must be unique per store (not globally).
    op.drop_constraint("uq_variant_sku", "product_variants", type_="unique")
    op.create_unique_constraint(
        "uq_product_variants_store_sku",
        "product_variants",
        ["store_id", "sku"],
    )

    # --- Composite indexes by store_id ---
    # Catalog
    op.create_index("ix_categories_store_name", "categories", ["store_id", "name"])
    op.create_index("ix_products_store_category", "products", ["store_id", "category_id"])
    op.create_index("ix_products_store_active", "products", ["store_id", "is_active"])
    op.create_index("ix_products_store_name", "products", ["store_id", "name"])
    op.create_index("ix_product_variants_store_product", "product_variants", ["store_id", "product_id"])
    op.create_index("ix_product_variants_store_active", "product_variants", ["store_id", "active"])

    # Customers + addresses
    op.create_index("ix_customers_store_email", "customers", ["store_id", "email"])
    op.create_index("ix_customers_store_user", "customers", ["store_id", "user_id"])
    op.create_index("ix_addresses_store_customer", "addresses", ["store_id", "customer_id"])
    op.create_index("ix_addresses_store_default", "addresses", ["store_id", "is_default"])

    # Favorites
    op.create_index("ix_favorites_store_customer", "favorites", ["store_id", "customer_id"])
    op.create_index("ix_favorites_store_product", "favorites", ["store_id", "product_id"])

    # Orders
    op.create_index("ix_orders_store_customer_created", "orders", ["store_id", "customer_id", "created_at"])
    op.create_index("ix_orders_store_status_created", "orders", ["store_id", "status", "created_at"])

    # Order items
    op.create_index("ix_order_items_store_order", "order_items", ["store_id", "order_id"])
    op.create_index("ix_order_items_store_product", "order_items", ["store_id", "product_id"])
    op.create_index("ix_order_items_store_variant", "order_items", ["store_id", "variant_id"])

    # Coupon redemptions
    op.create_index("ix_coupon_redemptions_store_customer", "coupon_redemptions", ["store_id", "customer_id"])
    op.create_index("ix_coupon_redemptions_store_coupon", "coupon_redemptions", ["store_id", "coupon_id"])

    # --- support_messages: add store_id (NOT NULL) + FK + indexes ---
    op.add_column("support_messages", sa.Column("store_id", sa.Integer(), nullable=True))
    op.create_index("ix_support_messages_store_id", "support_messages", ["store_id"])

    conn = op.get_bind()
    # Backfill from conversations (tenant source of truth).
    conn.execute(
        sa.text(
            """
            UPDATE support_messages sm
            JOIN support_conversations sc ON sc.id = sm.conversation_id
            SET sm.store_id = sc.store_id
            WHERE sm.store_id IS NULL
            """
        )
    )

    # Enforce NOT NULL now that existing rows are populated.
    op.alter_column("support_messages", "store_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key(
        "fk_support_messages_store",
        "support_messages",
        "stores",
        ["store_id"],
        ["id"],
    )

    op.create_index(
        "ix_support_messages_store_conversation_created",
        "support_messages",
        ["store_id", "conversation_id", "created_at"],
    )
    op.create_index(
        "ix_support_messages_store_sender",
        "support_messages",
        ["store_id", "sender_user_id"],
    )


def downgrade() -> None:
    # support_messages
    op.drop_index("ix_support_messages_store_sender", table_name="support_messages")
    op.drop_index("ix_support_messages_store_conversation_created", table_name="support_messages")
    op.drop_constraint("fk_support_messages_store", "support_messages", type_="foreignkey")
    op.drop_index("ix_support_messages_store_id", table_name="support_messages")
    op.drop_column("support_messages", "store_id")

    # coupon_redemptions
    op.drop_index("ix_coupon_redemptions_store_coupon", table_name="coupon_redemptions")
    op.drop_index("ix_coupon_redemptions_store_customer", table_name="coupon_redemptions")

    # order_items
    op.drop_index("ix_order_items_store_variant", table_name="order_items")
    op.drop_index("ix_order_items_store_product", table_name="order_items")
    op.drop_index("ix_order_items_store_order", table_name="order_items")

    # orders
    op.drop_index("ix_orders_store_status_created", table_name="orders")
    op.drop_index("ix_orders_store_customer_created", table_name="orders")

    # favorites
    op.drop_index("ix_favorites_store_product", table_name="favorites")
    op.drop_index("ix_favorites_store_customer", table_name="favorites")

    # addresses + customers
    op.drop_index("ix_addresses_store_default", table_name="addresses")
    op.drop_index("ix_addresses_store_customer", table_name="addresses")
    op.drop_index("ix_customers_store_user", table_name="customers")
    op.drop_index("ix_customers_store_email", table_name="customers")

    # catalog
    op.drop_index("ix_product_variants_store_active", table_name="product_variants")
    op.drop_index("ix_product_variants_store_product", table_name="product_variants")
    op.drop_index("ix_products_store_name", table_name="products")
    op.drop_index("ix_products_store_active", table_name="products")
    op.drop_index("ix_products_store_category", table_name="products")
    op.drop_index("ix_categories_store_name", table_name="categories")

    # uniques
    op.drop_constraint("uq_product_variants_store_sku", "product_variants", type_="unique")
    op.create_unique_constraint("uq_variant_sku", "product_variants", ["sku"])
