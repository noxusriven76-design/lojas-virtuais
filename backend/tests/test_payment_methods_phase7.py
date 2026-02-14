from __future__ import annotations

from app.core.security import create_access_token, hash_password


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


def test_payment_methods_admin_and_public_flow(client, db_session):
    store = _create_store(db_session, name="Agro", slug="agro")
    user = _create_user(db_session, email="admin-agro@mail.com")
    _add_member(db_session, store_id=store.id, user_id=user.id, role="admin_loja")
    headers = _headers(user_id=user.id)

    create = client.post(
        f"/api/v1/admin/stores/{store.id}/payment-methods",
        headers=headers,
        json={
            "code": "pix",
            "label": "PIX a vista",
            "is_active": True,
            "sort_order": 2,
            "min_amount": 10,
            "max_amount": 5000,
            "settlement_days": 0,
        },
    )
    assert create.status_code == 200
    method_id = create.json()["id"]

    create_boleto = client.post(
        f"/api/v1/admin/stores/{store.id}/payment-methods",
        headers=headers,
        json={
            "code": "boleto",
            "label": "Boleto",
            "is_active": True,
            "sort_order": 1,
            "settlement_days": 2,
        },
    )
    assert create_boleto.status_code == 200
    boleto_id = create_boleto.json()["id"]

    listed = client.get(f"/api/v1/admin/stores/{store.id}/payment-methods", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["total"] == 2
    assert listed.json()["items"][0]["code"] == "boleto"
    assert listed.json()["items"][1]["code"] == "pix"

    public_before = client.get(f"/api/v1/stores/{store.slug}/payment-methods")
    assert public_before.status_code == 200
    assert [row["code"] for row in public_before.json()] == ["boleto", "pix"]

    patch = client.patch(
        f"/api/v1/admin/stores/{store.id}/payment-methods/{method_id}",
        headers=headers,
        json={"is_active": False, "label": "PIX desativado"},
    )
    assert patch.status_code == 200
    assert patch.json()["is_active"] is False

    public_after_disable = client.get(f"/api/v1/stores/{store.slug}/payment-methods")
    assert public_after_disable.status_code == 200
    assert [row["code"] for row in public_after_disable.json()] == ["boleto"]

    reorder = client.post(
        f"/api/v1/admin/stores/{store.id}/payment-methods/reorder",
        headers=headers,
        json={"items": [{"id": method_id, "sort_order": 0}, {"id": boleto_id, "sort_order": 1}]},
    )
    assert reorder.status_code == 200

    reactivate = client.patch(
        f"/api/v1/admin/stores/{store.id}/payment-methods/{method_id}",
        headers=headers,
        json={"is_active": True},
    )
    assert reactivate.status_code == 200

    public_after_reorder = client.get(f"/api/v1/stores/{store.slug}/payment-methods")
    assert public_after_reorder.status_code == 200
    assert [row["code"] for row in public_after_reorder.json()] == ["pix", "boleto"]

    delete = client.delete(f"/api/v1/admin/stores/{store.id}/payment-methods/{boleto_id}", headers=headers)
    assert delete.status_code == 200
    assert delete.json()["ok"] is True

    from app.models.audit_log import AuditLog

    actions = {
        "payment.method.create",
        "payment.method.update",
        "payment.method.reorder",
        "payment.method.delete",
    }
    audit_rows = db_session.query(AuditLog).filter(AuditLog.store_id == store.id, AuditLog.action.in_(actions)).all()
    assert len(audit_rows) >= 4


def test_payment_methods_store_isolation(client, db_session):
    store_a = _create_store(db_session, name="Store A", slug="store-a")
    store_b = _create_store(db_session, name="Store B", slug="store-b")
    user_a = _create_user(db_session, email="admin-a@mail.com")
    _add_member(db_session, store_id=store_a.id, user_id=user_a.id, role="admin_loja")
    headers_a = _headers(user_id=user_a.id)

    forbidden_create = client.post(
        f"/api/v1/admin/stores/{store_b.id}/payment-methods",
        headers=headers_a,
        json={"code": "pix", "label": "PIX", "is_active": True, "sort_order": 0},
    )
    assert forbidden_create.status_code == 403

    forbidden_list = client.get(f"/api/v1/admin/stores/{store_b.id}/payment-methods", headers=headers_a)
    assert forbidden_list.status_code == 403

