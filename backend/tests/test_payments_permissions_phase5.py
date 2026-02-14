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


def _add_member(db, *, store_id: int, user_id: int, role: str):
    from app.models.store import StoreMember

    row = StoreMember(store_id=store_id, user_id=user_id, role=role)
    db.add(row)
    db.commit()
    return row


def _create_order(db, *, store_id: int, user_id: int, total: Decimal, status: str = "pago"):
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


def _create_payment_tx(db, *, store_id: int, order_id: int, amount: Decimal, raw_payload: dict | None = None):
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
        paid_at=None,
        refunded_amount=Decimal("0.00"),
        raw_payload=raw_payload,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_payments_permissions_and_store_isolation(client, db_session):
    suffix = _suffix()

    store_a = _create_store(db_session, name=f"Store A {suffix}", slug=f"store-a-{suffix}")
    store_b = _create_store(db_session, name=f"Store B {suffix}", slug=f"store-b-{suffix}")

    admin = _create_user(db_session, email=f"admin-{suffix}@mail.com")
    operator = _create_user(db_session, email=f"operator-{suffix}@mail.com")
    editor = _create_user(db_session, email=f"editor-{suffix}@mail.com")

    _add_member(db_session, store_id=store_a.id, user_id=admin.id, role="admin_loja")
    _add_member(db_session, store_id=store_a.id, user_id=operator.id, role="operador_pedidos")
    _add_member(db_session, store_id=store_a.id, user_id=editor.id, role="editor_conteudo")

    order_a = _create_order(db_session, store_id=store_a.id, user_id=admin.id, total=Decimal("100.00"))
    tx_a = _create_payment_tx(db_session, store_id=store_a.id, order_id=order_a.id, amount=Decimal("100.00"))

    order_b = _create_order(db_session, store_id=store_b.id, user_id=admin.id, total=Decimal("50.00"))
    _create_payment_tx(db_session, store_id=store_b.id, order_id=order_b.id, amount=Decimal("50.00"))

    admin_headers = _headers(user_id=admin.id)
    operator_headers = _headers(user_id=operator.id)
    editor_headers = _headers(user_id=editor.id)

    ok_list = client.get(f"/api/v1/admin/stores/{store_a.id}/payments", headers=admin_headers)
    assert ok_list.status_code == 200

    forbidden_cross_store = client.get(f"/api/v1/admin/stores/{store_b.id}/payments", headers=admin_headers)
    assert forbidden_cross_store.status_code == 403

    operator_list = client.get(f"/api/v1/admin/stores/{store_a.id}/payments", headers=operator_headers)
    assert operator_list.status_code == 200

    operator_refund = client.post(
        f"/api/v1/admin/stores/{store_a.id}/payments/{tx_a.id}/refund",
        headers=operator_headers,
        json={"amount": 10.0, "reason": "teste"},
    )
    assert operator_refund.status_code == 403

    editor_list = client.get(f"/api/v1/admin/stores/{store_a.id}/payments", headers=editor_headers)
    assert editor_list.status_code == 403


def test_payment_detail_masks_sensitive_payload_fields(client, db_session):
    suffix = _suffix()

    store = _create_store(db_session, name=f"Store {suffix}", slug=f"store-{suffix}")
    admin = _create_user(db_session, email=f"admin-mask-{suffix}@mail.com")
    _add_member(db_session, store_id=store.id, user_id=admin.id, role="admin_loja")

    order = _create_order(db_session, store_id=store.id, user_id=admin.id, total=Decimal("200.00"))
    tx = _create_payment_tx(
        db_session,
        store_id=store.id,
        order_id=order.id,
        amount=Decimal("200.00"),
        raw_payload={
            "card_number": "4111111111111111",
            "cvv": "123",
            "token": "tok_secret",
            "meta": {"cpf": "12345678901", "safe": "ok"},
        },
    )

    response = client.get(f"/api/v1/admin/stores/{store.id}/payments/{tx.id}", headers=_headers(user_id=admin.id))
    assert response.status_code == 200
    payload = response.json()["raw_payload"]
    assert payload["card_number"] == "***"
    assert payload["cvv"] == "***"
    assert payload["token"] == "***"
    assert payload["meta"]["cpf"] == "***"
    assert payload["meta"]["safe"] == "ok"
