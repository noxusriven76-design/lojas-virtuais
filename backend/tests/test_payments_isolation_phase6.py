from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from app.core.security import create_access_token, hash_password


def _suffix() -> str:
    return uuid4().hex[:8]


def _headers(user_id: int) -> dict[str, str]:
    token = create_access_token(subject=str(user_id), extra_claims={"is_superuser": False})
    return {"Authorization": f"Bearer {token}"}


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


def _create_order(db, *, store_id: int, user_id: int, total: Decimal):
    from app.models.order import Order

    row = Order(
        store_id=store_id,
        user_id=user_id,
        status="pago",
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


def _create_payment_tx(db, *, store_id: int, order_id: int, amount: Decimal):
    from app.models.payment import PaymentTransaction

    row = PaymentTransaction(
        store_id=store_id,
        order_id=order_id,
        provider="mock",
        provider_payment_id=f"pay-{uuid4().hex[:8]}",
        status="paid",
        amount=amount,
        currency="BRL",
        method="pix",
        refunded_amount=Decimal("0.00"),
        raw_payload={"seed": True},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_payments_multistore_isolation_for_detail_and_refund(client, db_session):
    suffix = _suffix()

    store_a = _create_store(db_session, name=f"Store A {suffix}", slug=f"store-a-{suffix}")
    store_b = _create_store(db_session, name=f"Store B {suffix}", slug=f"store-b-{suffix}")

    user_a = _create_user(db_session, email=f"a-{suffix}@mail.com")
    _add_member(db_session, store_id=store_a.id, user_id=user_a.id, role="admin_loja")

    order_b = _create_order(db_session, store_id=store_b.id, user_id=user_a.id, total=Decimal("50.00"))
    tx_b = _create_payment_tx(db_session, store_id=store_b.id, order_id=order_b.id, amount=Decimal("50.00"))

    headers_a = _headers(user_a.id)

    forbidden_detail = client.get(f"/api/v1/admin/stores/{store_b.id}/payments/{tx_b.id}", headers=headers_a)
    assert forbidden_detail.status_code == 403

    forbidden_refund = client.post(
        f"/api/v1/admin/stores/{store_b.id}/payments/{tx_b.id}/refund",
        headers=headers_a,
        json={"amount": 5.0, "reason": "cross store"},
    )
    assert forbidden_refund.status_code == 403
