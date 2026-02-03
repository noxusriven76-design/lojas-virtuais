"""use users instead of customers

Revision ID: 0007_users_instead_of_customers
Revises: 0006_tenant_indexes_constraints
Create Date: 2026-01-31

This migration aligns the DB with the product definition:
- "Clientes cadastrados" = users (global, no store_id)
- Tenant entities reference (store_id, user_id) instead of an extra customers table.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0007_users_instead_of_customers"
down_revision = "0006_tenant_indexes_constraints"
branch_labels = None
depends_on = None


def _dialect_name() -> str:
    return op.get_bind().dialect.name


def _mysql_drop_fk(table: str, column: str) -> None:
    """Drop all FK constraints that reference `column` in `table` (MySQL only).

    Alembic won't know auto-generated FK constraint names. We discover them at runtime
    via information_schema.KEY_COLUMN_USAGE.
    """

    if _dialect_name() != "mysql":
        return

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT CONSTRAINT_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = :table
              AND COLUMN_NAME = :col
              AND REFERENCED_TABLE_NAME IS NOT NULL
            """
        ),
        {"table": table, "col": column},
    ).fetchall()

    for (fk_name,) in rows:
        op.execute(sa.text(f"ALTER TABLE `{table}` DROP FOREIGN KEY `{fk_name}`"))


def upgrade() -> None:
    dialect = _dialect_name()

    # 1) Add new user_id columns (nullable first) and backfill from customers.user_id
    op.add_column("addresses", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("favorites", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("coupon_redemptions", sa.Column("user_id", sa.Integer(), nullable=True))

    # Indexes to keep backfill/update performant.
    op.create_index("ix_addresses_user_id", "addresses", ["user_id"])
    op.create_index("ix_favorites_user_id", "favorites", ["user_id"])
    op.create_index("ix_orders_user_id", "orders", ["user_id"])
    op.create_index("ix_coupon_redemptions_user_id", "coupon_redemptions", ["user_id"])

    # Backfill (MySQL). For other dialects, best-effort no-op.
    if dialect == "mysql":
        op.execute(
            sa.text(
                """
                UPDATE addresses a
                JOIN customers c ON c.id = a.customer_id
                SET a.user_id = c.user_id
                WHERE a.user_id IS NULL
                """
            )
        )
        op.execute(
            sa.text(
                """
                UPDATE favorites f
                JOIN customers c ON c.id = f.customer_id
                SET f.user_id = c.user_id
                WHERE f.user_id IS NULL
                """
            )
        )
        op.execute(
            sa.text(
                """
                UPDATE orders o
                JOIN customers c ON c.id = o.customer_id
                SET o.user_id = c.user_id
                WHERE o.user_id IS NULL
                """
            )
        )
        op.execute(
            sa.text(
                """
                UPDATE coupon_redemptions r
                JOIN customers c ON c.id = r.customer_id
                SET r.user_id = c.user_id
                WHERE r.user_id IS NULL
                """
            )
        )

        # Remove orphan rows that cannot be mapped to a user (customers.user_id IS NULL)
        op.execute(sa.text("DELETE FROM coupon_redemptions WHERE user_id IS NULL"))
        op.execute(sa.text("DELETE FROM favorites WHERE user_id IS NULL"))
        op.execute(sa.text("DELETE FROM addresses WHERE user_id IS NULL"))
        op.execute(sa.text("DELETE FROM orders WHERE user_id IS NULL"))

    # 2) Create foreign keys from *_user_id -> users.id
    op.create_foreign_key("fk_addresses_user_id", "addresses", "users", ["user_id"], ["id"])
    op.create_foreign_key("fk_favorites_user_id", "favorites", "users", ["user_id"], ["id"])
    op.create_foreign_key("fk_orders_user_id", "orders", "users", ["user_id"], ["id"])
    op.create_foreign_key(
        "fk_coupon_redemptions_user_id",
        "coupon_redemptions",
        "users",
        ["user_id"],
        ["id"],
    )

    # 3) Rebuild uniques/indexes that referenced customer_id
    # favorites: unique (store_id, user_id, product_id)
    op.drop_constraint("uq_fav_store_customer_product", "favorites", type_="unique")
    op.create_unique_constraint("uq_fav_store_user_product", "favorites", ["store_id", "user_id", "product_id"])

    # coupon_redemptions: indexes are recreated to match new column names.
    op.drop_index("ix_coupon_redemptions_coupon_customer", table_name="coupon_redemptions")
    op.drop_index("ix_coupon_redemptions_store_customer", table_name="coupon_redemptions")
    op.create_index("ix_coupon_redemptions_coupon_user", "coupon_redemptions", ["coupon_id", "user_id"])
    op.create_index("ix_coupon_redemptions_store_user", "coupon_redemptions", ["store_id", "user_id"])

    # orders: drop old composite index and recreate with user_id
    op.drop_index("ix_orders_store_customer_created", table_name="orders")
    op.create_index("ix_orders_store_user_created", "orders", ["store_id", "user_id", "created_at"])

    # addresses: index name change (composite)
    op.drop_index("ix_addresses_store_customer", table_name="addresses")
    op.create_index("ix_addresses_store_user", "addresses", ["store_id", "user_id"])

    # 4) Drop old customer_id columns and FKs (MySQL: discover FK names)
    _mysql_drop_fk("coupon_redemptions", "customer_id")
    _mysql_drop_fk("favorites", "customer_id")
    _mysql_drop_fk("addresses", "customer_id")
    _mysql_drop_fk("orders", "customer_id")

    op.drop_index("ix_coupon_redemptions_customer_id", table_name="coupon_redemptions")
    op.drop_column("coupon_redemptions", "customer_id")

    op.drop_index("ix_favorites_customer_id", table_name="favorites")
    op.drop_column("favorites", "customer_id")

    op.drop_index("ix_addresses_customer_id", table_name="addresses")
    op.drop_column("addresses", "customer_id")

    op.drop_index("ix_orders_customer_id", table_name="orders")
    op.drop_column("orders", "customer_id")

    # 5) Drop customers table (after all refs removed)
    op.drop_index("ix_customers_store_user", table_name="customers")
    op.drop_index("ix_customers_store_email", table_name="customers")
    op.drop_index("ix_customers_user_id", table_name="customers")
    op.drop_index("ix_customers_email", table_name="customers")
    op.drop_index("ix_customers_store_id", table_name="customers")
    op.drop_index("ix_customers_id", table_name="customers")
    op.drop_table("customers")

    # 6) Enforce NOT NULL on new user_id columns
    op.alter_column("addresses", "user_id", nullable=False)
    op.alter_column("favorites", "user_id", nullable=False)
    op.alter_column("orders", "user_id", nullable=False)
    op.alter_column("coupon_redemptions", "user_id", nullable=False)


def downgrade() -> None:
    raise RuntimeError("Downgrade not supported for 0007_users_instead_of_customers")
