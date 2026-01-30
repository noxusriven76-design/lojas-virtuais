from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_superuser
from app.repositories.stores import list_stores, create_store, add_member
from app.repositories.users import get_user_by_id
from app.schemas.store import StoreOut, StoreCreateIn, StoreMemberCreateIn

router = APIRouter(prefix="/master")


@router.get("/stores", response_model=list[StoreOut])
def stores(db: Session = Depends(get_db), _=Depends(require_superuser)):
    return [StoreOut.model_validate(s) for s in list_stores(db)]


@router.post("/stores", response_model=StoreOut)
def create(payload: StoreCreateIn, db: Session = Depends(get_db), _=Depends(require_superuser)):
    s = create_store(db, name=payload.name, slug=payload.slug)
    return StoreOut.model_validate(s)


@router.post("/stores/{store_id}/members")
def add_store_member(
    store_id: int,
    payload: StoreMemberCreateIn,
    db: Session = Depends(get_db),
    _=Depends(require_superuser),
):
    u = get_user_by_id(db, user_id=payload.user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    m = add_member(db, store_id=store_id, user_id=payload.user_id, role=payload.role)
    return {"id": m.id, "store_id": m.store_id, "user_id": m.user_id, "role": m.role}
