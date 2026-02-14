from __future__ import annotations

import hashlib
import hmac
import json
from decimal import Decimal
from uuid import uuid4

from app.core.config import settings
from app.core.security import hash_password


def _suffix() -> str:
    return uuid4().hex[:8]


def _sign(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _create_store(db, *, name: str, slug: str):
    from app.models.store import Store

    row = Store(name=name, slug=slug, is_active=True)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _create_user(db, *, email: str):
    from app.models.user import User

    row = User(email=email, password_hash=hash_password("admin123"), name="u", is_superuser=False)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _create_order(db, *, store_id: int, user_id: int, total: str = "100.00"):
    from app.models.order import Order

    row = Order(
        store_id=store_id,
        user_id=user_id,
        status="novo",
        shipping_service="sedex",
        shipping_price=Decimal("0.00"),
        shipping_eta_days=1,
        subtotal=Decimal(total),
        discount=Decimal("0.00"),
        total=Decimal(total),
        recipient_name="X",
        phone="11999999999",
        cep="01001-000",
        street="Rua A",
        number="1",
        complement="",
        neighborhood="Centro",
        city="Sao Paulo",
        state="SP",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_webhook_idempotency_keeps_single_event_and_single_transaction(client, db_session):
    suffix = _suffix()
    store = _create_store(db_session, name=f"Store {suffix}", slug=f"store-{suffix}")
    user = _create_user(db_session, email=f"user-{suffix}@mail.com")
    order = _create_order(db_session, store_id=store.id, user_id=user.id)

    settings.payment_webhook_secrets = "mock=secret-123"
    payload = {
        "event_id": f"evt-{suffix}",
        "event_type": "payment.updated",
        "data": {
            "store_id": store.id,
            "order_id": order.id,
            "status": "paid",
            "amount": "100.00",
            "currency": "BRL",
            "payment_id": f"pay-{suffix}",
            "method": "pix",
        },
    }

    raw = json.dumps(payload).encode("utf-8")
    signature = _sign(raw, "secret-123")
    headers = {"content-type": "application/json", "x-payment-signature": signature}

    first = client.post("/api/v1/webhooks/payments/mock", content=raw, headers=headers)
    assert first.status_code == 200
    assert first.json()["status"] == "processed"

    second = client.post("/api/v1/webhooks/payments/mock", content=raw, headers=headers)
    assert second.status_code == 200
    assert second.json()["status"] == "ignored"

    from app.models.payment import PaymentTransaction, PaymentWebhookEvent

    tx_rows = db_session.query(PaymentTransaction).filter(PaymentTransaction.order_id == order.id).all()
    assert len(tx_rows) == 1

    event_rows = db_session.query(PaymentWebhookEvent).filter(PaymentWebhookEvent.event_id == payload["event_id"]).all()
    assert len(event_rows) == 1
