from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_superuser
from app.core.permissions import require_store_manager
from app.core.uploads import UploadValidationError, delete_upload_by_public_url, get_store_upload_dir, save_upload_file
from app.models.address import Address
from app.models.order import Order
from app.models.store import Store, StoreMember
from app.models.user import User
from app.repositories.stores import list_stores, create_store, list_members, add_member, remove_member
from app.schemas.store import (
    StoreCreateIn,
    StoreCustomerListOut,
    StoreCustomerOut,
    StoreLogoOut,
    MyStoreOut,
    StoreOut,
    StoreMemberCreateIn,
    StoreUpdateIn,
)
from app.schemas.user import UserOut


router = APIRouter(prefix="/admin")


def _ensure_store(db: Session, store_id: int) -> Store:
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


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
                role="superuser",
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
            role=role,
        )
        for store, role in rows
    ]


@router.patch("/stores/{store_id}", response_model=StoreOut)
def admin_update_store(
    store_id: int,
    payload: StoreUpdateIn,
    db: Session = Depends(get_db),
    _=Depends(require_store_manager),
):
    store = _ensure_store(db, store_id=store_id)
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
    return StoreOut.model_validate(store)


@router.post("/stores/{store_id}/logo", response_model=StoreLogoOut)
async def admin_upload_store_logo(
    store_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(require_store_manager),
):
    """Upload/replace store logo.

    multipart/form-data:
    - file: <binary image>
    """
    store = _ensure_store(db, store_id=store_id)
    try:
        saved = await save_upload_file(file, target_dir=get_store_upload_dir(store_id))
    except UploadValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Best-effort cleanup for previous local file reference.
    delete_upload_by_public_url(store.logo_url)
    store.logo_url = saved.public_url
    db.add(store)
    db.commit()
    return StoreLogoOut(store_id=store.id, logo_url=store.logo_url)


@router.delete("/stores/{store_id}/logo", response_model=StoreLogoOut)
def admin_delete_store_logo(
    store_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_store_manager),
):
    store = _ensure_store(db, store_id=store_id)
    previous_logo_url = store.logo_url

    store.logo_url = None
    db.add(store)
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
    _=Depends(require_store_manager),
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
    _=Depends(require_store_manager),
):
    role = (payload.role or "owner").strip().lower()
    if role not in ("owner", "manager", "viewer"):
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
    _=Depends(require_store_manager),
):
    ok = remove_member(db, store_id=store_id, user_id=user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"ok": True}


@router.get("/stores/{store_id}/customers", response_model=StoreCustomerListOut)
def admin_list_store_customers(
    store_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_store_manager),
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

    rows = (
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
        .order_by(orders_sq.c.created_at.desc(), User.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

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
