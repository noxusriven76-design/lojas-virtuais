from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.permissions import require_store_manager
from app.core.uploads import UploadValidationError, delete_upload_by_public_url, get_product_upload_dir, save_upload_file
from app.models.catalog import Category, Product, ProductVariant
from app.models.order import OrderItem
from app.schemas.catalog import (
    CategoryCreateIn,
    CategoryOut,
    CategoryTreeOut,
    CategoryUpdateIn,
    ProductAdminOut,
    ProductDeleteOut,
    ProductImageOut,
    ProductUpdateIn,
)

router = APIRouter(prefix="/admin/stores/{store_id}")


def _ensure_store_category(db: Session, store_id: int, category_id: int) -> Category:
    category = db.query(Category).filter(Category.store_id == store_id, Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="category not found")
    return category


def _check_parent_cycle(db: Session, store_id: int, category_id: int, parent_id: int) -> None:
    if parent_id == category_id:
        raise HTTPException(status_code=400, detail="parent_id cannot reference the category itself")

    if not hasattr(Category, "parent_id"):
        raise HTTPException(status_code=400, detail="parent_id is not supported for categories")

    visited: set[int] = set()
    current_parent_id = parent_id
    while current_parent_id is not None:
        if current_parent_id == category_id:
            raise HTTPException(status_code=400, detail="parent_id cannot reference a descendant category")
        if current_parent_id in visited:
            # Existing corrupted graph: stop recursion to avoid infinite loop.
            break
        visited.add(current_parent_id)

        row = (
            db.query(Category.parent_id)
            .filter(Category.store_id == store_id, Category.id == current_parent_id)
            .first()
        )
        current_parent_id = row[0] if row else None


def _ensure_store_product(db: Session, store_id: int, product_id: int) -> Product:
    product = db.query(Product).filter(Product.store_id == store_id, Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="product not found")
    return product


@router.get("/categories", response_model=list[CategoryTreeOut], response_model_exclude_none=True)
def list_categories(
    store_id: int,
    tree: bool = Query(default=False),
    db: Session = Depends(get_db),
    _=Depends(require_store_manager),
):
    query = db.query(Category).filter(Category.store_id == store_id)
    if hasattr(Category, "sort_order"):
        rows = query.order_by(Category.sort_order.asc(), Category.name.asc()).all()
    else:
        rows = query.order_by(Category.name.asc()).all()

    if not tree:
        return [CategoryTreeOut.model_validate(r) for r in rows]

    nodes: dict[int, CategoryTreeOut] = {}
    for row in rows:
        node = CategoryTreeOut.model_validate(row)
        node.children = []
        nodes[row.id] = node

    roots: list[CategoryTreeOut] = []
    for row in rows:
        node = nodes[row.id]
        parent_id = getattr(row, "parent_id", None)
        if parent_id is None:
            roots.append(node)
            continue
        parent = nodes.get(parent_id)
        if parent is None:
            roots.append(node)
            continue
        parent.children.append(node)

    return roots


@router.post("/categories", response_model=CategoryOut)
def create_category(
    store_id: int,
    payload: CategoryCreateIn,
    db: Session = Depends(get_db),
    _=Depends(require_store_manager),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    c = Category(store_id=store_id, name=name)
    db.add(c)
    db.commit()
    db.refresh(c)
    return CategoryOut.model_validate(c)


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    store_id: int,
    category_id: int,
    payload: CategoryUpdateIn,
    db: Session = Depends(get_db),
    _=Depends(require_store_manager),
):
    category = _ensure_store_category(db, store_id=store_id, category_id=category_id)
    fields_set = payload.model_fields_set

    if "name" in fields_set:
        if payload.name is None:
            raise HTTPException(status_code=400, detail="name cannot be null")
        category.name = payload.name

    if "parent_id" in fields_set:
        if payload.parent_id is not None:
            parent = _ensure_store_category(db, store_id=store_id, category_id=payload.parent_id)
            _check_parent_cycle(db, store_id=store_id, category_id=category_id, parent_id=parent.id)
        if hasattr(category, "parent_id"):
            category.parent_id = payload.parent_id
        elif payload.parent_id is not None:
            raise HTTPException(status_code=400, detail="parent_id is not supported for categories")

    if "is_active" in fields_set:
        if hasattr(category, "is_active"):
            if payload.is_active is None:
                raise HTTPException(status_code=400, detail="is_active cannot be null")
            category.is_active = payload.is_active
        elif payload.is_active is not None:
            raise HTTPException(status_code=400, detail="is_active is not supported for categories")

    if "sort_order" in fields_set:
        if hasattr(category, "sort_order"):
            if payload.sort_order is None:
                raise HTTPException(status_code=400, detail="sort_order cannot be null")
            category.sort_order = payload.sort_order
        elif payload.sort_order is not None:
            raise HTTPException(status_code=400, detail="sort_order is not supported for categories")

    db.add(category)
    db.commit()
    db.refresh(category)
    return CategoryOut.model_validate(category)


@router.delete("/categories/{category_id}")
def delete_category(
    store_id: int,
    category_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_store_manager),
):
    category = _ensure_store_category(db, store_id=store_id, category_id=category_id)

    if hasattr(Category, "parent_id"):
        has_children = (
            db.query(Category.id)
            .filter(Category.store_id == store_id, Category.parent_id == category_id)
            .first()
            is not None
        )
        if has_children:
            raise HTTPException(status_code=409, detail="Cannot delete category with subcategories")

    has_products = (
        db.query(Product.id).filter(Product.store_id == store_id, Product.category_id == category_id).first() is not None
    )
    if has_products:
        raise HTTPException(status_code=409, detail="Cannot delete category with linked products")

    db.delete(category)
    db.commit()
    return {"ok": True}


@router.get("/products")
def list_products(store_id: int, db: Session = Depends(get_db), _=Depends(require_store_manager)):
    rows = db.query(Product).filter(Product.store_id == store_id).order_by(Product.id.desc()).all()
    return [
        {
            "id": p.id,
            "category_id": p.category_id,
            "name": p.name,
            "image_url": p.image_url,
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


@router.patch("/products/{product_id}", response_model=ProductAdminOut)
def update_product(
    store_id: int,
    product_id: int,
    payload: ProductUpdateIn,
    db: Session = Depends(get_db),
    _=Depends(require_store_manager),
):
    product = _ensure_store_product(db, store_id=store_id, product_id=product_id)
    fields_set = payload.model_fields_set

    if "category_id" in fields_set:
        if payload.category_id is None:
            raise HTTPException(status_code=400, detail="category_id cannot be null")
        _ensure_store_category(db, store_id=store_id, category_id=payload.category_id)
        product.category_id = payload.category_id

    if "name" in fields_set and payload.name is not None:
        product.name = payload.name
    elif "title" in fields_set and payload.title is not None:
        product.name = payload.title

    if "description" in fields_set:
        product.description = payload.description or ""

    if "price" in fields_set:
        if payload.price is None:
            raise HTTPException(status_code=400, detail="price cannot be null")
        if float(payload.price) <= 0:
            raise HTTPException(status_code=400, detail="price must be greater than 0")
        product.base_price = float(payload.price)

    if "is_active" in fields_set:
        if payload.is_active is None:
            raise HTTPException(status_code=400, detail="is_active cannot be null")
        product.is_active = payload.is_active

    if "image_url" in fields_set:
        product.image_url = payload.image_url or ""

    if "sku" in fields_set and payload.sku is not None:
        raise HTTPException(status_code=400, detail="sku is not supported at product level")

    db.add(product)
    db.commit()
    db.refresh(product)
    return ProductAdminOut.model_validate(product)


@router.delete("/products/{product_id}", response_model=ProductDeleteOut)
def delete_product(
    store_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_store_manager),
):
    """Delete product with safety rule.

    - Soft-delete (is_active=false) when order history exists.
    - Hard-delete otherwise.
    """
    product = _ensure_store_product(db, store_id=store_id, product_id=product_id)
    has_order_history = (
        db.query(OrderItem.id)
        .filter(OrderItem.store_id == store_id, OrderItem.product_id == product_id)
        .first()
        is not None
    )

    if has_order_history:
        product.is_active = False
        db.add(product)
        db.commit()
        return {"ok": True, "mode": "soft_delete", "message": "Product has order history and was deactivated"}

    db.delete(product)
    db.commit()
    return {"ok": True, "mode": "hard_delete", "message": "Product deleted permanently"}


@router.post("/products/{product_id}/variants")
def add_variant(store_id: int, product_id: int, payload: dict, db: Session = Depends(get_db), _=Depends(require_store_manager)):
    _ensure_store_product(db, store_id=store_id, product_id=product_id)

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


@router.post("/products/{product_id}/image", response_model=ProductImageOut)
async def upload_product_image(
    store_id: int,
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(require_store_manager),
):
    """Upload product cover image.

    multipart/form-data:
    - file: <binary image>
    """
    product = _ensure_store_product(db, store_id=store_id, product_id=product_id)
    try:
        saved = await save_upload_file(file, target_dir=get_product_upload_dir(product_id))
    except UploadValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Best effort cleanup for previous local file.
    delete_upload_by_public_url(product.image_url)
    product.image_url = saved.public_url
    db.add(product)
    db.commit()
    return ProductImageOut(product_id=product.id, image_url=product.image_url)


@router.delete("/products/{product_id}/image", response_model=ProductImageOut)
def delete_product_image(
    store_id: int,
    product_id: int,
    delete_file: bool = Query(default=True),
    db: Session = Depends(get_db),
    _=Depends(require_store_manager),
):
    product = _ensure_store_product(db, store_id=store_id, product_id=product_id)
    previous_image_url = product.image_url

    product.image_url = None
    db.add(product)
    db.commit()

    if delete_file and previous_image_url:
        delete_upload_by_public_url(previous_image_url)

    return ProductImageOut(product_id=product.id, image_url=product.image_url)
