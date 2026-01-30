from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.support_chat import SupportConversation, SupportMessage


def get_conversation(db: Session, *, store_id: int, conversation_id: int) -> SupportConversation | None:
    return (
        db.query(SupportConversation)
        .filter(SupportConversation.store_id == store_id, SupportConversation.id == conversation_id)
        .first()
    )


def get_open_conversation_for_user(
    db: Session,
    store_id: int,
    customer_user_id: int,
) -> SupportConversation | None:
    return (
        db.query(SupportConversation)
        .filter(
            SupportConversation.store_id == store_id,
            SupportConversation.customer_user_id == customer_user_id,
            SupportConversation.status == "open",
        )
        .first()
    )


def create_conversation(db: Session, store_id: int, customer_user_id: int) -> SupportConversation:
    conv = SupportConversation(
        store_id=store_id,
        customer_user_id=customer_user_id,
        status="open",
        last_message_at=None,
        closed_at=None,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def list_conversations_for_user(
    db: Session,
    store_id: int,
    customer_user_id: int,
    limit: int = 20,
    offset: int = 0,
) -> list[SupportConversation]:
    return (
        db.query(SupportConversation)
        .filter(SupportConversation.store_id == store_id, SupportConversation.customer_user_id == customer_user_id)
        .order_by(SupportConversation.last_message_at.desc().nullslast(), SupportConversation.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )


def list_conversations_for_admin(
    db: Session,
    store_id: int,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[SupportConversation]:
    q = db.query(SupportConversation).filter(SupportConversation.store_id == store_id)
    if status:
        q = q.filter(SupportConversation.status == status)
    return (
        q.order_by(SupportConversation.last_message_at.desc().nullslast(), SupportConversation.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )


def create_message(
    db: Session,
    *,
    store_id: int,
    conversation_id: int,
    sender_user_id: int,
    sender_role: str,
    body: str,
) -> SupportMessage:
    msg = SupportMessage(
        store_id=store_id,
        conversation_id=conversation_id,
        sender_user_id=sender_user_id,
        sender_role=sender_role,
        body=body,
    )
    db.add(msg)

    # Denormalize on conversation for cheap listing.
    now = datetime.utcnow()
    conv = (
        db.query(SupportConversation)
        .filter(SupportConversation.store_id == store_id, SupportConversation.id == conversation_id)
        .first()
    )
    if conv:
        conv.last_message_at = now
        conv.updated_at = now

    db.commit()
    db.refresh(msg)
    return msg


def list_messages(
    db: Session,
    *,
    store_id: int,
    conversation_id: int,
    limit: int = 200,
    offset: int = 0,
) -> list[SupportMessage]:
    # Enforce store isolation by joining through the conversation.
    return (
        db.query(SupportMessage)
        .join(SupportConversation, SupportConversation.id == SupportMessage.conversation_id)
        .filter(
            SupportConversation.store_id == store_id,
            SupportMessage.store_id == store_id,
            SupportMessage.conversation_id == conversation_id,
        )
        .order_by(SupportMessage.id.asc())
        .limit(limit)
        .offset(offset)
        .all()
    )


def close_conversation(db: Session, *, store_id: int, conversation_id: int) -> SupportConversation | None:
    conv = (
        db.query(SupportConversation)
        .filter(SupportConversation.store_id == store_id, SupportConversation.id == conversation_id)
        .first()
    )
    if not conv:
        return None
    conv.status = "closed"
    conv.closed_at = datetime.utcnow()
    db.commit()
    db.refresh(conv)
    return conv
