from __future__ import annotations

from decimal import Decimal
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Order(Base):
    __tablename__ = "orders"

    __table_args__ = (
        # Order listing/filtering is store-scoped.
        Index("ix_orders_store_user_created", "store_id", "user_id", "created_at"),
        Index("ix_orders_store_status_created", "store_id", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)
    # "cliente" = user do sistema (global)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    coupon_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("coupons.id"), index=True, nullable=True)
    coupon_code: Mapped[str] = mapped_column(String(40), default="", nullable=False)

    status: Mapped[str] = mapped_column(String(30), default="created", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    shipping_service: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    # Monetary value: avoid float rounding issues.
    shipping_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    shipping_eta_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)

    # Address snapshot
    recipient_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    phone: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    cep: Mapped[str] = mapped_column(String(16), default="", nullable=False)
    street: Mapped[str] = mapped_column(String(180), default="", nullable=False)
    number: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    complement: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    neighborhood: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    city: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    state: Mapped[str] = mapped_column(String(10), default="", nullable=False)

    items = relationship("OrderItem", cascade="all, delete-orphan")
    events = relationship("OrderEvent", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    __table_args__ = (
        Index("ix_order_items_store_order", "store_id", "order_id"),
        Index("ix_order_items_store_product", "store_id", "product_id"),
        Index("ix_order_items_store_variant", "store_id", "variant_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), index=True, nullable=False)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)

    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id"), index=True, nullable=False)
    variant_id: Mapped[int] = mapped_column(Integer, ForeignKey("product_variants.id"), index=True, nullable=False)

    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    cancelled_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    product_name: Mapped[str] = mapped_column(String(180), default="", nullable=False)
    variant_label: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    image_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)


class OrderEvent(Base):
    __tablename__ = "order_events"

    __table_args__ = (
        Index("ix_order_events_store_order_created", "store_id", "order_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), index=True, nullable=False)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    from_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
