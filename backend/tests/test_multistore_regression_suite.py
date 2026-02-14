from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from app.core.security import create_access_token, hash_password


def _suffix() -> str:
    return uuid4().hex[:8]


def _headers(user_id: int, is_superuser: bool) -> dict[str, str]:
    token = create_access_token(subject=str(user_id), extra_claims={"is_superuser": is_superuser})
    return {"Authorization": f"Bearer {token}"}


def _create_user(db, *, email: str, is_superuser: bool = False):
    from app.models.user import User

    user = User(
        email=email,
        password_hash=hash_password("admin123"),
        name=email.split("@")[0],
        is_superuser=is_superuser,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_store(db, *, name: str, slug: str):
    from app.models.store import Store

    row = Store(name=name, slug=slug, is_active=True)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _create_category(db, *, store_id: int, name: str):
    from app.models.catalog import Category

    row = Category(store_id=store_id, name=name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _create_product(db, *, store_id: int, category_id: int, name: str):
    from app.models.catalog import Product

    row = Product(
        store_id=store_id,
        category_id=category_id,
        name=name,
        description="",
        image_url="",
        base_price=Decimal("10.00"),
        is_active=True,
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


def test_regression_admin_routes_require_store_scope(client, db_session):
    suffix = _suffix()
    su = _create_user(db_session, email=f"su-reg-{suffix}@local.com", is_superuser=True)
    headers = _headers(su.id, True)

    assert client.get("/api/v1/admin/products", headers=headers).status_code == 404
    assert client.get("/api/v1/admin/categories", headers=headers).status_code == 404
    assert client.get("/api/v1/admin/orders", headers=headers).status_code == 404
    assert client.get("/api/v1/admin/customers", headers=headers).status_code == 404


def test_regression_cross_store_isolation_in_admin_catalog(client, db_session):
    suffix = _suffix()
    manager = _create_user(db_session, email=f"mgr-reg-{suffix}@local.com", is_superuser=False)
    store_a = _create_store(db_session, name="Reg A", slug=f"reg-a-{suffix}")
    store_b = _create_store(db_session, name="Reg B", slug=f"reg-b-{suffix}")
    _add_member(db_session, store_id=store_a.id, user_id=manager.id, role="admin_loja")

    category_a = _create_category(db_session, store_id=store_a.id, name="A Cat")
    product_a = _create_product(db_session, store_id=store_a.id, category_id=category_a.id, name="A Product")

    headers = _headers(manager.id, False)
    r_ok = client.get(f"/api/v1/admin/stores/{store_a.id}/products", headers=headers)
    assert r_ok.status_code == 200
    assert any(row["id"] == product_a.id for row in r_ok.json())

    r_forbidden = client.get(f"/api/v1/admin/stores/{store_b.id}/products", headers=headers)
    assert r_forbidden.status_code == 403
