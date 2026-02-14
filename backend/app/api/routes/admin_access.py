from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import HTMLResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_superuser
from app.core.audit import write_audit_log
from app.core.permissions import (
    VALID_STORE_ROLES,
    get_permissions_for_role,
    normalize_store_role,
    require_content_read,
    require_content_write,
    require_customers_read,
    require_members_read,
    require_members_write,
    require_orders_read,
    require_orders_write,
    require_search_read,
    require_settings_write,
)
from app.models.catalog import Product, ProductVariant
from app.core.uploads import UploadValidationError, delete_upload_by_public_url, get_store_upload_dir, save_upload_file
from app.models.address import Address
from app.models.order import Order, OrderEvent, OrderItem
from app.models.store_content import StoreContent
from app.models.store import Store, StoreMember
from app.models.user import User
from app.repositories.stores import list_stores, create_store, list_members, add_member, remove_member
from app.schemas.store import (
    StoreCreateIn,
    GlobalSearchOut,
    GlobalSearchOrderOut,
    GlobalSearchProductOut,
    GlobalSearchCustomerOut,
    StoreCustomerListOut,
    StoreCustomerOut,
    StoreLogoOut,
    MyStoreOut,
    StoreOut,
    StoreMemberCreateIn,
    StoreMemberUpdateIn,
    StoreUpdateIn,
)
from app.schemas.order import (
    AdminOrderCancelIn,
    AdminOrderEventOut,
    AdminOrderListOut,
    AdminOrderNoteIn,
    AdminOrderOut,
    AdminOrderStatusUpdateIn,
    AdminOrderTimelineOut,
)
from app.schemas.store_content import StoreContentOut, StoreContentUpdateIn
from app.schemas.user import UserOut


router = APIRouter(prefix="/admin")

STATUS_ALIASES = {
    "created": "novo",
    "novo": "novo",
    "paid": "pago",
    "pago": "pago",
    "shipped": "enviado",
    "enviado": "enviado",
    "completed": "concluido",
    "concluido": "concluido",
    "cancelled": "cancelado",
    "cancelado": "cancelado",
    "partially_cancelled": "parcialmente_cancelado",
    "parcialmente_cancelado": "parcialmente_cancelado",
}

ORDER_TRANSITIONS = {
    "novo": {"pago", "cancelado"},
    "pago": {"enviado", "concluido", "cancelado", "parcialmente_cancelado"},
    "enviado": {"concluido"},
    "parcialmente_cancelado": {"enviado", "concluido", "cancelado"},
    "concluido": set(),
    "cancelado": set(),
}


def _snapshot_store(store: Store) -> dict:
    return {
        "id": store.id,
        "name": store.name,
        "slug": store.slug,
        "logo_url": store.logo_url,
        "is_active": bool(store.is_active),
    }


def _snapshot_store_content(content: StoreContent) -> dict:
    return {
        "id": content.id,
        "store_id": content.store_id,
        "banner_title": content.banner_title,
        "banner_subtitle": content.banner_subtitle,
        "banner_image_url": content.banner_image_url,
        "highlight_title": content.highlight_title,
        "highlight_text": content.highlight_text,
        "institutional_text": content.institutional_text,
    }


def _normalize_order_status(raw_status: str | None) -> str:
    value = str(raw_status or "").strip().lower()
    normalized = STATUS_ALIASES.get(value)
    if not normalized:
        raise HTTPException(
            status_code=400,
            detail="Invalid status. Allowed: novo, pago, enviado, concluido, cancelado, parcialmente_cancelado.",
        )
    return normalized


def _assert_status_transition(current_status: str, next_status: str) -> None:
    current = _normalize_order_status(current_status)
    next_value = _normalize_order_status(next_status)
    if current == next_value:
        return
    allowed = ORDER_TRANSITIONS.get(current, set())
    if next_value not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Invalid transition: {current} -> {next_value}",
        )


def _serialize_order_event(event: OrderEvent) -> AdminOrderEventOut:
    return AdminOrderEventOut.model_validate(
        {
            "id": event.id,
            "event_type": event.event_type,
            "from_status": event.from_status,
            "to_status": event.to_status,
            "note": event.note,
            "meta": event.meta,
            "user_id": event.user_id,
            "created_at": event.created_at,
        }
    )


def _append_order_event(
    db: Session,
    *,
    store_id: int,
    order_id: int,
    user_id: int | None,
    event_type: str,
    from_status: str | None = None,
    to_status: str | None = None,
    note: str | None = None,
    meta: dict | None = None,
) -> OrderEvent:
    event = OrderEvent(
        store_id=store_id,
        order_id=order_id,
        user_id=user_id,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        note=note,
        meta=meta,
    )
    db.add(event)
    db.flush()
    return event


def _recalculate_order_totals(order: Order) -> None:
    active_subtotal = Decimal("0.00")
    all_cancelled = True
    for item in order.items:
        active_qty = max(0, int(item.quantity) - int(item.cancelled_quantity or 0))
        if active_qty > 0:
            all_cancelled = False
        active_subtotal += Decimal(str(item.unit_price)) * active_qty

    if all_cancelled:
        order.subtotal = Decimal("0.00")
        order.discount = Decimal("0.00")
        order.shipping_price = Decimal("0.00")
        order.total = Decimal("0.00")
        order.status = "cancelado"
        return

    order.subtotal = active_subtotal
    if Decimal(str(order.discount)) > active_subtotal:
        order.discount = active_subtotal
    order.total = active_subtotal - Decimal(str(order.discount)) + Decimal(str(order.shipping_price))


def _ensure_store(db: Session, store_id: int) -> Store:
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


def _get_or_create_store_content(db: Session, store_id: int) -> StoreContent:
    content = db.query(StoreContent).filter(StoreContent.store_id == store_id).first()
    if content:
        return content
    content = StoreContent(store_id=store_id)
    db.add(content)
    db.commit()
    db.refresh(content)
    return content


# ------------------------------
# Stores (global) - superuser only
# ------------------------------


@router.get("/stores", response_model=list[StoreOut])
def admin_list_stores(
    db: Session = Depends(get_db),
    _=Depends(require_superuser),
):
    return [StoreOut.model_validate(s) for s in list_stores(db)]


@router.post("/stores", response_model=StoreOut)
def admin_create_store(
    payload: StoreCreateIn,
    db: Session = Depends(get_db),
    _=Depends(require_superuser),
):
    name = (payload.name or "").strip()
    slug = (payload.slug or "").strip()
    if not name or not slug:
        raise HTTPException(status_code=400, detail="name and slug required")
    try:
        s = create_store(db, name=name, slug=slug)
    except Exception:
        # MySQL unique constraint violations are handled centrally as IntegrityError -> 409.
        raise
    return StoreOut.model_validate(s)


@router.get("/my-stores", response_model=list[MyStoreOut])
def admin_my_stores(
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
):
    """List stores available to the authenticated user.

    Example response:
    [
      {"store_id": 1, "name": "Roupas", "slug": "roupas", "role": "manager"}
    ]
    """
    if user.is_superuser:
        stores = db.query(Store).order_by(Store.name.asc()).all()
        return [
            MyStoreOut(
                store_id=s.id,
                name=s.name,
                slug=s.slug,
                logo_url=s.logo_url,
                is_active=s.is_active,
                role="super_admin",
                permissions=get_permissions_for_role("super_admin", is_superuser=True),
            )
            for s in stores
        ]

    rows = (
        db.query(Store, StoreMember.role)
        .join(StoreMember, StoreMember.store_id == Store.id)
        .filter(StoreMember.user_id == user.id)
        .order_by(Store.name.asc())
        .all()
    )
    return [
        MyStoreOut(
            store_id=store.id,
            name=store.name,
            slug=store.slug,
            logo_url=store.logo_url,
            is_active=store.is_active,
            role=normalize_store_role(role, is_superuser=False),
            permissions=get_permissions_for_role(role, is_superuser=False),
        )
        for store, role in rows
    ]


@router.patch("/stores/{store_id}", response_model=StoreOut)
def admin_update_store(
    store_id: int,
    payload: StoreUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_settings_write),
    user: UserOut = Depends(get_current_user),
):
    store = _ensure_store(db, store_id=store_id)
    before = _snapshot_store(store)
    fields_set = payload.model_fields_set

    if "name" in fields_set:
        if payload.name is None or not payload.name.strip():
            raise HTTPException(status_code=400, detail="name cannot be empty")
        store.name = payload.name.strip()

    if "slug" in fields_set:
        if payload.slug is None or not payload.slug.strip():
            raise HTTPException(status_code=400, detail="slug cannot be empty")
        store.slug = payload.slug.strip()

    if "is_active" in fields_set:
        if payload.is_active is None:
            raise HTTPException(status_code=400, detail="is_active cannot be null")
        store.is_active = payload.is_active

    db.add(store)
    db.commit()
    db.refresh(store)
    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="store.update",
        entity_type="store",
        entity_id=store.id,
        before_data=before,
        after_data=_snapshot_store(store),
    )
    db.commit()
    return StoreOut.model_validate(store)


@router.post("/stores/{store_id}/logo", response_model=StoreLogoOut)
async def admin_upload_store_logo(
    store_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(require_settings_write),
    user: UserOut = Depends(get_current_user),
):
    """Upload/replace store logo.

    multipart/form-data:
    - file: <binary image>
    """
    store = _ensure_store(db, store_id=store_id)
    before = _snapshot_store(store)
    try:
        saved = await save_upload_file(file, target_dir=get_store_upload_dir(store_id))
    except UploadValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Best-effort cleanup for previous local file reference.
    delete_upload_by_public_url(store.logo_url)
    store.logo_url = saved.public_url
    db.add(store)
    db.commit()
    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="store.logo.update",
        entity_type="store",
        entity_id=store.id,
        before_data=before,
        after_data=_snapshot_store(store),
    )
    db.commit()
    return StoreLogoOut(store_id=store.id, logo_url=store.logo_url)


@router.delete("/stores/{store_id}/logo", response_model=StoreLogoOut)
def admin_delete_store_logo(
    store_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_settings_write),
    user: UserOut = Depends(get_current_user),
):
    store = _ensure_store(db, store_id=store_id)
    before = _snapshot_store(store)
    previous_logo_url = store.logo_url

    store.logo_url = None
    db.add(store)
    db.commit()
    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="store.logo.delete",
        entity_type="store",
        entity_id=store.id,
        before_data=before,
        after_data=_snapshot_store(store),
    )
    db.commit()

    delete_upload_by_public_url(previous_logo_url)
    return StoreLogoOut(store_id=store.id, logo_url=store.logo_url)


# ------------------------------
# Users (global) - superuser only
# ------------------------------


@router.get("/users", response_model=list[UserOut])
def admin_list_users(
    db: Session = Depends(get_db),
    _=Depends(require_superuser),
):
    rows = db.query(User).order_by(User.id.desc()).all()
    return [UserOut.model_validate(u) for u in rows]


# ------------------------------
# Store members - store manager (or superuser)
# ------------------------------


@router.get("/stores/{store_id}/members")
def admin_list_store_members(
    store_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_members_read),
):
    members = list_members(db, store_id=store_id)
    user_ids = [m.user_id for m in members]
    users = {}
    if user_ids:
        rows = db.query(User).filter(User.id.in_(user_ids)).all()
        users = {u.id: u for u in rows}

    return [
        {
            "store_id": m.store_id,
            "user_id": m.user_id,
            "role": m.role,
            "user": UserOut.model_validate(users[m.user_id]) if m.user_id in users else None,
        }
        for m in members
    ]


@router.post("/stores/{store_id}/members")
def admin_add_store_member(
    store_id: int,
    payload: StoreMemberCreateIn,
    db: Session = Depends(get_db),
    _=Depends(require_members_write),
):
    role = normalize_store_role((payload.role or "admin_loja").strip().lower(), is_superuser=False)
    if role not in VALID_STORE_ROLES:
        raise HTTPException(status_code=400, detail="invalid role")

    u = db.query(User).filter(User.id == payload.user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        m = add_member(db, store_id=store_id, user_id=payload.user_id, role=role)
    except Exception:
        raise

    return {
        "store_id": m.store_id,
        "user_id": m.user_id,
        "role": m.role,
        "user": UserOut.model_validate(u),
    }


@router.delete("/stores/{store_id}/members/{user_id}")
def admin_remove_store_member(
    store_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_members_write),
):
    ok = remove_member(db, store_id=store_id, user_id=user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"ok": True}


@router.patch("/stores/{store_id}/members/{user_id}")
def admin_update_store_member_role(
    store_id: int,
    user_id: int,
    payload: StoreMemberUpdateIn,
    db: Session = Depends(get_db),
    _=Depends(require_members_write),
):
    role = normalize_store_role(payload.role, is_superuser=False)
    if role not in VALID_STORE_ROLES:
        raise HTTPException(status_code=400, detail="invalid role")
    member = db.query(StoreMember).filter(StoreMember.store_id == store_id, StoreMember.user_id == user_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.role = role
    db.add(member)
    db.commit()
    return {"ok": True, "store_id": store_id, "user_id": user_id, "role": role}


@router.get("/stores/{store_id}/customers", response_model=StoreCustomerListOut)
def admin_list_store_customers(
    store_id: int,
    q: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_customers_read),
):
    """List customers of a store (derived from orders/users).

    Example response:
    {"items":[{"id":7,"name":"Ana","email":"ana@mail.com","total_orders":3}],"total":1,"limit":20,"offset":0}
    """
    _ensure_store(db, store_id=store_id)

    # Current model after migration 0007: customers are represented by users tied to orders.
    orders_sq = (
        db.query(
            Order.user_id.label("user_id"),
            func.count(Order.id).label("total_orders"),
            func.min(Order.created_at).label("created_at"),
        )
        .filter(Order.store_id == store_id)
        .group_by(Order.user_id)
        .subquery()
    )
    phones_sq = (
        db.query(
            Address.user_id.label("user_id"),
            func.max(Address.phone).label("phone"),
        )
        .filter(Address.store_id == store_id)
        .group_by(Address.user_id)
        .subquery()
    )

    total = db.query(func.count()).select_from(orders_sq).scalar() or 0
    customer_query = (
        db.query(
            User.id.label("id"),
            User.name.label("name"),
            User.email.label("email"),
            phones_sq.c.phone.label("phone"),
            orders_sq.c.created_at.label("created_at"),
            orders_sq.c.total_orders.label("total_orders"),
        )
        .join(orders_sq, orders_sq.c.user_id == User.id)
        .outerjoin(phones_sq, phones_sq.c.user_id == User.id)
    )
    if q:
        token = q.strip()
        if token.isdigit():
            customer_query = customer_query.filter(User.id == int(token))
        else:
            like = f"%{token}%"
            customer_query = customer_query.filter(
                or_(User.name.ilike(like), User.email.ilike(like), phones_sq.c.phone.ilike(like))
            )
    total = customer_query.count()
    rows = customer_query.order_by(orders_sq.c.created_at.desc(), User.id.desc()).limit(limit).offset(offset).all()

    items = [
        StoreCustomerOut(
            id=row.id,
            name=row.name,
            email=row.email,
            phone=row.phone,
            created_at=row.created_at,
            total_orders=int(row.total_orders or 0),
        )
        for row in rows
    ]
    return StoreCustomerListOut(items=items, total=int(total), limit=limit, offset=offset)


@router.get("/stores/{store_id}/global-search", response_model=GlobalSearchOut)
def admin_global_search(
    store_id: int,
    q: str = Query(..., min_length=2, max_length=120),
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
    _=Depends(require_search_read),
):
    _ensure_store(db, store_id=store_id)
    token = q.strip()
    like = f"%{token}%"

    products_query = (
        db.query(
            Product.id.label("id"),
            Product.name.label("name"),
            Product.base_price.label("base_price"),
            Product.is_active.label("is_active"),
            ProductVariant.sku.label("sku"),
        )
        .outerjoin(
            ProductVariant,
            (ProductVariant.store_id == Product.store_id) & (ProductVariant.product_id == Product.id),
        )
        .filter(Product.store_id == store_id)
    )
    if token.isdigit():
        products_query = products_query.filter(or_(Product.id == int(token), ProductVariant.sku.ilike(like)))
    else:
        products_query = products_query.filter(or_(Product.name.ilike(like), ProductVariant.sku.ilike(like)))

    product_rows = (
        products_query.order_by(Product.id.desc(), ProductVariant.id.asc()).limit(limit).all()
    )
    products: list[GlobalSearchProductOut] = []
    seen_product_ids: set[int] = set()
    for row in product_rows:
        if row.id in seen_product_ids:
            continue
        seen_product_ids.add(row.id)
        products.append(
            GlobalSearchProductOut(
                id=row.id,
                name=row.name,
                sku=row.sku,
                price=float(row.base_price or 0),
                is_active=bool(row.is_active),
            )
        )

    customer_orders_sq = (
        db.query(
            Order.user_id.label("user_id"),
            func.count(Order.id).label("total_orders"),
        )
        .filter(Order.store_id == store_id)
        .group_by(Order.user_id)
        .subquery()
    )
    customers_query = (
        db.query(
            User.id.label("id"),
            User.name.label("name"),
            User.email.label("email"),
            customer_orders_sq.c.total_orders.label("total_orders"),
        )
        .join(customer_orders_sq, customer_orders_sq.c.user_id == User.id)
    )
    if token.isdigit():
        customers_query = customers_query.filter(User.id == int(token))
    else:
        customers_query = customers_query.filter(or_(User.name.ilike(like), User.email.ilike(like)))
    customer_rows = customers_query.order_by(customer_orders_sq.c.total_orders.desc(), User.id.desc()).limit(limit).all()
    customers = [
        GlobalSearchCustomerOut(
            id=row.id,
            name=row.name,
            email=row.email,
            total_orders=int(row.total_orders or 0),
        )
        for row in customer_rows
    ]

    orders_query = db.query(Order, User).outerjoin(User, User.id == Order.user_id).filter(Order.store_id == store_id)
    if token.isdigit():
        orders_query = orders_query.filter(or_(Order.id == int(token), Order.user_id == int(token)))
    else:
        orders_query = orders_query.filter(
            or_(
                Order.recipient_name.ilike(like),
                User.name.ilike(like),
                User.email.ilike(like),
                Order.cep.ilike(like),
            )
        )
    order_rows = orders_query.order_by(Order.created_at.desc(), Order.id.desc()).limit(limit).all()
    orders = [
        GlobalSearchOrderOut(
            id=order.id,
            status=order.status,
            total=float(order.total or 0),
            created_at=order.created_at,
            customer_name=(user.name if user else order.recipient_name),
        )
        for order, user in order_rows
    ]

    return GlobalSearchOut(query=token, products=products, customers=customers, orders=orders)


def _serialize_admin_order(order: Order, user: User | None) -> AdminOrderOut:
    return AdminOrderOut.model_validate(
        {
            "id": order.id,
            "status": order.status,
            "created_at": order.created_at.isoformat(),
            "shipping_service": order.shipping_service,
            "shipping_price": order.shipping_price,
            "shipping_eta_days": order.shipping_eta_days,
            "subtotal": order.subtotal,
            "discount": order.discount,
            "total": order.total,
            "recipient_name": order.recipient_name,
            "phone": order.phone,
            "cep": order.cep,
            "street": order.street,
            "number": order.number,
            "complement": order.complement,
            "neighborhood": order.neighborhood,
            "city": order.city,
            "state": order.state,
            "items": [
                {
                    "id": item.id,
                    "product_id": item.product_id,
                    "variant_id": item.variant_id,
                    "quantity": item.quantity,
                    "cancelled_quantity": item.cancelled_quantity,
                    "unit_price": item.unit_price,
                    "line_total": item.line_total,
                    "product_name": item.product_name,
                    "variant_label": item.variant_label,
                    "image_url": item.image_url,
                }
                for item in order.items
            ],
            "user_id": order.user_id,
            "user_name": user.name if user else None,
            "user_email": user.email if user else None,
        }
    )


@router.get("/stores/{store_id}/orders", response_model=AdminOrderListOut)
def admin_list_store_orders(
    store_id: int,
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_orders_read),
):
    _ensure_store(db, store_id=store_id)

    query = db.query(Order).outerjoin(User, User.id == Order.user_id).filter(Order.store_id == store_id)
    if status:
        query = query.filter(Order.status == _normalize_order_status(status))
    if date_from:
        query = query.filter(func.date(Order.created_at) >= date_from)
    if date_to:
        query = query.filter(func.date(Order.created_at) <= date_to)
    if q:
        token = q.strip()
        if token.isdigit():
            query = query.filter(or_(Order.id == int(token), Order.user_id == int(token)))
        else:
            like = f"%{token}%"
            query = query.filter(
                or_(
                    Order.recipient_name.ilike(like),
                    Order.cep.ilike(like),
                    Order.city.ilike(like),
                    User.name.ilike(like),
                    User.email.ilike(like),
                )
            )

    total = query.count()
    orders = query.order_by(Order.created_at.desc(), Order.id.desc()).limit(limit).offset(offset).all()

    user_ids = [order.user_id for order in orders]
    users_by_id: dict[int, User] = {}
    if user_ids:
        users = db.query(User).filter(User.id.in_(user_ids)).all()
        users_by_id = {user.id: user for user in users}

    items = [_serialize_admin_order(order, users_by_id.get(order.user_id)) for order in orders]
    return AdminOrderListOut(items=items, total=total, limit=limit, offset=offset)


@router.get("/stores/{store_id}/orders/{order_id}", response_model=AdminOrderOut)
def admin_get_store_order_detail(
    store_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_orders_read),
):
    order = db.query(Order).filter(Order.store_id == store_id, Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    user = db.query(User).filter(User.id == order.user_id).first()
    return _serialize_admin_order(order, user)


@router.patch("/stores/{store_id}/orders/{order_id}/status", response_model=AdminOrderOut)
def admin_update_store_order_status(
    store_id: int,
    order_id: int,
    payload: AdminOrderStatusUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_orders_write),
    user: UserOut = Depends(get_current_user),
):
    next_status = _normalize_order_status(payload.status)

    order = db.query(Order).filter(Order.store_id == store_id, Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    current_status = _normalize_order_status(order.status)
    _assert_status_transition(current_status, next_status)
    before = {"id": order.id, "status": current_status}
    order.status = next_status
    _append_order_event(
        db,
        store_id=store_id,
        order_id=order.id,
        user_id=user.id,
        event_type="status_changed",
        from_status=current_status,
        to_status=next_status,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="order.status.update",
        entity_type="order",
        entity_id=order.id,
        before_data=before,
        after_data={"id": order.id, "status": order.status},
    )
    db.commit()

    user = db.query(User).filter(User.id == order.user_id).first()
    return _serialize_admin_order(order, user)


@router.get("/stores/{store_id}/orders/{order_id}/timeline", response_model=AdminOrderTimelineOut)
def admin_get_order_timeline(
    store_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_orders_read),
):
    order = db.query(Order).filter(Order.store_id == store_id, Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    events = (
        db.query(OrderEvent)
        .filter(OrderEvent.store_id == store_id, OrderEvent.order_id == order_id)
        .order_by(OrderEvent.created_at.asc(), OrderEvent.id.asc())
        .all()
    )
    if not events:
        synthetic = AdminOrderEventOut(
            id=0,
            event_type="created",
            from_status=None,
            to_status=_normalize_order_status(order.status),
            note="Pedido criado",
            meta=None,
            user_id=order.user_id,
            created_at=order.created_at,
        )
        return AdminOrderTimelineOut(items=[synthetic])

    return AdminOrderTimelineOut(items=[_serialize_order_event(event) for event in events])


@router.post("/stores/{store_id}/orders/{order_id}/notes", response_model=AdminOrderTimelineOut)
def admin_add_order_note(
    store_id: int,
    order_id: int,
    payload: AdminOrderNoteIn,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_orders_write),
    user: UserOut = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.store_id == store_id, Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    note = (payload.note or "").strip()
    if len(note) < 2:
        raise HTTPException(status_code=400, detail="note is required")
    if len(note) > 1000:
        raise HTTPException(status_code=400, detail="note too long")

    _append_order_event(
        db,
        store_id=store_id,
        order_id=order_id,
        user_id=user.id,
        event_type="internal_note",
        note=note,
    )
    db.commit()

    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="order.note.add",
        entity_type="order",
        entity_id=order_id,
        before_data=None,
        after_data={"note": note},
    )
    db.commit()

    events = (
        db.query(OrderEvent)
        .filter(OrderEvent.store_id == store_id, OrderEvent.order_id == order_id)
        .order_by(OrderEvent.created_at.asc(), OrderEvent.id.asc())
        .all()
    )
    return AdminOrderTimelineOut(items=[_serialize_order_event(event) for event in events])


@router.post("/stores/{store_id}/orders/{order_id}/cancel", response_model=AdminOrderOut)
def admin_cancel_order(
    store_id: int,
    order_id: int,
    payload: AdminOrderCancelIn,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_orders_write),
    user: UserOut = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.store_id == store_id, Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    reason = (payload.reason or "").strip()
    if len(reason) < 3:
        raise HTTPException(status_code=400, detail="reason is required")

    before_status = _normalize_order_status(order.status)
    before_subtotal = float(order.subtotal)
    before_total = float(order.total)

    partial_items = payload.items or []
    if partial_items:
        indexed_items: dict[int, OrderItem] = {item.id: item for item in order.items}
        cancel_summary: list[dict] = []
        for row in partial_items:
            item = indexed_items.get(row.order_item_id)
            if not item:
                raise HTTPException(status_code=404, detail=f"order item not found: {row.order_item_id}")
            available = int(item.quantity) - int(item.cancelled_quantity or 0)
            if row.quantity > available:
                raise HTTPException(
                    status_code=409,
                    detail=f"cancel quantity exceeds available for item {row.order_item_id}",
                )
            item.cancelled_quantity = int(item.cancelled_quantity or 0) + int(row.quantity)
            db.add(item)
            cancel_summary.append({"order_item_id": item.id, "quantity": int(row.quantity)})
        _recalculate_order_totals(order)
        if order.status != "cancelado":
            order.status = "parcialmente_cancelado"
        _append_order_event(
            db,
            store_id=store_id,
            order_id=order_id,
            user_id=user.id,
            event_type="partial_cancel",
            from_status=before_status,
            to_status=order.status,
            note=reason,
            meta={"items": cancel_summary},
        )
    else:
        for item in order.items:
            item.cancelled_quantity = int(item.quantity)
            db.add(item)
        _recalculate_order_totals(order)
        _append_order_event(
            db,
            store_id=store_id,
            order_id=order_id,
            user_id=user.id,
            event_type="full_cancel",
            from_status=before_status,
            to_status=order.status,
            note=reason,
            meta=None,
        )

    db.add(order)
    db.commit()
    db.refresh(order)

    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="order.cancel",
        entity_type="order",
        entity_id=order.id,
        before_data={"status": before_status, "subtotal": before_subtotal, "total": before_total},
        after_data={
            "status": order.status,
            "subtotal": float(order.subtotal),
            "total": float(order.total),
            "reason": reason,
            "partial": bool(partial_items),
        },
    )
    db.commit()

    order_user = db.query(User).filter(User.id == order.user_id).first()
    return _serialize_admin_order(order, order_user)


@router.get("/stores/{store_id}/orders/{order_id}/print", response_class=HTMLResponse)
def admin_print_order(
    store_id: int,
    order_id: int,
    kind: str = Query(default="receipt"),
    db: Session = Depends(get_db),
    _=Depends(require_orders_read),
):
    order = db.query(Order).filter(Order.store_id == store_id, Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order_user = db.query(User).filter(User.id == order.user_id).first()
    title = "Etiqueta de envio" if kind == "label" else "Comprovante do pedido"
    header = (
        f"<h1>{title}</h1>"
        f"<p>Pedido #{order.id} - Status: {order.status}</p>"
        f"<p>Cliente: {order_user.name if order_user else order.recipient_name}</p>"
    )
    if kind == "label":
        body = (
            f"<h3>Endereco de entrega</h3>"
            f"<p>{order.recipient_name}</p>"
            f"<p>{order.street}, {order.number} - {order.neighborhood}</p>"
            f"<p>{order.city}/{order.state} - CEP {order.cep}</p>"
            f"<p>Telefone: {order.phone}</p>"
        )
    else:
        item_rows = "".join(
            [
                "<tr>"
                f"<td>{item.product_name}</td>"
                f"<td>{item.variant_label or '-'}</td>"
                f"<td>{item.quantity - int(item.cancelled_quantity or 0)}</td>"
                f"<td>R$ {float(item.unit_price):.2f}</td>"
                "</tr>"
                for item in order.items
            ]
        )
        body = (
            "<h3>Itens</h3>"
            "<table border='1' cellspacing='0' cellpadding='6' style='border-collapse:collapse; width:100%;'>"
            "<thead><tr><th>Produto</th><th>Variante</th><th>Qtd ativa</th><th>Preco</th></tr></thead>"
            f"<tbody>{item_rows}</tbody>"
            "</table>"
            f"<p>Subtotal: R$ {float(order.subtotal):.2f}</p>"
            f"<p>Frete: R$ {float(order.shipping_price):.2f}</p>"
            f"<p>Total: R$ {float(order.total):.2f}</p>"
        )
    html = (
        "<!doctype html><html><head><meta charset='utf-8'><title>Impressao</title></head>"
        "<body style='font-family:Arial,sans-serif; padding:24px;'>"
        f"{header}{body}"
        "<script>window.print();</script>"
        "</body></html>"
    )
    return HTMLResponse(content=html)


@router.get("/stores/{store_id}/content", response_model=StoreContentOut)
def admin_get_store_content(
    store_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_content_read),
):
    _ensure_store(db, store_id=store_id)
    content = _get_or_create_store_content(db, store_id=store_id)
    return StoreContentOut.model_validate(content)


@router.patch("/stores/{store_id}/content", response_model=StoreContentOut)
def admin_update_store_content(
    store_id: int,
    payload: StoreContentUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_content_write),
    user: UserOut = Depends(get_current_user),
):
    _ensure_store(db, store_id=store_id)
    content = _get_or_create_store_content(db, store_id=store_id)
    before = _snapshot_store_content(content)
    fields_set = payload.model_fields_set

    if "banner_title" in fields_set:
        content.banner_title = payload.banner_title or ""
    if "banner_subtitle" in fields_set:
        content.banner_subtitle = payload.banner_subtitle or ""
    if "highlight_title" in fields_set:
        content.highlight_title = payload.highlight_title or ""
    if "highlight_text" in fields_set:
        content.highlight_text = payload.highlight_text or ""
    if "institutional_text" in fields_set:
        content.institutional_text = payload.institutional_text or ""

    db.add(content)
    db.commit()
    db.refresh(content)
    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="content.update",
        entity_type="store_content",
        entity_id=content.id,
        before_data=before,
        after_data=_snapshot_store_content(content),
    )
    db.commit()
    return StoreContentOut.model_validate(content)


@router.post("/stores/{store_id}/content/banner-image", response_model=StoreContentOut)
async def admin_upload_store_banner_image(
    store_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(require_content_write),
    user: UserOut = Depends(get_current_user),
):
    _ensure_store(db, store_id=store_id)
    content = _get_or_create_store_content(db, store_id=store_id)
    before = _snapshot_store_content(content)
    try:
        saved = await save_upload_file(file, target_dir=get_store_upload_dir(store_id))
    except UploadValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    delete_upload_by_public_url(content.banner_image_url)
    content.banner_image_url = saved.public_url
    db.add(content)
    db.commit()
    db.refresh(content)
    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="content.banner_image.update",
        entity_type="store_content",
        entity_id=content.id,
        before_data=before,
        after_data=_snapshot_store_content(content),
    )
    db.commit()
    return StoreContentOut.model_validate(content)


@router.delete("/stores/{store_id}/content/banner-image", response_model=StoreContentOut)
def admin_delete_store_banner_image(
    store_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_content_write),
    user: UserOut = Depends(get_current_user),
):
    _ensure_store(db, store_id=store_id)
    content = _get_or_create_store_content(db, store_id=store_id)
    before = _snapshot_store_content(content)
    previous_url = content.banner_image_url
    content.banner_image_url = None
    db.add(content)
    db.commit()
    db.refresh(content)
    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="content.banner_image.delete",
        entity_type="store_content",
        entity_id=content.id,
        before_data=before,
        after_data=_snapshot_store_content(content),
    )
    db.commit()

    delete_upload_by_public_url(previous_url)
    return StoreContentOut.model_validate(content)
