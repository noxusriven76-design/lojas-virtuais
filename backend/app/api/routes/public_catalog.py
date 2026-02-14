from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_store_from_path
from app.models.payment import StorePaymentMethod
from app.models.store_content import StoreContent
from app.repositories.utils import get_store_by_slug, resolve_store
from app.repositories.catalog import list_categories, list_products, get_product
from app.schemas.catalog import CategoryOut, ProductOut
from app.schemas.payment_method import StorePaymentMethodOut
from app.schemas.store import StoreOut
from app.schemas.store_content import StoreContentOut


# ------------------------------
# Preferred: path-based store context
#   /api/v1/public/{store_slug}/...
# ------------------------------
router = APIRouter(prefix="/public/{store_slug}")
store_router = APIRouter()


@router.get("/categories", response_model=list[CategoryOut])
def categories(
    store=Depends(get_store_from_path),
    db: Session = Depends(get_db),
):
    cats = list_categories(db, store_id=store.id)
    return [CategoryOut.model_validate(c) for c in cats]


@router.get("/products", response_model=list[ProductOut])
def products(
    store=Depends(get_store_from_path),
    db: Session = Depends(get_db),
    category_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    prods = list_products(db, store_id=store.id, category_id=category_id, q=q, limit=limit, offset=offset)
    return [ProductOut.model_validate(p) for p in prods]


@router.get("/products/{product_id}", response_model=ProductOut)
def product_detail(
    product_id: int,
    store=Depends(get_store_from_path),
    db: Session = Depends(get_db),
):
    p = get_product(db, store_id=store.id, product_id=product_id)
    if not p:
        # Anti-leak: always 404 when product doesn't belong to the store context.
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductOut.model_validate(p)


# ------------------------------
# Legacy (deprecated): query-based store context
#   /api/v1/categories?store_slug=...
# ------------------------------
legacy_router = APIRouter()


@legacy_router.get("/categories", response_model=list[CategoryOut])
def legacy_categories(
    db: Session = Depends(get_db),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    cats = list_categories(db, store_id=store.id)
    return [CategoryOut.model_validate(c) for c in cats]


@legacy_router.get("/products", response_model=list[ProductOut])
def legacy_products(
    db: Session = Depends(get_db),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    prods = list_products(db, store_id=store.id, category_id=category_id, q=q, limit=limit, offset=offset)
    return [ProductOut.model_validate(p) for p in prods]


@legacy_router.get("/products/{product_id}", response_model=ProductOut)
def legacy_product_detail(
    product_id: int,
    db: Session = Depends(get_db),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    p = get_product(db, store_id=store.id, product_id=product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductOut.model_validate(p)


@store_router.get("/stores/slug/{slug}", response_model=StoreOut)
def get_store_by_slug_public(
    slug: str,
    db: Session = Depends(get_db),
):
    store = get_store_by_slug(db, store_slug=slug, active_only=True)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return StoreOut.model_validate(store)


@store_router.get("/stores/slug/{slug}/content", response_model=StoreContentOut)
def get_store_content_by_slug_public(
    slug: str,
    db: Session = Depends(get_db),
):
    store = get_store_by_slug(db, store_slug=slug, active_only=True)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    content = db.query(StoreContent).filter(StoreContent.store_id == store.id).first()
    if not content:
        content = StoreContent(store_id=store.id)
        db.add(content)
        db.commit()
        db.refresh(content)
    return StoreContentOut.model_validate(content)


@store_router.get("/stores/{store_slug}/payment-methods", response_model=list[StorePaymentMethodOut])
def get_active_store_payment_methods(
    store_slug: str,
    db: Session = Depends(get_db),
):
    store = get_store_by_slug(db, store_slug=store_slug, active_only=True)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    rows = (
        db.query(StorePaymentMethod)
        .filter(StorePaymentMethod.store_id == store.id, StorePaymentMethod.is_active.is_(True))
        .order_by(StorePaymentMethod.sort_order.asc(), StorePaymentMethod.id.asc())
        .all()
    )
    return [StorePaymentMethodOut.model_validate(row) for row in rows]
