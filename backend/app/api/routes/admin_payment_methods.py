from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.deps import get_current_user, get_db
from app.core.permissions import require_payments_read, require_payments_write
from app.models.payment import StorePaymentMethod
from app.models.store import Store
from app.schemas.payment_method import (
    ALLOWED_PAYMENT_METHOD_CODES,
    StorePaymentMethodCreateIn,
    StorePaymentMethodListOut,
    StorePaymentMethodOut,
    StorePaymentMethodReorderIn,
    StorePaymentMethodUpdateIn,
    normalize_payment_method_code,
)
from app.schemas.user import UserOut

router = APIRouter(prefix="/admin/stores/{store_id}")


def _ensure_store(db: Session, store_id: int) -> Store:
    store = db.query(Store).filter(Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


def _validate_payload(payload: StorePaymentMethodCreateIn | StorePaymentMethodUpdateIn, *, code: str | None = None) -> str:
    payment_code = normalize_payment_method_code(code or getattr(payload, "code", ""))
    if payment_code and payment_code not in ALLOWED_PAYMENT_METHOD_CODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid payment method code. Allowed values: {', '.join(sorted(ALLOWED_PAYMENT_METHOD_CODES))}",
        )
    min_amount = getattr(payload, "min_amount", None)
    max_amount = getattr(payload, "max_amount", None)
    if min_amount is not None and max_amount is not None and min_amount > max_amount:
        raise HTTPException(status_code=400, detail="min_amount cannot be greater than max_amount")
    return payment_code


@router.get("/payment-methods", response_model=StorePaymentMethodListOut)
def list_store_payment_methods(
    store_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_payments_read),
):
    _ensure_store(db, store_id=store_id)
    rows = (
        db.query(StorePaymentMethod)
        .filter(StorePaymentMethod.store_id == store_id)
        .order_by(StorePaymentMethod.sort_order.asc(), StorePaymentMethod.id.asc())
        .all()
    )
    return StorePaymentMethodListOut(items=[StorePaymentMethodOut.model_validate(row) for row in rows], total=len(rows))


@router.post("/payment-methods", response_model=StorePaymentMethodOut)
def create_store_payment_method(
    store_id: int,
    payload: StorePaymentMethodCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_payments_write),
    user: UserOut = Depends(get_current_user),
):
    _ensure_store(db, store_id=store_id)
    code = _validate_payload(payload)
    duplicate = (
        db.query(StorePaymentMethod)
        .filter(StorePaymentMethod.store_id == store_id, StorePaymentMethod.code == code)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="Payment method code already configured for this store")

    row = StorePaymentMethod(
        store_id=store_id,
        code=code,
        label=payload.label.strip(),
        is_active=payload.is_active,
        sort_order=payload.sort_order,
        min_amount=payload.min_amount,
        max_amount=payload.max_amount,
        installments_max=payload.installments_max,
        fee_percent=payload.fee_percent,
        settlement_days=payload.settlement_days,
        metadata_json=payload.metadata_json,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="payment.method.create",
        entity_type="store_payment_method",
        entity_id=row.id,
        before_data=None,
        after_data={
            "code": row.code,
            "label": row.label,
            "is_active": row.is_active,
            "sort_order": row.sort_order,
        },
    )
    db.commit()
    db.refresh(row)
    return StorePaymentMethodOut.model_validate(row)


@router.patch("/payment-methods/{method_id:int}", response_model=StorePaymentMethodOut)
def update_store_payment_method(
    store_id: int,
    method_id: int,
    payload: StorePaymentMethodUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_payments_write),
    user: UserOut = Depends(get_current_user),
):
    _ensure_store(db, store_id=store_id)
    row = (
        db.query(StorePaymentMethod)
        .filter(StorePaymentMethod.store_id == store_id, StorePaymentMethod.id == method_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Payment method not found")

    _validate_payload(payload, code=row.code)
    before_data = {
        "label": row.label,
        "is_active": row.is_active,
        "sort_order": row.sort_order,
        "min_amount": row.min_amount,
        "max_amount": row.max_amount,
        "installments_max": row.installments_max,
        "fee_percent": row.fee_percent,
        "settlement_days": row.settlement_days,
        "metadata_json": row.metadata_json,
    }

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    db.add(row)
    db.flush()
    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="payment.method.update",
        entity_type="store_payment_method",
        entity_id=row.id,
        before_data=before_data,
        after_data=updates,
    )
    db.commit()
    db.refresh(row)
    return StorePaymentMethodOut.model_validate(row)


@router.post("/payment-methods/reorder", response_model=StorePaymentMethodListOut)
def reorder_store_payment_methods(
    store_id: int,
    payload: StorePaymentMethodReorderIn,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_payments_write),
    user: UserOut = Depends(get_current_user),
):
    _ensure_store(db, store_id=store_id)
    if not payload.items:
        raise HTTPException(status_code=400, detail="No reorder items provided")

    ids = [item.id for item in payload.items]
    rows = (
        db.query(StorePaymentMethod)
        .filter(StorePaymentMethod.store_id == store_id, StorePaymentMethod.id.in_(ids))
        .all()
    )
    if len(rows) != len(set(ids)):
        raise HTTPException(status_code=404, detail="One or more payment methods not found for this store")

    row_by_id = {row.id: row for row in rows}
    before_data = [{"id": row.id, "sort_order": row.sort_order} for row in rows]

    for item in payload.items:
        row = row_by_id[item.id]
        row.sort_order = item.sort_order
        row.updated_at = datetime.utcnow()
        db.add(row)

    db.flush()
    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="payment.method.reorder",
        entity_type="store_payment_method",
        entity_id=store_id,
        before_data={"items": before_data},
        after_data={"items": [item.model_dump() for item in payload.items]},
    )
    db.commit()

    ordered = (
        db.query(StorePaymentMethod)
        .filter(StorePaymentMethod.store_id == store_id)
        .order_by(StorePaymentMethod.sort_order.asc(), StorePaymentMethod.id.asc())
        .all()
    )
    return StorePaymentMethodListOut(items=[StorePaymentMethodOut.model_validate(row) for row in ordered], total=len(ordered))


@router.delete("/payment-methods/{method_id:int}")
def delete_store_payment_method(
    store_id: int,
    method_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _=Depends(require_payments_write),
    user: UserOut = Depends(get_current_user),
):
    _ensure_store(db, store_id=store_id)
    row = (
        db.query(StorePaymentMethod)
        .filter(StorePaymentMethod.store_id == store_id, StorePaymentMethod.id == method_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Payment method not found")
    before_data = {
        "id": row.id,
        "code": row.code,
        "label": row.label,
        "is_active": row.is_active,
        "sort_order": row.sort_order,
    }
    db.delete(row)
    write_audit_log(
        db,
        request=request,
        user=user,
        store_id=store_id,
        action="payment.method.delete",
        entity_type="store_payment_method",
        entity_id=method_id,
        before_data=before_data,
        after_data=None,
    )
    db.commit()
    return {"ok": True}

