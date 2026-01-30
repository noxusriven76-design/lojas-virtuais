from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.store import Store


class StoreContextRequiredError(ValueError):
    """Raised when a request needs a store context but none was provided/resolved."""


def resolve_store(
    db: Session,
    store_id: int | None = None,
    store_slug: str | None = None,
) -> Store:
    if store_id:
        s = db.query(Store).filter(Store.id == store_id, Store.is_active == True).first()  # noqa: E712
        if s:
            return s

    if store_slug:
        s = db.query(Store).filter(Store.slug == store_slug, Store.is_active == True).first()  # noqa: E712
        if s:
            return s

    # fallback: if exactly one active store exists, use it
    active = db.query(Store).filter(Store.is_active == True).all()  # noqa: E712
    if len(active) == 1:
        return active[0]

    raise StoreContextRequiredError("Store context required (store_id or store_slug)")


def get_store_by_slug(db: Session, *, store_slug: str, active_only: bool = True) -> Store | None:
    """Fetch a store by slug.

    Intended for path-based store resolution where the store slug is mandatory.
    """
    q = db.query(Store).filter(Store.slug == store_slug)
    if active_only:
        q = q.filter(Store.is_active == True)  # noqa: E712
    return q.first()


def get_store_by_id(db: Session, *, store_id: int, active_only: bool = True) -> Store | None:
    q = db.query(Store).filter(Store.id == store_id)
    if active_only:
        q = q.filter(Store.is_active == True)  # noqa: E712
    return q.first()
