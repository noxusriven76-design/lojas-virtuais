from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SupportConversation(Base):
    __tablename__ = "support_conversations"
    __table_args__ = (
        Index("ix_support_conversations_store_status_last", "store_id", "status", "last_message_at"),
        Index("ix_support_conversations_customer_status", "customer_user_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)

    # Authenticated customer (users.id). Keeping it explicit enables permissions and future multi-channel support.
    customer_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    # 'open' | 'closed'
    status: Mapped[str] = mapped_column(String(10), default="open", nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    messages = relationship("SupportMessage", cascade="all, delete-orphan", back_populates="conversation")


class SupportMessage(Base):
    __tablename__ = "support_messages"
    __table_args__ = (
        Index("ix_support_messages_conversation_created", "conversation_id", "created_at"),
        Index("ix_support_messages_store_conversation_created", "store_id", "conversation_id", "created_at"),
        Index("ix_support_messages_store_sender", "store_id", "sender_user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    store_id: Mapped[int] = mapped_column(Integer, ForeignKey("stores.id"), index=True, nullable=False)
    conversation_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("support_conversations.id"), index=True, nullable=False
    )
    sender_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    # 'customer' | 'admin'
    sender_role: Mapped[str] = mapped_column(String(10), nullable=False)

    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    conversation = relationship("SupportConversation", back_populates="messages")
