from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.catalog import Category, Product


def list_categories(db: Session, store_id: int) -> list[Category]:
    return db.query(Category).filter(Category.store_id == store_id).order_by(Category.name.asc()).all()


def list_products(
    db: Session,
    store_id: int,
    category_id: int | None = None,
    q: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[Product]:
    query = db.query(Product).filter(Product.store_id == store_id, Product.is_active == True)  # noqa: E712
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if q:
        query = query.filter(Product.name.ilike(f"%{q}%"))
    return query.order_by(Product.id.desc()).limit(limit).offset(offset).all()


def get_product(db: Session, store_id: int, product_id: int) -> Product | None:
    return db.query(Product).filter(Product.store_id == store_id, Product.id == product_id).first()
