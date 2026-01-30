"""initial

Revision ID: 0001_initial
Revises:
Create Date: 2026-01-20
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("is_superuser", sa.Boolean, nullable=False, server_default=sa.text("0")),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "stores",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("1")),
    )
    op.create_index("ix_stores_id", "stores", ["id"])
    op.create_index("ix_stores_slug", "stores", ["slug"], unique=True)

    op.create_table(
        "store_members",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("store_id", sa.Integer, sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="owner"),
        sa.UniqueConstraint("store_id", "user_id", name="uq_store_member"),
    )
    op.create_index("ix_store_members_id", "store_members", ["id"])
    op.create_index("ix_store_members_store_id", "store_members", ["store_id"])
    op.create_index("ix_store_members_user_id", "store_members", ["user_id"])

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("store_id", sa.Integer, sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
    )
    op.create_index("ix_categories_id", "categories", ["id"])
    op.create_index("ix_categories_store_id", "categories", ["store_id"])

    op.create_table(
        "products",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("store_id", sa.Integer, sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("category_id", sa.Integer, sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=False, server_default=""),
        sa.Column("image_url", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("base_price", sa.Float, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("1")),
    )
    op.create_index("ix_products_id", "products", ["id"])
    op.create_index("ix_products_store_id", "products", ["store_id"])
    op.create_index("ix_products_category_id", "products", ["category_id"])

    op.create_table(
        "product_variants",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("product_id", sa.Integer, sa.ForeignKey("products.id"), nullable=False),
        sa.Column("store_id", sa.Integer, sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("sku", sa.String(length=80), nullable=False),
        sa.Column("color", sa.String(length=50), nullable=False, server_default=""),
        sa.Column("size", sa.String(length=20), nullable=False, server_default=""),
        sa.Column("price", sa.Float, nullable=False),
        sa.Column("stock", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("1")),
        sa.UniqueConstraint("sku", name="uq_variant_sku"),
    )
    op.create_index("ix_product_variants_id", "product_variants", ["id"])
    op.create_index("ix_product_variants_product_id", "product_variants", ["product_id"])
    op.create_index("ix_product_variants_store_id", "product_variants", ["store_id"])

    op.create_table(
        "customers",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("store_id", sa.Integer, sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("name", sa.String(length=180), nullable=False, server_default=""),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=False, server_default=""),
    )
    op.create_index("ix_customers_id", "customers", ["id"])
    op.create_index("ix_customers_store_id", "customers", ["store_id"])
    op.create_index("ix_customers_user_id", "customers", ["user_id"])
    op.create_index("ix_customers_email", "customers", ["email"])

    op.create_table(
        "addresses",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("store_id", sa.Integer, sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("customer_id", sa.Integer, sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False, server_default="Casa"),
        sa.Column("recipient_name", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("phone", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("cep", sa.String(length=16), nullable=False),
        sa.Column("street", sa.String(length=180), nullable=False),
        sa.Column("number", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("complement", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("neighborhood", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("state", sa.String(length=10), nullable=False),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.text("0")),
    )
    op.create_index("ix_addresses_id", "addresses", ["id"])
    op.create_index("ix_addresses_store_id", "addresses", ["store_id"])
    op.create_index("ix_addresses_customer_id", "addresses", ["customer_id"])

    op.create_table(
        "favorites",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("store_id", sa.Integer, sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("customer_id", sa.Integer, sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("product_id", sa.Integer, sa.ForeignKey("products.id"), nullable=False),
        sa.UniqueConstraint("store_id", "customer_id", "product_id", name="uq_fav_store_customer_product"),
    )
    op.create_index("ix_favorites_id", "favorites", ["id"])
    op.create_index("ix_favorites_store_id", "favorites", ["store_id"])
    op.create_index("ix_favorites_customer_id", "favorites", ["customer_id"])
    op.create_index("ix_favorites_product_id", "favorites", ["product_id"])

    op.create_table(
        "orders",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("store_id", sa.Integer, sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("customer_id", sa.Integer, sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="created"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("shipping_service", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("shipping_price", sa.Float, nullable=False, server_default=sa.text("0")),
        sa.Column("shipping_eta_days", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("subtotal", sa.Float, nullable=False, server_default=sa.text("0")),
        sa.Column("discount", sa.Float, nullable=False, server_default=sa.text("0")),
        sa.Column("total", sa.Float, nullable=False, server_default=sa.text("0")),
        sa.Column("recipient_name", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("phone", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("cep", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("street", sa.String(length=180), nullable=False, server_default=""),
        sa.Column("number", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("complement", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("neighborhood", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("city", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("state", sa.String(length=10), nullable=False, server_default=""),
    )
    op.create_index("ix_orders_id", "orders", ["id"])
    op.create_index("ix_orders_store_id", "orders", ["store_id"])
    op.create_index("ix_orders_customer_id", "orders", ["customer_id"])

    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("order_id", sa.Integer, sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("store_id", sa.Integer, sa.ForeignKey("stores.id"), nullable=False),
        sa.Column("product_id", sa.Integer, sa.ForeignKey("products.id"), nullable=False),
        sa.Column("variant_id", sa.Integer, sa.ForeignKey("product_variants.id"), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("unit_price", sa.Float, nullable=False),
        sa.Column("line_total", sa.Float, nullable=False),
        sa.Column("product_name", sa.String(length=180), nullable=False, server_default=""),
        sa.Column("variant_label", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("image_url", sa.String(length=500), nullable=False, server_default=""),
    )
    op.create_index("ix_order_items_id", "order_items", ["id"])
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])
    op.create_index("ix_order_items_store_id", "order_items", ["store_id"])


def downgrade() -> None:
    op.drop_table("order_items")
    op.drop_table("orders")
    op.drop_table("favorites")
    op.drop_table("addresses")
    op.drop_table("customers")
    op.drop_table("product_variants")
    op.drop_table("products")
    op.drop_table("categories")
    op.drop_table("store_members")
    op.drop_table("stores")
    op.drop_table("users")
