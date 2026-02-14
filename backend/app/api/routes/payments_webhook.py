from __future__ import annotations

import hashlib
import hmac
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import parse_payment_webhook_secrets, settings
from app.core.deps import get_db
from fastapi import Depends
from app.models.order import Order
from app.models.payment import PaymentTransaction, PaymentWebhookEvent

router = APIRouter(prefix="/webhooks/payments")

PAYMENT_STATUS_ALLOWED = {
    "pending",
    "authorized",
    "paid",
    "failed",
    "cancelled",
    "partially_refunded",
    "refunded",
}

SENSITIVE_KEYS = {
    "card_number",
    "number",
    "cvv",
    "security_code",
    "token",
    "access_token",
    "authorization",
    "password",
    "document",
    "cpf",
}


def _mask_sensitive(value: Any) -> Any:
    if isinstance(value, dict):
        masked: dict[str, Any] = {}
        for key, item in value.items():
            key_norm = str(key).strip().lower()
            if key_norm in SENSITIVE_KEYS:
                masked[key] = "***"
            else:
                masked[key] = _mask_sensitive(item)
        return masked
    if isinstance(value, list):
        return [_mask_sensitive(item) for item in value]
    return value


def _to_decimal(value: Any, *, field_name: str) -> Decimal:
    try:
        dec = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail=f"invalid decimal for {field_name}")
    if dec < Decimal("0"):
        raise HTTPException(status_code=400, detail=f"{field_name} cannot be negative")
    return dec


def _normalize_payment_status(value: Any) -> str:
    status = str(value or "").strip().lower()
    if status not in PAYMENT_STATUS_ALLOWED:
        raise HTTPException(status_code=400, detail="invalid payment status")
    return status


def _resolve_provider_secret(provider: str) -> str:
    secrets = parse_payment_webhook_secrets(settings.payment_webhook_secrets)
    secret = secrets.get(provider.lower())
    if not secret:
        raise HTTPException(status_code=400, detail=f"webhook secret not configured for provider={provider}")
    return secret


def _validate_signature(*, provider: str, body: bytes, signature: str | None) -> bool:
    if not signature:
        return False
    secret = _resolve_provider_secret(provider)
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    normalized = signature.strip().lower()
    if normalized.startswith("sha256="):
        normalized = normalized.split("=", 1)[1]
    return hmac.compare_digest(expected, normalized)


def _apply_order_status_from_payment(*, order: Order, payment_status: str) -> None:
    if payment_status == "paid":
        order.status = "pago"
        return
    if payment_status == "partially_refunded":
        order.status = "parcialmente_cancelado"
        return
    if payment_status == "refunded":
        order.status = "cancelado"


@router.post("/{provider}")
async def receive_payment_webhook(provider: str, request: Request, db: Session = Depends(get_db)):
    provider_key = (provider or "").strip().lower()
    if not provider_key:
        raise HTTPException(status_code=400, detail="provider required")

    raw_body = await request.body()
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json payload")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="payload must be object")

    event_id = str(payload.get("event_id") or "").strip()
    event_type = str(payload.get("event_type") or "").strip()
    data = payload.get("data")
    if not event_id or not event_type or not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="payload requires event_id, event_type and object data")

    signature = request.headers.get("x-payment-signature") or request.headers.get("x-signature")
    signature_valid = _validate_signature(provider=provider_key, body=raw_body, signature=signature)

    existing_event = (
        db.query(PaymentWebhookEvent)
        .filter(PaymentWebhookEvent.provider == provider_key, PaymentWebhookEvent.event_id == event_id)
        .first()
    )
    if existing_event:
        return {"ok": True, "status": "ignored", "reason": "duplicate_event", "event_id": event_id}

    masked_payload = _mask_sensitive(payload)

    event_row = PaymentWebhookEvent(
        store_id=data.get("store_id"),
        provider=provider_key,
        event_id=event_id,
        event_type=event_type,
        signature_valid=signature_valid,
        status="received",
        payload=masked_payload,
        error_message=None,
        processed_at=None,
    )
    db.add(event_row)
    db.flush()

    if not signature_valid:
        event_row.status = "failed"
        event_row.error_message = "invalid signature"
        event_row.processed_at = datetime.utcnow()
        db.add(event_row)
        db.commit()
        raise HTTPException(status_code=401, detail="invalid webhook signature")

    try:
        store_id = int(data.get("store_id"))
        order_id = int(data.get("order_id"))
        status = _normalize_payment_status(data.get("status"))
        amount = _to_decimal(data.get("amount"), field_name="amount")
    except (TypeError, ValueError):
        event_row.status = "failed"
        event_row.error_message = "invalid store_id/order_id"
        event_row.processed_at = datetime.utcnow()
        db.add(event_row)
        db.commit()
        raise HTTPException(status_code=400, detail="invalid store_id/order_id")
    except HTTPException as exc:
        event_row.status = "failed"
        event_row.error_message = str(exc.detail)
        event_row.processed_at = datetime.utcnow()
        db.add(event_row)
        db.commit()
        raise

    provider_payment_id = str(
        data.get("provider_payment_id") or data.get("payment_id") or data.get("transaction_id") or ""
    ).strip() or None
    method = str(data.get("method") or "").strip() or None
    currency = str(data.get("currency") or "BRL").strip().upper()

    order = db.query(Order).filter(Order.store_id == store_id, Order.id == order_id).first()
    if not order:
        event_row.status = "failed"
        event_row.error_message = "order not found"
        event_row.processed_at = datetime.utcnow()
        db.add(event_row)
        db.commit()
        raise HTTPException(status_code=404, detail="order not found")

    payment_query = db.query(PaymentTransaction).filter(
        PaymentTransaction.store_id == store_id,
        PaymentTransaction.order_id == order_id,
        PaymentTransaction.provider == provider_key,
    )
    if provider_payment_id:
        payment_query = payment_query.filter(PaymentTransaction.provider_payment_id == provider_payment_id)
    payment_row = payment_query.order_by(PaymentTransaction.id.desc()).first()

    if payment_row is None:
        payment_row = PaymentTransaction(
            store_id=store_id,
            order_id=order_id,
            provider=provider_key,
            provider_payment_id=provider_payment_id,
            status=status,
            amount=amount,
            currency=currency,
            method=method,
            paid_at=datetime.utcnow() if status == "paid" else None,
            refunded_amount=Decimal("0.00"),
            raw_payload=masked_payload,
            updated_at=datetime.utcnow(),
        )
    else:
        payment_row.status = status
        payment_row.provider_payment_id = provider_payment_id or payment_row.provider_payment_id
        payment_row.amount = amount
        payment_row.currency = currency
        payment_row.method = method or payment_row.method
        if status == "paid":
            payment_row.paid_at = payment_row.paid_at or datetime.utcnow()
        if status == "partially_refunded":
            payment_row.refunded_amount = min(payment_row.amount, payment_row.amount / Decimal("2"))
        if status == "refunded":
            payment_row.refunded_amount = payment_row.amount
        payment_row.raw_payload = masked_payload
        payment_row.updated_at = datetime.utcnow()

    _apply_order_status_from_payment(order=order, payment_status=status)

    event_row.status = "processed"
    event_row.error_message = None
    event_row.processed_at = datetime.utcnow()
    db.add(order)
    db.add(payment_row)
    db.add(event_row)
    db.commit()

    return {
        "ok": True,
        "status": "processed",
        "event_id": event_id,
        "payment_transaction_id": payment_row.id,
        "order_id": order_id,
        "payment_status": payment_row.status,
    }
