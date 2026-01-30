from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.repositories.utils import resolve_store
from app.repositories.customers import get_or_create_customer_for_user
from app.repositories.favorites import list_favorites, add_favorite, remove_favorite
from app.schemas.favorite import FavoriteOut
from app.models.user import User

router = APIRouter(prefix="/favorites")


@router.get("", response_model=list[FavoriteOut])
def get_favs(
    db: Session = Depends(get_db),
    user_out=Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    user = db.get(User, user_out.id)
    customer = get_or_create_customer_for_user(db, store_id=store.id, user=user)

    favs = list_favorites(db, store_id=store.id, customer_id=customer.id)
    return [FavoriteOut.model_validate(f) for f in favs]


@router.post("/{product_id}", response_model=FavoriteOut)
def add(
    product_id: int,
    db: Session = Depends(get_db),
    user_out=Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    user = db.get(User, user_out.id)
    customer = get_or_create_customer_for_user(db, store_id=store.id, user=user)

    fav = add_favorite(db, store_id=store.id, customer_id=customer.id, product_id=product_id)
    return FavoriteOut.model_validate(fav)


@router.delete("/{product_id}")
def remove(
    product_id: int,
    db: Session = Depends(get_db),
    user_out=Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    user = db.get(User, user_out.id)
    customer = get_or_create_customer_for_user(db, store_id=store.id, user=user)

    ok = remove_favorite(db, store_id=store.id, customer_id=customer.id, product_id=product_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Favorite not found")
    return {"ok": True}
