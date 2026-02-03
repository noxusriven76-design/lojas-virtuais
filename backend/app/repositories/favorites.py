from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.favorite import Favorite


def list_favorites(db: Session, store_id: int, user_id: int) -> list[Favorite]:
    return (
        db.query(Favorite)
        .filter(Favorite.store_id == store_id, Favorite.user_id == user_id)
        .order_by(Favorite.id.desc())
        .all()
    )


def add_favorite(db: Session, store_id: int, user_id: int, product_id: int) -> Favorite:
    existing = (
        db.query(Favorite)
        .filter(
            Favorite.store_id == store_id,
            Favorite.user_id == user_id,
            Favorite.product_id == product_id,
        )
        .first()
    )
    if existing:
        return existing
    fav = Favorite(store_id=store_id, user_id=user_id, product_id=product_id)
    db.add(fav)
    db.commit()
    db.refresh(fav)
    return fav


def remove_favorite(db: Session, store_id: int, user_id: int, product_id: int) -> bool:
    fav = (
        db.query(Favorite)
        .filter(
            Favorite.store_id == store_id,
            Favorite.user_id == user_id,
            Favorite.product_id == product_id,
        )
        .first()
    )
    if not fav:
        return False
    db.delete(fav)
    db.commit()
    return True
