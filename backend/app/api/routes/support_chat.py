from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user, get_store_from_path
from app.repositories.utils import resolve_store
from app.repositories.support_chat import (
    get_conversation,
    get_open_conversation_for_user,
    create_conversation,
    create_message,
    list_messages,
    list_conversations_for_user,
    list_conversations_for_admin,
    close_conversation,
)
from app.schemas.user import UserOut
from app.schemas.support_chat import (
    SupportConversationOut,
    SupportMessageCreateIn,
    SupportMessageOut,
)


def _assert_can_access_conversation(conv, user: UserOut) -> None:
    if user.is_superuser:
        return
    if conv.customer_user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")


# ------------------------------
# Preferred: path-based store context
#   /api/v1/support/{store_slug}/...
# ------------------------------
router = APIRouter(prefix="/support/{store_slug}")


@router.post("/conversations", response_model=SupportConversationOut)
def create_or_get_conversation_public(
    store=Depends(get_store_from_path),
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
):
    """Customer creates a support conversation.

    If an open conversation already exists for the user, returns it.
    """
    existing = get_open_conversation_for_user(db, store_id=store.id, customer_user_id=user.id)
    if existing:
        return SupportConversationOut.model_validate(existing)
    conv = create_conversation(db, store_id=store.id, customer_user_id=user.id)
    return SupportConversationOut.model_validate(conv)


@router.get("/conversations", response_model=list[SupportConversationOut])
def list_conversations_public(
    store=Depends(get_store_from_path),
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
    status: str | None = Query(default=None, description="Filtro: open | closed"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    if user.is_superuser:
        convs = list_conversations_for_admin(db, store_id=store.id, status=status, limit=limit, offset=offset)
    else:
        convs = list_conversations_for_user(db, store_id=store.id, customer_user_id=user.id, limit=limit, offset=offset)
        if status:
            convs = [c for c in convs if c.status == status]
    return [SupportConversationOut.model_validate(c) for c in convs]


@router.get("/conversations/{conversation_id}/messages", response_model=list[SupportMessageOut])
def get_history_public(
    conversation_id: int,
    store=Depends(get_store_from_path),
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    conv = get_conversation(db, store_id=store.id, conversation_id=conversation_id)
    if not conv:
        # Anti-leak: 404 when the conversation does not belong to the store context.
        raise HTTPException(status_code=404, detail="Conversation not found")
    _assert_can_access_conversation(conv, user)

    msgs = list_messages(db, store_id=store.id, conversation_id=conversation_id, limit=limit, offset=offset)
    return [SupportMessageOut.model_validate(m) for m in msgs]


@router.post("/conversations/{conversation_id}/messages", response_model=SupportMessageOut)
def send_message_public(
    conversation_id: int,
    payload: SupportMessageCreateIn,
    store=Depends(get_store_from_path),
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
):
    conv = get_conversation(db, store_id=store.id, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _assert_can_access_conversation(conv, user)

    if conv.status != "open":
        raise HTTPException(status_code=409, detail="Conversation closed")

    role = "admin" if user.is_superuser else "customer"
    msg = create_message(
        db,
        store_id=store.id,
        conversation_id=conversation_id,
        sender_user_id=user.id,
        sender_role=role,
        body=payload.body,
    )
    return SupportMessageOut.model_validate(msg)


@router.post("/conversations/{conversation_id}/close", response_model=SupportConversationOut)
def close_public(
    conversation_id: int,
    store=Depends(get_store_from_path),
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
):
    conv = get_conversation(db, store_id=store.id, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _assert_can_access_conversation(conv, user)

    if conv.status != "open":
        return SupportConversationOut.model_validate(conv)

    conv2 = close_conversation(db, store_id=store.id, conversation_id=conversation_id)
    return SupportConversationOut.model_validate(conv2)


# ------------------------------
# Legacy (deprecated): query-based store context
#   /api/v1/support/...?...store_slug=...
# ------------------------------
legacy_router = APIRouter(prefix="/support")


@legacy_router.post("/conversations", response_model=SupportConversationOut)
def legacy_create_or_get_conversation(
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    existing = get_open_conversation_for_user(db, store_id=store.id, customer_user_id=user.id)
    if existing:
        return SupportConversationOut.model_validate(existing)
    conv = create_conversation(db, store_id=store.id, customer_user_id=user.id)
    return SupportConversationOut.model_validate(conv)


@legacy_router.get("/conversations", response_model=list[SupportConversationOut])
def legacy_list_conversations(
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
    status: str | None = Query(default=None, description="Filtro: open | closed"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    if user.is_superuser:
        convs = list_conversations_for_admin(db, store_id=store.id, status=status, limit=limit, offset=offset)
    else:
        convs = list_conversations_for_user(db, store_id=store.id, customer_user_id=user.id, limit=limit, offset=offset)
        if status:
            convs = [c for c in convs if c.status == status]
    return [SupportConversationOut.model_validate(c) for c in convs]


@legacy_router.get("/conversations/{conversation_id}/messages", response_model=list[SupportMessageOut])
def legacy_get_history(
    conversation_id: int,
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    conv = get_conversation(db, store_id=store.id, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _assert_can_access_conversation(conv, user)

    msgs = list_messages(db, store_id=store.id, conversation_id=conversation_id, limit=limit, offset=offset)
    return [SupportMessageOut.model_validate(m) for m in msgs]


@legacy_router.post("/conversations/{conversation_id}/messages", response_model=SupportMessageOut)
def legacy_send_message(
    conversation_id: int,
    payload: SupportMessageCreateIn,
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    conv = get_conversation(db, store_id=store.id, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _assert_can_access_conversation(conv, user)

    if conv.status != "open":
        raise HTTPException(status_code=409, detail="Conversation closed")

    role = "admin" if user.is_superuser else "customer"
    msg = create_message(
        db,
        store_id=store.id,
        conversation_id=conversation_id,
        sender_user_id=user.id,
        sender_role=role,
        body=payload.body,
    )
    return SupportMessageOut.model_validate(msg)


@legacy_router.post("/conversations/{conversation_id}/close", response_model=SupportConversationOut)
def legacy_close(
    conversation_id: int,
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    conv = get_conversation(db, store_id=store.id, conversation_id=conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _assert_can_access_conversation(conv, user)

    if conv.status != "open":
        return SupportConversationOut.model_validate(conv)

    conv2 = close_conversation(db, store_id=store.id, conversation_id=conversation_id)
    return SupportConversationOut.model_validate(conv2)
