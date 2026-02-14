from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StoreContent(Base):
    __tablename__ = "store_contents"
    __table_args__ = (UniqueConstraint("store_id", name="uq_store_contents_store_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)

    banner_title: Mapped[str] = mapped_column(String(180), default="", nullable=False)
    banner_subtitle: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    banner_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    highlight_title: Mapped[str] = mapped_column(String(180), default="", nullable=False)
    highlight_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    institutional_text: Mapped[str] = mapped_column(Text, default="", nullable=False)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
