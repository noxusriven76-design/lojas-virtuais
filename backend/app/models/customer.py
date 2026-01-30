from __future__ import annotations

from sqlalchemy import Integer, String, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Customer(Base):
    __tablename__ = "customers"

    __table_args__ = (
        # Common access patterns are scoped by store.
        Index("ix_customers_store_email", "store_id", "email"),
        Index("ix_customers_store_user", "store_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(180), default="", nullable=False)
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=True)
    phone: Mapped[str] = mapped_column(String(40), default="", nullable=False)
