from __future__ import annotations

import hashlib
import hmac
import json
from decimal import Decimal
from uuid import uuid4

from app.core.config import settings
from app.core.security import create_access_token, hash_password


def _suffix() -> str:
    return uuid4().hex[:8]


def _headers(user_id: int) -> dict[str, str]:
    token = create_access_token(subject=str(user_id), extra_claims={"is_superuser": False})
    return {"Authorization": f"Bearer {token}"}


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

    row = User(
        email=email,
        password_hash=hash_password("admin123"),
        name=email.split("@")[0],
        is_superuser=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _add_member(db, *, store_id: int, user_id: int, role: str = "admin_loja"):
    from app.models.store import StoreMember

    row = StoreMember(store_id=store_id, user_id=user_id, role=role)
    db.add(row)
    db.commit()
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


def test_e2e_payment_paid_then_refund_then_reconciliation(client, db_session):
    suffix = _suffix()
    store = _create_store(db_session, name=f"Store {suffix}", slug=f"store-{suffix}")
    user = _create_user(db_session, email=f"admin-{suffix}@mail.com")
    _add_member(db_session, store_id=store.id, user_id=user.id, role="admin_loja")
    headers = _headers(user.id)

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

    webhook = client.post(
        "/api/v1/webhooks/payments/mock",
        content=raw,
        headers={"content-type": "application/json", "x-payment-signature": signature},
    )
    assert webhook.status_code == 200

    list_resp = client.get(f"/api/v1/admin/stores/{store.id}/payments", headers=headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1
    payment_id = list_resp.json()["items"][0]["id"]

    refund = client.post(
        f"/api/v1/admin/stores/{store.id}/payments/{payment_id}/refund",
        headers=headers,
        json={"amount": 25.0, "reason": "ajuste operacional"},
    )
    assert refund.status_code == 200

    detail = client.get(f"/api/v1/admin/stores/{store.id}/payments/{payment_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["status"] == "partially_refunded"
    assert float(detail.json()["refunded_amount"]) == 25.0

    reconcile = client.get(f"/api/v1/admin/stores/{store.id}/payments/reconciliation", headers=headers)
    assert reconcile.status_code == 200
    assert all(item["order_id"] != order.id for item in reconcile.json()["items"])
