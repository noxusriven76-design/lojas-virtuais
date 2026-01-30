from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_store_from_path
from app.repositories.utils import resolve_store
from app.repositories.catalog import list_categories, list_products, get_product
from app.schemas.catalog import CategoryOut, ProductOut


# ------------------------------
# Preferred: path-based store context
#   /api/v1/public/{store_slug}/...
# ------------------------------
router = APIRouter(prefix="/public/{store_slug}")


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
