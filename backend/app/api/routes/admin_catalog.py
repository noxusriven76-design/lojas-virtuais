from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.permissions import require_store_manager
from app.models.catalog import Category, Product, ProductVariant

router = APIRouter(prefix="/admin/stores/{store_id}")


@router.get("/categories")
def list_categories(store_id: int, db: Session = Depends(get_db), _=Depends(require_store_manager)):
    rows = db.query(Category).filter(Category.store_id == store_id).order_by(Category.name.asc()).all()
    return [{"id": r.id, "name": r.name} for r in rows]


@router.post("/categories")
def create_category(store_id: int, payload: dict, db: Session = Depends(get_db), _=Depends(require_store_manager)):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    c = Category(store_id=store_id, name=name)
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "name": c.name}


@router.get("/products")
def list_products(store_id: int, db: Session = Depends(get_db), _=Depends(require_store_manager)):
    rows = db.query(Product).filter(Product.store_id == store_id).order_by(Product.id.desc()).all()
    return [
        {
            "id": p.id,
            "category_id": p.category_id,
            "name": p.name,
            "base_price": p.base_price,
            "is_active": p.is_active,
        }
        for p in rows
    ]


@router.post("/products")
def create_product(store_id: int, payload: dict, db: Session = Depends(get_db), _=Depends(require_store_manager)):
    required = ["category_id", "name", "base_price"]
    for k in required:
        if payload.get(k) in (None, ""):
            raise HTTPException(status_code=400, detail=f"{k} required")

    p = Product(
        store_id=store_id,
        category_id=int(payload["category_id"]),
        name=str(payload["name"]).strip(),
        description=str(payload.get("description", "")),
        image_url=str(payload.get("image_url", "")),
        base_price=float(payload["base_price"]),
        is_active=bool(payload.get("is_active", True)),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id}


@router.post("/products/{product_id}/variants")
def add_variant(store_id: int, product_id: int, payload: dict, db: Session = Depends(get_db), _=Depends(require_store_manager)):
    p = db.query(Product).filter(Product.store_id == store_id, Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="product not found")

    required = ["sku", "price", "stock"]
    for k in required:
        if payload.get(k) in (None, ""):
            raise HTTPException(status_code=400, detail=f"{k} required")

    v = ProductVariant(
        store_id=store_id,
        product_id=product_id,
        sku=str(payload["sku"]),
        color=str(payload.get("color", "")),
        size=str(payload.get("size", "")),
        price=float(payload["price"]),
        stock=int(payload["stock"]),
        active=bool(payload.get("active", True)),
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return {"id": v.id}
