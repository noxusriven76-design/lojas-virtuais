from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.address import Address


def list_addresses(db: Session, store_id: int, customer_id: int) -> list[Address]:
    return (
        db.query(Address)
        .filter(Address.store_id == store_id, Address.customer_id == customer_id)
        .order_by(Address.id.desc())
        .all()
    )


def get_address(db: Session, store_id: int, customer_id: int, address_id: int) -> Address | None:
    return (
        db.query(Address)
        .filter(
            Address.store_id == store_id,
            Address.customer_id == customer_id,
            Address.id == address_id,
        )
        .first()
    )


def create_address(db: Session, store_id: int, customer_id: int, data: dict) -> Address:
    if data.get("is_default"):
        db.query(Address).filter(Address.store_id == store_id, Address.customer_id == customer_id).update(
            {"is_default": False}
        )

    a = Address(store_id=store_id, customer_id=customer_id, **data)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def update_address(db: Session, store_id: int, customer_id: int, address_id: int, data: dict) -> Address | None:
    a = get_address(db, store_id, customer_id, address_id)
    if not a:
        return None

    if data.get("is_default") is True:
        db.query(Address).filter(Address.store_id == store_id, Address.customer_id == customer_id).update(
            {"is_default": False}
        )

    for k, v in data.items():
        setattr(a, k, v)

    db.commit()
    db.refresh(a)
    return a


def delete_address(db: Session, store_id: int, customer_id: int, address_id: int) -> bool:
    a = get_address(db, store_id, customer_id, address_id)
    if not a:
        return False
    db.delete(a)
    db.commit()
    return True
