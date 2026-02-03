from __future__ import annotations

from sqlalchemy import Boolean, Integer, String, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Address(Base):
    __tablename__ = "addresses"

    __table_args__ = (
        Index("ix_addresses_store_user", "store_id", "user_id"),
        Index("ix_addresses_store_default", "store_id", "is_default"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)
    # "cliente" = user do sistema (global). Associação com a loja é indireta (store_members).
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    label: Mapped[str] = mapped_column(String(80), default="Casa", nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    phone: Mapped[str] = mapped_column(String(40), default="", nullable=False)

    cep: Mapped[str] = mapped_column(String(16), nullable=False)
    street: Mapped[str] = mapped_column(String(180), nullable=False)
    number: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    complement: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    neighborhood: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str] = mapped_column(String(10), nullable=False)

    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
