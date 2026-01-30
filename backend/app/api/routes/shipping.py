from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_store_from_path
from app.repositories.utils import resolve_store
from app.models.catalog import ProductVariant
from app.schemas.shipping import ShippingQuoteIn, ShippingQuoteOut, ShippingOptionOut


def _normalize_cep(cep: str) -> str:
    return "".join([c for c in cep if c.isdigit()])


# ------------------------------
# Preferred: path-based store context
#   /api/v1/public/{store_slug}/shipping/quote
# ------------------------------
router = APIRouter(prefix="/public/{store_slug}/shipping")


@router.post("/quote", response_model=ShippingQuoteOut)
def quote_public(
    payload: ShippingQuoteIn,
    store=Depends(get_store_from_path),
    db: Session = Depends(get_db),
):
    cep = _normalize_cep(payload.cep)

    total_qty = 0
    for it in payload.items:
        v = (
            db.query(ProductVariant)
            .filter(ProductVariant.store_id == store.id, ProductVariant.id == it.variant_id)
            .one_or_none()
        )
        if not v or not v.active:
            return ShippingQuoteOut(cep=cep, options=[])
        total_qty += int(it.quantity)

    money_q = Decimal("0.01")
    if cep.startswith(("0", "1")):
        region_factor = Decimal("1.0")
    elif cep.startswith(("2", "3", "4")):
        region_factor = Decimal("1.15")
    else:
        region_factor = Decimal("1.25")

    base = (Decimal("12.0") * region_factor).quantize(money_q, rounding=ROUND_HALF_UP)
    per_item = (Decimal("2.0") * Decimal(total_qty)).quantize(money_q, rounding=ROUND_HALF_UP)

    pac_price = (base + per_item).quantize(money_q, rounding=ROUND_HALF_UP)
    exp_price = ((base + per_item) * Decimal("1.5")).quantize(money_q, rounding=ROUND_HALF_UP)

    options = [
        ShippingOptionOut(service="PAC", price=pac_price, eta_days=6),
        ShippingOptionOut(service="EXPRESS", price=exp_price, eta_days=3),
    ]
    return ShippingQuoteOut(cep=cep, options=options)


# ------------------------------
# Legacy (deprecated): body-based store context
#   /api/v1/shipping/quote
# ------------------------------
legacy_router = APIRouter(prefix="/shipping")


@legacy_router.post("/quote", response_model=ShippingQuoteOut)
def quote(payload: ShippingQuoteIn, db: Session = Depends(get_db)):
    store = resolve_store(db, store_id=payload.store_id, store_slug=payload.store_slug)
    cep = _normalize_cep(payload.cep)

    total_qty = 0
    for it in payload.items:
        v = (
            db.query(ProductVariant)
            .filter(ProductVariant.store_id == store.id, ProductVariant.id == it.variant_id)
            .one_or_none()
        )
        if not v or not v.active:
            return ShippingQuoteOut(cep=cep, options=[])
        total_qty += int(it.quantity)

    money_q = Decimal("0.01")
    if cep.startswith(("0", "1")):
        region_factor = Decimal("1.0")
    elif cep.startswith(("2", "3", "4")):
        region_factor = Decimal("1.15")
    else:
        region_factor = Decimal("1.25")

    base = (Decimal("12.0") * region_factor).quantize(money_q, rounding=ROUND_HALF_UP)
    per_item = (Decimal("2.0") * Decimal(total_qty)).quantize(money_q, rounding=ROUND_HALF_UP)

    pac_price = (base + per_item).quantize(money_q, rounding=ROUND_HALF_UP)
    exp_price = ((base + per_item) * Decimal("1.5")).quantize(money_q, rounding=ROUND_HALF_UP)

    options = [
        ShippingOptionOut(service="PAC", price=pac_price, eta_days=6),
        ShippingOptionOut(service="EXPRESS", price=exp_price, eta_days=3),
    ]
    return ShippingQuoteOut(cep=cep, options=options)
