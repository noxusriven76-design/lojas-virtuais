from __future__ import annotations

import hashlib
import hmac
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


def _create_order(db, *, store_id: int, user_id: int):
    from app.models.order import Order

    row = Order(
        store_id=store_id,
        user_id=user_id,
        status="novo",
        shipping_service="sedex",
        shipping_price=Decimal("0.00"),
        shipping_eta_days=1,
        subtotal=Decimal("100.00"),
        discount=Decimal("0.00"),
        total=Decimal("100.00"),
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


def test_webhook_invalid_signature_is_rejected_and_recorded(client, db_session):
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
        },
    }
    response = client.post("/api/v1/webhooks/payments/mock", json=payload, headers={"x-payment-signature": "bad"})
    assert response.status_code == 401

    from app.models.payment import PaymentWebhookEvent

    row = db_session.query(PaymentWebhookEvent).filter(PaymentWebhookEvent.event_id == payload["event_id"]).first()
    assert row is not None
    assert row.status == "failed"


def test_webhook_processed_and_duplicate_is_ignored(client, db_session):
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
    import json

    raw = json.dumps(payload).encode("utf-8")
    signature = _sign(raw, "secret-123")

    ok = client.post(
        "/api/v1/webhooks/payments/mock",
        content=raw,
        headers={"content-type": "application/json", "x-payment-signature": signature},
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "processed"

    duplicate = client.post(
        "/api/v1/webhooks/payments/mock",
        content=raw,
        headers={"content-type": "application/json", "x-payment-signature": signature},
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["status"] == "ignored"

    from app.models.order import Order
    from app.models.payment import PaymentTransaction

    db_session.expire_all()
    order_row = db_session.query(Order).filter(Order.id == order.id).first()
    assert order_row is not None
    assert order_row.status == "pago"

    tx_rows = db_session.query(PaymentTransaction).filter(PaymentTransaction.order_id == order.id).all()
    assert len(tx_rows) == 1
    assert tx_rows[0].status == "paid"
