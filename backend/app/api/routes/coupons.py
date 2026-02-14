from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user_optional, get_store_from_path
from app.core.permissions import require_coupons_manage
from app.repositories.utils import resolve_store
from app.repositories.coupons import (
    create_coupon,
    update_coupon,
    deactivate_coupon,
    validate_coupon,
)
from app.schemas.coupon import (
    CouponCreateIn,
    CouponUpdateIn,
    CouponOut,
    CouponValidateIn,
    CouponValidateOut,
)

router = APIRouter(prefix="/public/{store_slug}/coupons")


# ------------------------------
# Preferred (public-ish): path-based store context
#   /api/v1/public/{store_slug}/coupons/validate
# ------------------------------


# ------------------------------
# Public-ish: coupon validation
# ------------------------------
@router.post("/validate", response_model=CouponValidateOut)
def validate_coupon_for_checkout(
    payload: CouponValidateIn,
    store=Depends(get_store_from_path),
    db: Session = Depends(get_db),
    user_out=Depends(get_current_user_optional),
):
    user_id = user_out.id if user_out else None

    res = validate_coupon(
        db,
        store_id=store.id,
        code=payload.code,
        subtotal=Decimal(str(payload.subtotal)),
        user_id=user_id,
        lock_for_update=False,
    )

    return CouponValidateOut(
        valid=res.valid,
        code=res.coupon.code if res.valid and res.coupon else None,
        kind=res.coupon.kind if res.valid and res.coupon else None,
        discount=float(res.discount) if res.valid else 0.0,
        reason=res.reason if not res.valid else None,
    )


# ------------------------------
# Legacy (deprecated): body-based store context
#   /api/v1/coupons/validate
# ------------------------------
legacy_router = APIRouter()


@legacy_router.post("/coupons/validate", response_model=CouponValidateOut)
def legacy_validate_coupon_for_checkout(
    payload: CouponValidateIn,
    db: Session = Depends(get_db),
    user_out=Depends(get_current_user_optional),
):
    store = resolve_store(db, store_id=payload.store_id, store_slug=payload.store_slug)

    user_id = user_out.id if user_out else None

    res = validate_coupon(
        db,
        store_id=store.id,
        code=payload.code,
        subtotal=Decimal(str(payload.subtotal)),
        user_id=user_id,
        lock_for_update=False,
    )

    return CouponValidateOut(
        valid=res.valid,
        code=res.coupon.code if res.valid and res.coupon else None,
        kind=res.coupon.kind if res.valid and res.coupon else None,
        discount=float(res.discount) if res.valid else 0.0,
        reason=res.reason if not res.valid else None,
    )


# ------------------------------
# Admin: manage coupons
# ------------------------------
admin_router = APIRouter(prefix="/admin/stores/{store_id}/coupons")


@admin_router.post("", response_model=CouponOut)
def admin_create_coupon(
    store_id: int,
    payload: CouponCreateIn,
    db: Session = Depends(get_db),
    _=Depends(require_coupons_manage),
):
    try:
        c = create_coupon(db, store_id=store_id, payload=payload.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return CouponOut.model_validate(c)


@admin_router.put("/{coupon_id}", response_model=CouponOut)
def admin_update_coupon(
    store_id: int,
    coupon_id: int,
    payload: CouponUpdateIn,
    db: Session = Depends(get_db),
    _=Depends(require_coupons_manage),
):
    try:
        c = update_coupon(db, store_id=store_id, coupon_id=coupon_id, payload=payload.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return CouponOut.model_validate(c)


@admin_router.post("/{coupon_id}/deactivate", response_model=CouponOut)
def admin_deactivate_coupon(
    store_id: int,
    coupon_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_coupons_manage),
):
    try:
        c = deactivate_coupon(db, store_id=store_id, coupon_id=coupon_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return CouponOut.model_validate(c)
