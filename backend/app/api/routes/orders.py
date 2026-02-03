from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.repositories.utils import resolve_store
from app.repositories.orders import list_orders, get_order, create_order
from app.schemas.order import OrderCreateIn, OrderOut

router = APIRouter(prefix="/orders")


def _serialize_order(o) -> OrderOut:
    return OrderOut.model_validate(
        {
            **{
                "id": o.id,
                "status": o.status,
                "created_at": o.created_at.isoformat(),
                "shipping_service": o.shipping_service,
                "shipping_price": o.shipping_price,
                "shipping_eta_days": o.shipping_eta_days,
                "subtotal": o.subtotal,
                "discount": o.discount,
                "total": o.total,
                "recipient_name": o.recipient_name,
                "phone": o.phone,
                "cep": o.cep,
                "street": o.street,
                "number": o.number,
                "complement": o.complement,
                "neighborhood": o.neighborhood,
                "city": o.city,
                "state": o.state,
            },
            "items": [
                {
                    "id": it.id,
                    "product_id": it.product_id,
                    "variant_id": it.variant_id,
                    "quantity": it.quantity,
                    "unit_price": it.unit_price,
                    "line_total": it.line_total,
                    "product_name": it.product_name,
                    "variant_label": it.variant_label,
                    "image_url": it.image_url,
                }
                for it in o.items
            ],
        }
    )


@router.get("", response_model=list[OrderOut])
def get_orders(
    db: Session = Depends(get_db),
    user_out=Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    orders = list_orders(db, store_id=store.id, user_id=user_out.id, limit=limit, offset=offset)
    return [_serialize_order(o) for o in orders]


@router.get("/{order_id}", response_model=OrderOut)
def get_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    user_out=Depends(get_current_user),
    store_id: int | None = Query(default=None),
    store_slug: str | None = Query(default=None),
):
    store = resolve_store(db, store_id=store_id, store_slug=store_slug)
    o = get_order(db, store_id=store.id, user_id=user_out.id, order_id=order_id)
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    return _serialize_order(o)


@router.post("", response_model=OrderOut)
def create_new_order(
    payload: OrderCreateIn,
    db: Session = Depends(get_db),
    user_out=Depends(get_current_user),
):
    store = resolve_store(db, store_id=payload.store_id, store_slug=payload.store_slug)

    try:
        o = create_order(
            db,
            store_id=store.id,
            user_id=user_out.id,
            payload={
                "items": [it.model_dump() for it in payload.items],
                "address": payload.address.model_dump(),
                "shipping_service": payload.shipping_service,
                "shipping_price": payload.shipping_price,
                "shipping_eta_days": payload.shipping_eta_days,
                "coupon_code": payload.coupon_code,
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return _serialize_order(o)
