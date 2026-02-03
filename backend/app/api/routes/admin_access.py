from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_superuser
from app.core.permissions import require_store_manager
from app.models.user import User
from app.repositories.stores import list_stores, create_store, list_members, add_member, remove_member
from app.schemas.store import StoreCreateIn, StoreOut, StoreMemberCreateIn
from app.schemas.user import UserOut


router = APIRouter(prefix="/admin")


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
