from __future__ import annotations

from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.repositories.utils import resolve_store
from app.repositories.catalog import list_categories, list_products, get_product

router = APIRouter()

templates = Jinja2Templates(directory="app/templates")


@router.get("/site/{store_slug}")
def store_home(store_slug: str, request: Request, db: Session = Depends(get_db)):
    store = resolve_store(db, store_slug=store_slug)
    cats = list_categories(db, store_id=store.id)
    prods = list_products(db, store_id=store.id, limit=24, offset=0)
    return templates.TemplateResponse(
        "site/home.html",
        {"request": request, "store": store, "categories": cats, "products": prods},
    )


@router.get("/site/{store_slug}/p/{product_id}")
def store_product(store_slug: str, product_id: int, request: Request, db: Session = Depends(get_db)):
    store = resolve_store(db, store_slug=store_slug)
    p = get_product(db, store_id=store.id, product_id=product_id)
    if not p:
        raise HTTPException(status_code=404)
    return templates.TemplateResponse("site/product.html", {"request": request, "store": store, "product": p})


@router.get("/master")
def master_home(request: Request):
    return templates.TemplateResponse("master/index.html", {"request": request})
