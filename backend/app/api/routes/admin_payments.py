from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.deps import get_current_user, get_db
from app.core.permissions import require_payments_read, require_payments_refund
from app.models.order import Order
from app.models.payment import PaymentRefund, PaymentTransaction, PaymentWebhookEvent
from app.models.store import Store
from app.models.user import User
from app.schemas.payment import (
    PaymentReconciliationItemOut,
    PaymentReconciliationOut,
    PaymentRefundIn,
    PaymentRefundListOut,
    PaymentRefundOut,
    PaymentTransactionListOut,
    PaymentTransactionOut,
    PaymentWebhookEventListOut,
    PaymentWebhookEventOut,
)
from app.schemas.user import UserOut


router = APIRouter(prefix="/admin/stores/{store_id}")


def _ensure_store(db: Session, store_id: int) -> Store:
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


def _to_decimal(value: Decimal) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


@router.get("/payments", response_model=PaymentTransactionListOut)
def list_store_payments(
    store_id: int,
    status: str | None = Query(default=None),
    provider: str | None = Query(default=None),
    method: str | None = Query(default=None),
    q: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_payments_read),
):
    _ensure_store(db, store_id=store_id)
    query = db.query(PaymentTransaction).filter(PaymentTransaction.store_id == store_id)
    if status:
        query = query.filter(PaymentTransaction.status == status.strip().lower())
    if provider:
        query = query.filter(PaymentTransaction.provider == provider.strip().lower())
    if method:
        query = query.filter(PaymentTransaction.method == method.strip().lower())
    if date_from:
        query = query.filter(func.date(PaymentTransaction.created_at) >= date_from)
    if date_to:
        query = query.filter(func.date(PaymentTransaction.created_at) <= date_to)
    if q:
        token = q.strip()
        if token.isdigit():
            query = query.filter(or_(PaymentTransaction.id == int(token), PaymentTransaction.order_id == int(token)))
        else:
            like = f"%{token}%"
            query = query.filter(
                or_(
                    PaymentTransaction.provider_payment_id.ilike(like),
                    PaymentTransaction.provider.ilike(like),
                    PaymentTransaction.status.ilike(like),
                )
            )

    total = query.count()
    rows = query.order_by(PaymentTransaction.created_at.desc(), PaymentTransaction.id.desc()).limit(limit).offset(offset).all()

    order_ids = [row.order_id for row in rows]
    order_map = {row.id: row for row in db.query(Order).filter(Order.store_id == store_id, Order.id.in_(order_ids)).all()} if order_ids else {}
    user_ids = [row.user_id for row in order_map.values() if row.user_id]
    user_map = {row.id: row for row in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    items: list[PaymentTransactionOut] = []
    for row in rows:
        order = order_map.get(row.order_id)
        user = user_map.get(order.user_id) if order else None
        item = PaymentTransactionOut.model_validate(row).model_copy(
            update={"customer_name": user.name if user else None, "customer_email": user.email if user else None}
        )
        items.append(item)
    return PaymentTransactionListOut(items=items, total=total, limit=limit, offset=offset)


@router.get("/payments/{payment_id:int}", response_model=PaymentTransactionOut)
def get_store_payment_detail(
    store_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_payments_read),
):
    _ensure_store(db, store_id=store_id)
    row = db.query(PaymentTransaction).filter(PaymentTransaction.store_id == store_id, PaymentTransaction.id == payment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Payment transaction not found")
    order = db.query(Order).filter(Order.store_id == store_id, Order.id == row.order_id).first()
    user = db.query(User).filter(User.id == order.user_id).first() if order else None
    return PaymentTransactionOut.model_validate(row).model_copy(
        update={"customer_name": user.name if user else None, "customer_email": user.email if user else None}
    )


@router.get("/payments/{payment_id:int}/refunds", response_model=PaymentRefundListOut)
def list_store_payment_refunds(
    store_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_payments_read),
):
    _ensure_store(db, store_id=store_id)
    tx = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.store_id == store_id, PaymentTransaction.id == payment_id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Payment transaction not found")
    rows = (
        db.query(PaymentRefund)
        .filter(PaymentRefund.store_id == store_id, PaymentRefund.payment_transaction_id == payment_id)
        .order_by(PaymentRefund.created_at.desc(), PaymentRefund.id.desc())
        .all()
    )
    items = [PaymentRefundOut.model_validate(row) for row in rows]
    return PaymentRefundListOut(items=items, total=len(items))


@router.get("/payments/{payment_id:int}/webhook-events", response_model=PaymentWebhookEventListOut)
def list_store_payment_webhook_events(
    store_id: int,
    payment_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _=Depends(require_payments_read),
):
    _ensure_store(db, store_id=store_id)
    tx = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.store_id == store_id, PaymentTransaction.id == payment_id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Payment transaction not found")

    candidates = (
        db.query(PaymentWebhookEvent)
        .filter(PaymentWebhookEvent.store_id == store_id, PaymentWebhookEvent.provider == tx.provider)
        .order_by(PaymentWebhookEvent.created_at.desc(), PaymentWebhookEvent.id.desc())
        .limit(250)
        .all()
    )

    matched: list[PaymentWebhookEventOut] = []
    order_id_text = str(tx.order_id)
    provider_payment_id = (tx.provider_payment_id or "").strip()
    for row in candidates:
        payload = row.payload or {}
        payload_order_id = str(payload.get("order_id") or payload.get("pedido_id") or "")
        payload_payment_id = str(
            payload.get("provider_payment_id") or payload.get("payment_id") or payload.get("transaction_id") or ""
        )
        if payload_order_id and payload_order_id == order_id_text:
            matched.append(PaymentWebhookEventOut.model_validate(row))
            continue
        if provider_payment_id and payload_payment_id and payload_payment_id == provider_payment_id:
            matched.append(PaymentWebhookEventOut.model_validate(row))
    items = matched[:limit]
    return PaymentWebhookEventListOut(items=items, total=len(matched))


@router.post("/payments/{payment_id:int}/refund", response_model=PaymentRefundOut)
def refund_store_payment(
    store_id: int,
    payment_id: int,
    payload: PaymentRefundIn,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_payments_refund),
    user: UserOut = Depends(get_current_user),
):
    _ensure_store(db, store_id=store_id)
    tx = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.store_id == store_id, PaymentTransaction.id == payment_id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Payment transaction not found")

    if tx.status not in {"paid", "partially_refunded"}:
        raise HTTPException(status_code=409, detail="Payment status does not allow refund")

    refundable = _to_decimal(tx.amount) - _to_decimal(tx.refunded_amount)
    if refundable <= Decimal("0.00"):
        raise HTTPException(status_code=409, detail="No refundable amount remaining")

    refund_amount = _to_decimal(payload.amount) if payload.amount is not None else refundable
    if refund_amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Refund amount must be greater than zero")
    if refund_amount > refundable:
        raise HTTPException(status_code=409, detail="Refund amount exceeds refundable balance")

    before_data = {
        "payment_id": tx.id,
        "status": tx.status,
        "refunded_amount": float(tx.refunded_amount),
        "order_id": tx.order_id,
    }

    refund_row = PaymentRefund(
        store_id=store_id,
        payment_transaction_id=tx.id,
        amount=refund_amount,
        status="succeeded",
        provider_refund_id=None,
        reason=payload.reason.strip(),
        raw_payload={"source": "admin_manual_refund"},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(refund_row)
    db.flush()

    tx.refunded_amount = _to_decimal(tx.refunded_amount) + refund_amount
    tx.status = "refunded" if _to_decimal(tx.refunded_amount) >= _to_decimal(tx.amount) else "partially_refunded"
    tx.updated_at = datetime.utcnow()
    db.add(tx)

    order = db.query(Order).filter(Order.store_id == store_id, Order.id == tx.order_id).first()
    if order:
        if tx.status == "refunded":
            order.status = "cancelado"
        elif tx.status == "partially_refunded":
            order.status = "parcialmente_cancelado"
        db.add(order)

    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="payment.refund.create",
        entity_type="payment_transaction",
        entity_id=tx.id,
        before_data=before_data,
        after_data={
            "refund_id": refund_row.id,
            "status": tx.status,
            "refunded_amount": float(tx.refunded_amount),
            "refund_amount": float(refund_amount),
            "order_id": tx.order_id,
        },
    )
    db.commit()
    db.refresh(refund_row)
    return PaymentRefundOut(
        id=refund_row.id,
        store_id=refund_row.store_id,
        payment_transaction_id=refund_row.payment_transaction_id,
        amount=refund_row.amount,
        status=refund_row.status,
        provider_refund_id=refund_row.provider_refund_id,
        reason=refund_row.reason,
        created_at=refund_row.created_at,
    )


@router.get("/payments/reconciliation", response_model=PaymentReconciliationOut)
def reconcile_store_payments(
    store_id: int,
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_payments_read),
):
    _ensure_store(db, store_id=store_id)

    order_query = db.query(Order).filter(Order.store_id == store_id)
    if date_from:
        order_query = order_query.filter(func.date(Order.created_at) >= date_from)
    if date_to:
        order_query = order_query.filter(func.date(Order.created_at) <= date_to)

    orders = order_query.order_by(Order.created_at.desc(), Order.id.desc()).limit(limit).offset(offset).all()

    items: list[PaymentReconciliationItemOut] = []
    for order in orders:
        tx = (
            db.query(PaymentTransaction)
            .filter(PaymentTransaction.store_id == store_id, PaymentTransaction.order_id == order.id)
            .order_by(PaymentTransaction.created_at.desc(), PaymentTransaction.id.desc())
            .first()
        )
        if not tx:
            items.append(
                PaymentReconciliationItemOut(
                    order_id=order.id,
                    order_status=order.status,
                    order_total=order.total,
                    payment_transaction_id=None,
                    payment_status=None,
                    payment_amount=None,
                    discrepancy_type="missing_payment",
                    detail="Pedido sem transacao de pagamento registrada",
                )
            )
            continue

        mismatch_amount = _to_decimal(tx.amount) != _to_decimal(order.total)
        status_mismatch = (order.status == "pago" and tx.status != "paid") or (
            order.status in {"cancelado", "parcialmente_cancelado"} and tx.status not in {"refunded", "partially_refunded"}
        )

        if mismatch_amount:
            items.append(
                PaymentReconciliationItemOut(
                    order_id=order.id,
                    order_status=order.status,
                    order_total=order.total,
                    payment_transaction_id=tx.id,
                    payment_status=tx.status,
                    payment_amount=tx.amount,
                    discrepancy_type="amount_mismatch",
                    detail="Total do pedido diverge do valor da transacao",
                )
            )
        elif status_mismatch:
            items.append(
                PaymentReconciliationItemOut(
                    order_id=order.id,
                    order_status=order.status,
                    order_total=order.total,
                    payment_transaction_id=tx.id,
                    payment_status=tx.status,
                    payment_amount=tx.amount,
                    discrepancy_type="status_mismatch",
                    detail="Status de pedido e pagamento divergentes",
                )
            )

    return PaymentReconciliationOut(items=items, total=len(items), limit=limit, offset=offset)
