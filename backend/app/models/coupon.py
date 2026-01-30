from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Coupon(Base):
    __tablename__ = "coupons"
    __table_args__ = (
        # Code must be unique per store.
        UniqueConstraint("store_id", "code", name="uq_coupons_store_code"),
        Index("ix_coupons_store_active", "store_id", "active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)

    # Normalize on write (upper/trim) in repository.
    code: Mapped[str] = mapped_column(String(40), nullable=False)

    # 'percent' or 'fixed'
    kind: Mapped[str] = mapped_column(String(10), nullable=False)

    # For 'percent' use 0-100 with 2 decimals (e.g. 10.00).
    percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)

    # For 'fixed' use BRL monetary value.
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)

    # Expiration: coupon is valid while now <= expires_at (if set).
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    usage_limit_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    usage_limit_per_user: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Denormalized to make total-limit checks cheap.
    used_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    redemptions = relationship("CouponRedemption", cascade="all, delete-orphan")


class CouponRedemption(Base):
    __tablename__ = "coupon_redemptions"
    __table_args__ = (
        Index("ix_coupon_redemptions_coupon_customer", "coupon_id", "customer_id"),
        Index("ix_coupon_redemptions_order", "order_id"),
        Index("ix_coupon_redemptions_store_customer", "store_id", "customer_id"),
        Index("ix_coupon_redemptions_store_coupon", "store_id", "coupon_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)
    coupon_id: Mapped[int] = mapped_column(Integer, ForeignKey("coupons.id"), index=True, nullable=False)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("customers.id"), index=True, nullable=False)

    # One redemption per order. Null allowed for "validation-only" flows if needed later.
    order_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("orders.id"), nullable=True)

    redeemed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
