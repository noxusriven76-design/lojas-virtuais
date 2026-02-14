from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from app.core.security import create_access_token, hash_password


def _suffix() -> str:
    return uuid4().hex[:8]


def _auth_headers(*, user_id: int, is_superuser: bool = False) -> dict[str, str]:
    token = create_access_token(subject=str(user_id), extra_claims={"is_superuser": is_superuser})
    return {"Authorization": f"Bearer {token}"}


def _create_store(db, *, name: str, slug: str):
    from app.models.store import Store

    store = Store(name=name, slug=slug, is_active=True)
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


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


def _add_member(db, *, store_id: int, user_id: int, role: str = "manager"):
    from app.models.store import StoreMember

    member = StoreMember(store_id=store_id, user_id=user_id, role=role)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def _create_category(db, *, store_id: int, name: str, parent_id: int | None = None):
    from app.models.catalog import Category

    category = Category(store_id=store_id, name=name)
    if hasattr(category, "parent_id"):
        category.parent_id = parent_id
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def _create_product(db, *, store_id: int, category_id: int, name: str = "Produto"):
    from app.models.catalog import Product

    product = Product(
        store_id=store_id,
        category_id=category_id,
        name=name,
        description="",
        image_url="",
        base_price=Decimal("12.50"),
        is_active=True,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def _message(body: dict) -> str:
    return body.get("error", {}).get("message", "")


def test_admin_forbidden_for_store_without_membership(client, db_session):
    suffix = _suffix()
    store_a = _create_store(db_session, name="Store A", slug=f"adm-store-a-{suffix}")
    store_b = _create_store(db_session, name="Store B", slug=f"adm-store-b-{suffix}")
    user = _create_user(db_session, email=f"manager-{suffix}@local.com")
    _add_member(db_session, store_id=store_a.id, user_id=user.id, role="manager")

    headers = _auth_headers(user_id=user.id, is_superuser=False)

    ok = client.get(f"/api/v1/admin/stores/{store_a.id}/categories", headers=headers)
    assert ok.status_code == 200

    forbidden = client.get(f"/api/v1/admin/stores/{store_b.id}/categories", headers=headers)
    assert forbidden.status_code == 403
    assert _message(forbidden.json()) in ("Forbidden", "Insufficient role")


def test_category_delete_conflict_with_children_returns_409(client, db_session):
    suffix = _suffix()
    store = _create_store(db_session, name="Store C", slug=f"adm-store-c-{suffix}")
    su = _create_user(db_session, email=f"su-{suffix}@local.com", is_superuser=True)

    parent = _create_category(db_session, store_id=store.id, name="Pai")
    _create_category(db_session, store_id=store.id, name="Filha", parent_id=parent.id)

    headers = _auth_headers(user_id=su.id, is_superuser=True)
    response = client.delete(f"/api/v1/admin/stores/{store.id}/categories/{parent.id}", headers=headers)

    assert response.status_code == 409
    assert "subcategories" in _message(response.json()).lower()


def test_category_delete_conflict_with_products_returns_409(client, db_session):
    suffix = _suffix()
    store = _create_store(db_session, name="Store D", slug=f"adm-store-d-{suffix}")
    su = _create_user(db_session, email=f"su2-{suffix}@local.com", is_superuser=True)

    category = _create_category(db_session, store_id=store.id, name="Com produtos")
    _create_product(db_session, store_id=store.id, category_id=category.id)

    headers = _auth_headers(user_id=su.id, is_superuser=True)
    response = client.delete(f"/api/v1/admin/stores/{store.id}/categories/{category.id}", headers=headers)

    assert response.status_code == 409
    assert "linked products" in _message(response.json()).lower()


def test_product_and_store_upload_endpoints(client, db_session):
    suffix = _suffix()
    store = _create_store(db_session, name="Store Upload", slug=f"adm-store-upload-{suffix}")
    su = _create_user(db_session, email=f"su3-{suffix}@local.com", is_superuser=True)

    category = _create_category(db_session, store_id=store.id, name="Fotos")
    product = _create_product(db_session, store_id=store.id, category_id=category.id, name="Produto com imagem")

    headers = _auth_headers(user_id=su.id, is_superuser=True)

    upload_image = client.post(
        f"/api/v1/admin/stores/{store.id}/products/{product.id}/image",
        headers=headers,
        files={"file": ("cover.jpg", b"fakejpegbytes", "image/jpeg")},
    )
    assert upload_image.status_code == 200
    image_url = upload_image.json()["image_url"]
    assert image_url.startswith(f"/static/uploads/products/{product.id}/")

    invalid_image = client.post(
        f"/api/v1/admin/stores/{store.id}/products/{product.id}/image",
        headers=headers,
        files={"file": ("cover.txt", b"not-an-image", "text/plain")},
    )
    assert invalid_image.status_code == 400
    assert "extension" in _message(invalid_image.json()).lower()

    remove_image = client.delete(f"/api/v1/admin/stores/{store.id}/products/{product.id}/image", headers=headers)
    assert remove_image.status_code == 200
    remaining_cover = remove_image.json()["image_url"]
    if remaining_cover is not None:
        assert remaining_cover.startswith(f"/static/uploads/products/{product.id}/")

    upload_logo = client.post(
        f"/api/v1/admin/stores/{store.id}/logo",
        headers=headers,
        files={"file": ("logo.webp", b"fakewebpbytes", "image/webp")},
    )
    assert upload_logo.status_code == 200
    logo_url = upload_logo.json()["logo_url"]
    assert logo_url.startswith(f"/static/uploads/stores/{store.id}/")
