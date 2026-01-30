from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.models.catalog import Product, ProductVariant
from app.models.order import Order, OrderItem
from app.repositories.coupons import validate_coupon, redeem_coupon


def list_orders(db: Session, store_id: int, customer_id: int, limit: int = 20, offset: int = 0) -> list[Order]:
    return (
        db.query(Order)
        .filter(Order.store_id == store_id, Order.customer_id == customer_id)
        .order_by(Order.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )


def get_order(db: Session, store_id: int, customer_id: int, order_id: int) -> Order | None:
    return (
        db.query(Order)
        .filter(Order.store_id == store_id, Order.customer_id == customer_id, Order.id == order_id)
        .first()
    )


def create_order(db: Session, store_id: int, customer_id: int, payload: dict) -> Order:
    items_in = payload["items"]
    addr = payload["address"]

    # Strategy (race-condition mitigation): wrap stock check + decrement + order creation in ONE transaction
    # and lock the ProductVariant rows with SELECT ... FOR UPDATE. This prevents concurrent requests from
    # seeing the same stock and overselling.
    order_items: list[OrderItem] = []
    money_q = Decimal("0.01")
    subtotal = Decimal("0.00")

    with db.begin():
        for it in items_in:
            qty = int(it["quantity"])
            if qty <= 0:
                raise ValueError("Invalid quantity")

            variant_id = int(it["variant_id"])
            product_id = int(it["product_id"])

            # Row-level lock (when supported by the DB engine, e.g., MySQL/InnoDB).
            variant = (
                db.query(ProductVariant)
                .filter(ProductVariant.store_id == store_id, ProductVariant.id == variant_id)
                .with_for_update()
                .one_or_none()
            )
            if not variant or not variant.active:
                raise ValueError(f"Variant not found/active: {it['variant_id']}")

            product = (
                db.query(Product)
                .filter(Product.store_id == store_id, Product.id == product_id)
                .one_or_none()
            )
            if not product:
                raise ValueError(f"Product not found: {it['product_id']}")

            if variant.product_id != product.id:
                raise ValueError("Variant does not belong to product")

            if variant.stock < qty:
                raise ValueError("Insufficient stock")

            # Decrement while the row is locked; commit happens when the context exits.
            variant.stock -= qty

            # Keep all monetary math in Decimal.
            unit_price = (Decimal(str(variant.price))).quantize(money_q, rounding=ROUND_HALF_UP)
            line_total = (unit_price * Decimal(qty)).quantize(money_q, rounding=ROUND_HALF_UP)
            subtotal = (subtotal + line_total).quantize(money_q, rounding=ROUND_HALF_UP)

            variant_label = f"{variant.color} / {variant.size}".strip(" /")

            order_items.append(
                OrderItem(
                    store_id=store_id,
                    product_id=product.id,
                    variant_id=variant.id,
                    quantity=qty,
                    unit_price=unit_price,
                    line_total=line_total,
                    product_name=product.name,
                    variant_label=variant_label,
                    image_url=product.image_url,
                )
            )

        discount = Decimal("0.00").quantize(money_q, rounding=ROUND_HALF_UP)

        coupon_code = payload.get("coupon_code")
        coupon = None
        if coupon_code:
            # Lock coupon row FOR UPDATE to enforce usage limits safely under concurrency.
            res = validate_coupon(
                db,
                store_id=store_id,
                code=str(coupon_code),
                subtotal=subtotal,
                customer_id=customer_id,
                lock_for_update=True,
            )
            if not res.valid or not res.coupon:
                raise ValueError(f"Invalid coupon: {res.reason}")
            coupon = res.coupon
            discount = res.discount

        shipping_price = Decimal(str(payload.get("shipping_price", 0.0))).quantize(money_q, rounding=ROUND_HALF_UP)

        total = (subtotal - discount)
        if total < 0:
            total = Decimal("0.00")
        total = (total + shipping_price).quantize(money_q, rounding=ROUND_HALF_UP)

        o = Order(
            store_id=store_id,
            customer_id=customer_id,
            coupon_id=coupon.id if coupon else None,
            coupon_code=(coupon.code if coupon else ""),
            status="created",
            shipping_service=payload.get("shipping_service", ""),
            shipping_price=shipping_price,
            shipping_eta_days=int(payload.get("shipping_eta_days", 0)),
            subtotal=subtotal,
            discount=discount,
            total=total,
            recipient_name=addr["recipient_name"],
            phone=addr["phone"],
            cep=addr["cep"],
            street=addr["street"],
            number=addr.get("number", ""),
            complement=addr.get("complement", ""),
            neighborhood=addr["neighborhood"],
            city=addr["city"],
            state=addr["state"],
            items=order_items,
        )
        db.add(o)
        db.flush()  # ensure o.id is available inside the transaction

        if coupon:
            redeem_coupon(
                db,
                store_id=store_id,
                coupon=coupon,
                customer_id=customer_id,
                order_id=o.id,
                subtotal=subtotal,
                discount=discount,
            )

    # Order is committed at this point (or rolled back on any exception above).
    db.refresh(o)
    return o
