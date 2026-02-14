from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.repositories.stores import get_member_role
from app.schemas.user import UserOut

ROLE_SUPER_ADMIN = "super_admin"
ROLE_ADMIN_LOJA = "admin_loja"
ROLE_OPERADOR_PEDIDOS = "operador_pedidos"
ROLE_EDITOR_CONTEUDO = "editor_conteudo"
ROLE_SUPORTE = "suporte"

VALID_STORE_ROLES = {
    ROLE_ADMIN_LOJA,
    ROLE_OPERADOR_PEDIDOS,
    ROLE_EDITOR_CONTEUDO,
    ROLE_SUPORTE,
    # Legacy aliases accepted for compatibility:
    "owner",
    "manager",
    "viewer",
}

ROLE_ALIASES = {
    "owner": ROLE_ADMIN_LOJA,
    "manager": ROLE_ADMIN_LOJA,
    "viewer": ROLE_SUPORTE,
    ROLE_ADMIN_LOJA: ROLE_ADMIN_LOJA,
    ROLE_OPERADOR_PEDIDOS: ROLE_OPERADOR_PEDIDOS,
    ROLE_EDITOR_CONTEUDO: ROLE_EDITOR_CONTEUDO,
    ROLE_SUPORTE: ROLE_SUPORTE,
    ROLE_SUPER_ADMIN: ROLE_SUPER_ADMIN,
}

PERMISSIONS_BY_ROLE: dict[str, set[str]] = {
    ROLE_SUPER_ADMIN: {"*"},
    ROLE_ADMIN_LOJA: {
        "dashboard.read",
        "search.read",
        "catalog.read",
        "catalog.write",
        "orders.read",
        "orders.write",
        "customers.read",
        "content.read",
        "content.write",
        "members.read",
        "members.write",
        "settings.read",
        "settings.write",
        "coupons.manage",
        "audit.read",
        "payments.read",
        "payments.write",
        "payments.refund",
    },
    ROLE_OPERADOR_PEDIDOS: {
        "dashboard.read",
        "search.read",
        "orders.read",
        "orders.write",
        "customers.read",
        "payments.read",
    },
    ROLE_EDITOR_CONTEUDO: {
        "dashboard.read",
        "search.read",
        "content.read",
        "content.write",
    },
    ROLE_SUPORTE: {
        "dashboard.read",
        "search.read",
        "orders.read",
        "customers.read",
        "content.read",
        "payments.read",
    },
}


def normalize_store_role(role: str | None, is_superuser: bool = False) -> str:
    if is_superuser:
        return ROLE_SUPER_ADMIN
    raw = str(role or "").strip().lower()
    return ROLE_ALIASES.get(raw, ROLE_SUPORTE)


def get_permissions_for_role(role: str, is_superuser: bool = False) -> list[str]:
    normalized = normalize_store_role(role, is_superuser=is_superuser)
    perms = PERMISSIONS_BY_ROLE.get(normalized, set())
    if "*" in perms:
        # Explicit deterministic list for UI and auditing.
        return sorted(
            {
                "dashboard.read",
                "search.read",
                "catalog.read",
                "catalog.write",
                "orders.read",
                "orders.write",
                "customers.read",
                "content.read",
                "content.write",
                "members.read",
                "members.write",
                "settings.read",
                "settings.write",
                "coupons.manage",
                "audit.read",
                "payments.read",
                "payments.write",
                "payments.refund",
                "stores.manage",
            }
        )
    return sorted(perms)


def has_permission(role: str, permission: str, is_superuser: bool = False) -> bool:
    normalized = normalize_store_role(role, is_superuser=is_superuser)
    perms = PERMISSIONS_BY_ROLE.get(normalized, set())
    return "*" in perms or permission in perms


def require_store_member(
    store_id: int,
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
) -> str:
    if user.is_superuser:
        return ROLE_SUPER_ADMIN
    role = get_member_role(db, store_id=store_id, user_id=user.id)
    if not role:
        raise HTTPException(status_code=403, detail="Forbidden")
    return normalize_store_role(role)


def require_store_permission(permission: str):
    def _dependency(
        store_id: int,
        db: Session = Depends(get_db),
        user: UserOut = Depends(get_current_user),
    ) -> str:
        role = require_store_member(store_id=store_id, db=db, user=user)
        if not has_permission(role, permission, is_superuser=user.is_superuser):
            raise HTTPException(status_code=403, detail=f"Insufficient permission: {permission}")
        return role

    return _dependency


def require_store_manager(
    store_id: int,
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
) -> str:
    # Backward-compatible alias used by existing endpoints.
    dep = require_store_permission("settings.write")
    return dep(store_id=store_id, db=db, user=user)


require_catalog_read = require_store_permission("catalog.read")
require_catalog_write = require_store_permission("catalog.write")
require_dashboard_read = require_store_permission("dashboard.read")
require_search_read = require_store_permission("search.read")
require_orders_read = require_store_permission("orders.read")
require_orders_write = require_store_permission("orders.write")
require_customers_read = require_store_permission("customers.read")
require_content_read = require_store_permission("content.read")
require_content_write = require_store_permission("content.write")
require_members_read = require_store_permission("members.read")
require_members_write = require_store_permission("members.write")
require_settings_write = require_store_permission("settings.write")
require_coupons_manage = require_store_permission("coupons.manage")
require_audit_read = require_store_permission("audit.read")
require_payments_read = require_store_permission("payments.read")
require_payments_write = require_store_permission("payments.write")
require_payments_refund = require_store_permission("payments.refund")
