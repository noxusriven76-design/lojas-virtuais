from decimal import Decimal


def _create_store(db, *, slug: str, name: str):
    from app.models.store import Store

    s = Store(name=name, slug=slug, is_active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def _create_category(db, *, store_id: int, name: str):
    from app.models.catalog import Category

    c = Category(store_id=store_id, name=name)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _create_product(db, *, store_id: int, category_id: int, name: str, base_price: Decimal):
    from app.models.catalog import Product

    p = Product(
        store_id=store_id,
        category_id=category_id,
        name=name,
        base_price=base_price,
        description="",
        image_url="",
        is_active=True,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _create_coupon(db, *, store_id: int, code: str = "WELCOME10"):
    from app.repositories.coupons import create_coupon

    return create_coupon(
        db,
        store_id=store_id,
        payload={
            "code": code,
            "kind": "percent",
            "percent": 10,
            "amount": 0,
            "active": True,
            "usage_limit_total": 0,
            "usage_limit_per_user": 0,
            "expires_at": None,
        },
    )


def test_no_leak_on_products_list_and_detail(client, db_session):
    """Anti-vazamento: produto criado na Store A não pode aparecer/ser acessado na Store B."""

    store_a = _create_store(db_session, slug="store-a-1", name="Store A")
    store_b = _create_store(db_session, slug="store-b-1", name="Store B")

    cat_a = _create_category(db_session, store_id=store_a.id, name="Cat A")
    prod_a = _create_product(
        db_session,
        store_id=store_a.id,
        category_id=cat_a.id,
        name="Produto A",
        base_price=Decimal("199.90"),
    )

    # Listagem no contexto da Store A deve retornar o produto.
    r_a = client.get(f"/api/v1/public/{store_a.slug}/products")
    assert r_a.status_code == 200
    ids_a = {p["id"] for p in r_a.json()}
    assert prod_a.id in ids_a

    # Listagem no contexto da Store B não pode retornar o produto da Store A.
    r_b = client.get(f"/api/v1/public/{store_b.slug}/products")
    assert r_b.status_code == 200
    ids_b = {p["id"] for p in r_b.json()}
    assert prod_a.id not in ids_b

    # Detail no contexto da Store B deve retornar 404 (anti-vazamento).
    r_detail_b = client.get(f"/api/v1/public/{store_b.slug}/products/{prod_a.id}")
    assert r_detail_b.status_code == 404
    body = r_detail_b.json()
    assert body.get("error", {}).get("message") in ("Product not found", "Not Found")


def test_no_leak_on_coupon_validation(client, db_session):
    """Anti-vazamento: cupom criado na Store A não deve validar no contexto da Store B."""

    store_a = _create_store(db_session, slug="store-a-2", name="Store A")
    store_b = _create_store(db_session, slug="store-b-2", name="Store B")

    _create_coupon(db_session, store_id=store_a.id, code="WELCOME10")

    # Validação no contexto correto (Store A) deve ser válida.
    ok = client.post(
        f"/api/v1/public/{store_a.slug}/coupons/validate",
        json={"code": "WELCOME10", "subtotal": 100.0},
    )
    assert ok.status_code == 200
    assert ok.json()["valid"] is True

    # Validação no contexto errado (Store B) não pode validar o cupom.
    bad = client.post(
        f"/api/v1/public/{store_b.slug}/coupons/validate",
        json={"code": "WELCOME10", "subtotal": 100.0},
    )
    assert bad.status_code == 200
    data = bad.json()
    assert data["valid"] is False
    assert data["reason"] == "not_found"
