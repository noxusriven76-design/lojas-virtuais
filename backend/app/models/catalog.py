from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Category(Base):
    __tablename__ = "categories"

    __table_args__ = (
        Index("ix_categories_store_name", "store_id", "name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)

    name: Mapped[str] = mapped_column(String(80), nullable=False)


class Product(Base):
    __tablename__ = "products"

    __table_args__ = (
        Index("ix_products_store_category", "store_id", "category_id"),
        Index("ix_products_store_active", "store_id", "is_active"),
        Index("ix_products_store_name", "store_id", "name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("categories.id"), index=True, nullable=False)

    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(String(2000), default="", nullable=False)
    image_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)

    # Monetary value: avoid float rounding issues.
    base_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    variants = relationship("ProductVariant", cascade="all, delete-orphan")


class ProductVariant(Base):
    __tablename__ = "product_variants"

    __table_args__ = (
        # SKU must be unique per store (multi-tenant).
        UniqueConstraint("store_id", "sku", name="uq_product_variants_store_sku"),
        Index("ix_product_variants_store_product", "store_id", "product_id"),
        Index("ix_product_variants_store_active", "store_id", "active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), index=True, nullable=False)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)

    sku: Mapped[str] = mapped_column(String(80), nullable=False)
    color: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    size: Mapped[str] = mapped_column(String(20), default="", nullable=False)

    # Monetary value: avoid float rounding issues.
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
