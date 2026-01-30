from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.coupon import Coupon, CouponRedemption


MONEY_Q = Decimal("0.01")


@dataclass
class CouponValidationResult:
    valid: bool
    coupon: Coupon | None = None
    discount: Decimal = Decimal("0.00")
    reason: str | None = None


def _now_utc_naive() -> datetime:
    # This project stores timestamps in UTC-naive.
    return datetime.utcnow()


def normalize_code(code: str) -> str:
    return (code or "").strip().upper()


def get_coupon_by_code(db: Session, store_id: int, code: str) -> Coupon | None:
    return (
        db.query(Coupon)
        .filter(Coupon.store_id == store_id, Coupon.code == normalize_code(code))
        .first()
    )


def create_coupon(db: Session, store_id: int, payload: dict) -> Coupon:
    kind = (payload.get("kind") or "").strip().lower()
    if kind not in ("percent", "fixed"):
        raise ValueError("Invalid coupon kind")

    code = normalize_code(payload.get("code") or "")
    if not code or " " in code:
        raise ValueError("Invalid coupon code")

    percent = Decimal(str(payload.get("percent") or 0)).quantize(Decimal("0.01"))
    amount = Decimal(str(payload.get("amount") or 0)).quantize(MONEY_Q, rounding=ROUND_HALF_UP)

    if kind == "percent":
        if percent <= 0 or percent > 100:
            raise ValueError("Percent must be between 0 and 100")
        amount = Decimal("0.00")
    else:
        if amount <= 0:
            raise ValueError("Amount must be > 0")
        percent = Decimal("0.00")

    expires_at = payload.get("expires_at")
    usage_limit_total = int(payload.get("usage_limit_total") or 0)
    usage_limit_per_user = int(payload.get("usage_limit_per_user") or 0)
    active = bool(payload.get("active", True))

    c = Coupon(
        store_id=store_id,
        code=code,
        kind=kind,
        percent=percent,
        amount=amount,
        expires_at=expires_at,
        usage_limit_total=usage_limit_total,
        usage_limit_per_user=usage_limit_per_user,
        active=active,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def update_coupon(db: Session, store_id: int, coupon_id: int, payload: dict) -> Coupon:
    c = db.query(Coupon).filter(Coupon.store_id == store_id, Coupon.id == coupon_id).first()
    if not c:
        raise ValueError("Coupon not found")

    if "code" in payload and payload["code"] is not None:
        code = normalize_code(payload["code"])
        if not code or " " in code:
            raise ValueError("Invalid coupon code")
        c.code = code

    if "kind" in payload and payload["kind"] is not None:
        kind = (payload["kind"] or "").strip().lower()
        if kind not in ("percent", "fixed"):
            raise ValueError("Invalid coupon kind")
        c.kind = kind

    if "expires_at" in payload:
        c.expires_at = payload["expires_at"]

    if "usage_limit_total" in payload and payload["usage_limit_total"] is not None:
        c.usage_limit_total = int(payload["usage_limit_total"])

    if "usage_limit_per_user" in payload and payload["usage_limit_per_user"] is not None:
        c.usage_limit_per_user = int(payload["usage_limit_per_user"])

    if "active" in payload and payload["active"] is not None:
        c.active = bool(payload["active"])

    # Re-validate monetary fields depending on kind
    if "percent" in payload and payload["percent"] is not None:
        c.percent = Decimal(str(payload["percent"])).quantize(Decimal("0.01"))
    if "amount" in payload and payload["amount"] is not None:
        c.amount = Decimal(str(payload["amount"])).quantize(MONEY_Q, rounding=ROUND_HALF_UP)

    if c.kind == "percent":
        if c.percent <= 0 or c.percent > 100:
            raise ValueError("Percent must be between 0 and 100")
        c.amount = Decimal("0.00")
    else:
        if c.amount <= 0:
            raise ValueError("Amount must be > 0")
        c.percent = Decimal("0.00")

    db.commit()
    db.refresh(c)
    return c


def deactivate_coupon(db: Session, store_id: int, coupon_id: int) -> Coupon:
    c = db.query(Coupon).filter(Coupon.store_id == store_id, Coupon.id == coupon_id).first()
    if not c:
        raise ValueError("Coupon not found")
    c.active = False
    db.commit()
    db.refresh(c)
    return c


def validate_coupon(
    db: Session,
    store_id: int,
    code: str,
    subtotal: Decimal,
    customer_id: int | None = None,
    *,
    lock_for_update: bool = False,
) -> CouponValidationResult:
    """Validates coupon against business rules and computes discount.

    IMPORTANT:
    - This function is authoritative; frontend must NOT compute discount.
    - subtotal must come from backend-authoritative cart valuation at order-creation time.
      For 'preview' flows, client may send subtotal, but order-creation must re-validate.
    """
    code_n = normalize_code(code)
    if not code_n:
        return CouponValidationResult(valid=False, reason="invalid_code")

    q = db.query(Coupon).filter(Coupon.store_id == store_id, Coupon.code == code_n)
    if lock_for_update:
        q = q.with_for_update()
    c = q.first()
    if not c:
        return CouponValidationResult(valid=False, reason="not_found")

    if not c.active:
        return CouponValidationResult(valid=False, reason="inactive")

    now = _now_utc_naive()
    if c.expires_at and now > c.expires_at:
        return CouponValidationResult(valid=False, reason="expired")

    # Total usage limit
    if c.usage_limit_total and c.used_count >= c.usage_limit_total:
        return CouponValidationResult(valid=False, reason="usage_limit_total_reached")

    # Per-user usage limit (requires authenticated customer)
    if c.usage_limit_per_user:
        if not customer_id:
            return CouponValidationResult(valid=False, reason="login_required")
        used_by_user = (
            db.query(func.count(CouponRedemption.id))
            .filter(
                CouponRedemption.store_id == store_id,
                CouponRedemption.coupon_id == c.id,
                CouponRedemption.customer_id == customer_id,
            )
            .scalar()
        )
        if int(used_by_user or 0) >= c.usage_limit_per_user:
            return CouponValidationResult(valid=False, reason="usage_limit_per_user_reached")

    subtotal = Decimal(str(subtotal or 0)).quantize(MONEY_Q, rounding=ROUND_HALF_UP)
    if subtotal <= 0:
        return CouponValidationResult(valid=False, reason="subtotal_zero")

    if c.kind == "percent":
        discount = (subtotal * (Decimal(str(c.percent)) / Decimal("100"))).quantize(MONEY_Q, rounding=ROUND_HALF_UP)
    else:
        discount = Decimal(str(c.amount)).quantize(MONEY_Q, rounding=ROUND_HALF_UP)

    if discount <= 0:
        return CouponValidationResult(valid=False, reason="discount_zero")

    if discount > subtotal:
        discount = subtotal

    return CouponValidationResult(valid=True, coupon=c, discount=discount, reason=None)


def redeem_coupon(
    db: Session,
    *,
    store_id: int,
    coupon: Coupon,
    customer_id: int,
    order_id: int,
    subtotal: Decimal,
    discount: Decimal,
) -> CouponRedemption:
    """Registers coupon usage.

    Must be called inside the same transaction that creates the order to avoid race conditions.
    """
    r = CouponRedemption(
        store_id=store_id,
        coupon_id=coupon.id,
        customer_id=customer_id,
        order_id=order_id,
        subtotal=Decimal(str(subtotal)).quantize(MONEY_Q, rounding=ROUND_HALF_UP),
        discount_amount=Decimal(str(discount)).quantize(MONEY_Q, rounding=ROUND_HALF_UP),
    )
    db.add(r)
    # Denormalized count (coupon row is expected to be locked FOR UPDATE by the caller).
    coupon.used_count = int(coupon.used_count or 0) + 1
    return r
