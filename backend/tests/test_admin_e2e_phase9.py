from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from app.core.security import hash_password


def _suffix() -> str:
    return uuid4().hex[:8]


def _create_user(db, *, email: str, password: str, is_superuser: bool = False):
    from app.models.user import User

    user = User(
        email=email,
        password_hash=hash_password(password),
        name=email.split("@")[0],
        is_superuser=is_superuser,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth_headers_from_login(client, *, email: str, password: str, otp_code: str | None = None) -> dict[str, str]:
    payload = {"username": email, "password": password}
    if otp_code:
        payload["otp_code"] = otp_code
    response = client.post("/api/v1/auth/login", data=payload)
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_store_via_api(client, *, headers: dict[str, str], name: str, slug: str) -> dict:
    response = client.post("/api/v1/admin/stores", headers=headers, json={"name": name, "slug": slug})
    assert response.status_code == 200
    return response.json()


def _create_category_via_api(client, *, store_id: int, headers: dict[str, str], name: str) -> dict:
    response = client.post(
        f"/api/v1/admin/stores/{store_id}/categories",
        headers=headers,
        json={"name": name},
    )
    assert response.status_code == 200
    return response.json()


def _create_product_via_api(client, *, store_id: int, category_id: int, headers: dict[str, str], name: str) -> dict:
    response = client.post(
        f"/api/v1/admin/stores/{store_id}/products",
        headers=headers,
        json={
            "category_id": category_id,
            "name": name,
            "base_price": 79.9,
            "description": "produto e2e",
            "is_active": True,
            "sku": "",
            "color": "Azul",
            "size": "M",
            "stock": 4,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("id")
    return data


def _create_order_direct(db, *, store_id: int, user_id: int, product_id: int, variant_id: int):
    from app.models.order import Order, OrderItem

    order = Order(
        store_id=store_id,
        user_id=user_id,
        status="novo",
        shipping_service="sedex",
        shipping_price=Decimal("20.00"),
        shipping_eta_days=2,
        subtotal=Decimal("79.90"),
        discount=Decimal("0.00"),
        total=Decimal("99.90"),
        recipient_name="Cliente E2E",
        phone="11999999999",
        cep="01001-000",
        street="Rua A",
        number="100",
        complement="",
        neighborhood="Centro",
        city="Sao Paulo",
        state="SP",
    )
    db.add(order)
    db.flush()
    item = OrderItem(
        order_id=order.id,
        store_id=store_id,
        product_id=product_id,
        variant_id=variant_id,
        quantity=1,
        unit_price=Decimal("79.90"),
        line_total=Decimal("79.90"),
        product_name="Produto E2E",
        variant_label="Azul / M",
        image_url="",
    )
    db.add(item)
    db.commit()
    db.refresh(order)
    return order


def test_e2e_login_catalog_order_permission_flow(client, db_session):
    suffix = _suffix()
    admin_email = f"admin-{suffix}@local.com"
    manager_email = f"manager-{suffix}@local.com"
    manager_password = "A123456b!"

    _create_user(db_session, email=admin_email, password="admin123", is_superuser=True)
    manager = _create_user(db_session, email=manager_email, password=manager_password, is_superuser=False)

    admin_headers = _auth_headers_from_login(client, email=admin_email, password="admin123")

    store_a = _create_store_via_api(
        client,
        headers=admin_headers,
        name=f"Loja E2E A {suffix}",
        slug=f"e2e-a-{suffix}",
    )
    store_b = _create_store_via_api(
        client,
        headers=admin_headers,
        name=f"Loja E2E B {suffix}",
        slug=f"e2e-b-{suffix}",
    )

    add_member = client.post(
        f"/api/v1/admin/stores/{store_a['id']}/members",
        headers=admin_headers,
        json={"user_id": manager.id, "role": "admin_loja"},
    )
    assert add_member.status_code == 200

    manager_headers = _auth_headers_from_login(client, email=manager_email, password=manager_password)
    category = _create_category_via_api(
        client,
        store_id=store_a["id"],
        headers=manager_headers,
        name="Categoria E2E",
    )
    product = _create_product_via_api(
        client,
        store_id=store_a["id"],
        category_id=category["id"],
        headers=manager_headers,
        name="Produto E2E",
    )

    from app.models.catalog import ProductVariant

    variant = (
        db_session.query(ProductVariant)
        .filter(ProductVariant.store_id == store_a["id"], ProductVariant.product_id == product["id"])
        .first()
    )
    assert variant is not None

    order = _create_order_direct(
        db_session,
        store_id=store_a["id"],
        user_id=manager.id,
        product_id=product["id"],
        variant_id=variant.id,
    )

    list_orders = client.get(f"/api/v1/admin/stores/{store_a['id']}/orders", headers=manager_headers)
    assert list_orders.status_code == 200
    assert any(row["id"] == order.id for row in list_orders.json()["items"])

    status_update = client.patch(
        f"/api/v1/admin/stores/{store_a['id']}/orders/{order.id}/status",
        headers=manager_headers,
        json={"status": "pago"},
    )
    assert status_update.status_code == 200
    assert status_update.json()["status"] == "pago"

    forbidden_cross_store = client.get(f"/api/v1/admin/stores/{store_b['id']}/categories", headers=manager_headers)
    assert forbidden_cross_store.status_code == 403


def test_regression_store_id_required_and_no_cross_store_leak(client, db_session):
    suffix = _suffix()
    admin_email = f"super-{suffix}@local.com"
    _create_user(db_session, email=admin_email, password="admin123", is_superuser=True)
    headers = _auth_headers_from_login(client, email=admin_email, password="admin123")

    store_a = _create_store_via_api(
        client,
        headers=headers,
        name=f"Loja Regressao A {suffix}",
        slug=f"reg-a-{suffix}",
    )
    store_b = _create_store_via_api(
        client,
        headers=headers,
        name=f"Loja Regressao B {suffix}",
        slug=f"reg-b-{suffix}",
    )

    category_a = _create_category_via_api(client, store_id=store_a["id"], headers=headers, name="Cat A")
    product_a = _create_product_via_api(
        client,
        store_id=store_a["id"],
        category_id=category_a["id"],
        headers=headers,
        name="Produto Isolado A",
    )

    missing_store_id = client.get("/api/v1/admin/products", headers=headers)
    assert missing_store_id.status_code == 404

    list_a = client.get(f"/api/v1/admin/stores/{store_a['id']}/products", headers=headers)
    assert list_a.status_code == 200
    ids_a = {row["id"] for row in list_a.json()}
    assert product_a["id"] in ids_a

    list_b = client.get(f"/api/v1/admin/stores/{store_b['id']}/products", headers=headers)
    assert list_b.status_code == 200
    ids_b = {row["id"] for row in list_b.json()}
    assert product_a["id"] not in ids_b
