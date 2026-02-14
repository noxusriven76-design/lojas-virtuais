from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from app.core.security import create_access_token, hash_password


def _suffix() -> str:
    return uuid4().hex[:8]


def _headers(*, user_id: int, is_superuser: bool = False) -> dict[str, str]:
    token = create_access_token(subject=str(user_id), extra_claims={"is_superuser": is_superuser})
    return {"Authorization": f"Bearer {token}"}


def _create_store(db, *, name: str, slug: str):
    from app.models.store import Store

    row = Store(name=name, slug=slug, is_active=True)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _create_user(db, *, email: str, is_superuser: bool = False):
    from app.models.user import User

    row = User(
        email=email,
        password_hash=hash_password("admin123"),
        name=email.split("@")[0],
        is_superuser=is_superuser,
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


def _create_order(db, *, store_id: int, user_id: int, total: Decimal, status: str = "novo"):
    from app.models.order import Order

    row = Order(
        store_id=store_id,
        user_id=user_id,
        status=status,
        shipping_service="sedex",
        shipping_price=Decimal("0.00"),
        shipping_eta_days=1,
        subtotal=total,
        discount=Decimal("0.00"),
        total=total,
        recipient_name="Cliente",
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


def _create_payment_tx(
    db,
    *,
    store_id: int,
    order_id: int,
    amount: Decimal,
    status: str = "paid",
    provider: str = "mock",
):
    from app.models.payment import PaymentTransaction

    row = PaymentTransaction(
        store_id=store_id,
        order_id=order_id,
        provider=provider,
        provider_payment_id=f"pay-{uuid4().hex[:8]}",
        status=status,
        amount=amount,
        currency="BRL",
        method="pix",
        paid_at=None,
        refunded_amount=Decimal("0.00"),
        raw_payload={"seed": True},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _create_webhook_event(db, *, store_id: int, provider: str, order_id: int, provider_payment_id: str):
    from app.models.payment import PaymentWebhookEvent

    row = PaymentWebhookEvent(
        store_id=store_id,
        provider=provider,
        event_id=f"evt-{uuid4().hex[:10]}",
        event_type="payment.paid",
        signature_valid=True,
        status="processed",
        payload={"order_id": order_id, "provider_payment_id": provider_payment_id},
        error_message=None,
        processed_at=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_admin_payments_list_detail_refund_reconciliation_and_audit(client, db_session):
    suffix = _suffix()
    store = _create_store(db_session, name=f"Store {suffix}", slug=f"store-{suffix}")
    user = _create_user(db_session, email=f"user-{suffix}@mail.com", is_superuser=False)
    _add_member(db_session, store_id=store.id, user_id=user.id, role="admin_loja")
    headers = _headers(user_id=user.id, is_superuser=False)

    order_paid = _create_order(db_session, store_id=store.id, user_id=user.id, total=Decimal("100.00"), status="pago")
    tx_paid = _create_payment_tx(db_session, store_id=store.id, order_id=order_paid.id, amount=Decimal("100.00"))

    order_no_payment = _create_order(
        db_session, store_id=store.id, user_id=user.id, total=Decimal("49.90"), status="novo"
    )
    _ = order_no_payment
    _create_webhook_event(
        db_session,
        store_id=store.id,
        provider=tx_paid.provider,
        order_id=order_paid.id,
        provider_payment_id=tx_paid.provider_payment_id or "",
    )

    list_resp = client.get(f"/api/v1/admin/stores/{store.id}/payments", headers=headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 1
    assert any(item["id"] == tx_paid.id for item in list_resp.json()["items"])

    detail_resp = client.get(f"/api/v1/admin/stores/{store.id}/payments/{tx_paid.id}", headers=headers)
    assert detail_resp.status_code == 200
    assert detail_resp.json()["order_id"] == order_paid.id
    assert detail_resp.json()["status"] == "paid"
    assert detail_resp.json()["customer_email"] == user.email

    refund_resp = client.post(
        f"/api/v1/admin/stores/{store.id}/payments/{tx_paid.id}/refund",
        headers=headers,
        json={"amount": 30.0, "reason": "cliente desistiu de parte do pedido"},
    )
    assert refund_resp.status_code == 200
    assert refund_resp.json()["status"] == "succeeded"
    assert float(refund_resp.json()["amount"]) == 30.0

    refunds_resp = client.get(f"/api/v1/admin/stores/{store.id}/payments/{tx_paid.id}/refunds", headers=headers)
    assert refunds_resp.status_code == 200
    assert refunds_resp.json()["total"] >= 1

    events_resp = client.get(f"/api/v1/admin/stores/{store.id}/payments/{tx_paid.id}/webhook-events", headers=headers)
    assert events_resp.status_code == 200
    assert events_resp.json()["total"] >= 1

    from app.models.payment import PaymentTransaction
    from app.models.order import Order
    from app.models.audit_log import AuditLog

    db_session.expire_all()
    tx_after = db_session.query(PaymentTransaction).filter(PaymentTransaction.id == tx_paid.id).first()
    assert tx_after is not None
    assert tx_after.status == "partially_refunded"
    assert float(tx_after.refunded_amount) == 30.0

    order_after = db_session.query(Order).filter(Order.id == order_paid.id).first()
    assert order_after is not None
    assert order_after.status == "parcialmente_cancelado"

    audit_row = (
        db_session.query(AuditLog)
        .filter(AuditLog.store_id == store.id, AuditLog.action == "payment.refund.create", AuditLog.entity_id == str(tx_paid.id))
        .first()
    )
    assert audit_row is not None

    reconciliation_resp = client.get(f"/api/v1/admin/stores/{store.id}/payments/reconciliation", headers=headers)
    assert reconciliation_resp.status_code == 200
    rec_items = reconciliation_resp.json()["items"]
    assert any(item["discrepancy_type"] == "missing_payment" for item in rec_items)
