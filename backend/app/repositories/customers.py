from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.customer import Customer
from app.models.user import User


def get_customer(db: Session, store_id: int, customer_id: int) -> Customer | None:
    return db.query(Customer).filter(Customer.store_id == store_id, Customer.id == customer_id).first()


def get_customer_for_user(db: Session, store_id: int, user_id: int) -> Customer | None:
    return (
        db.query(Customer)
        .filter(Customer.store_id == store_id, Customer.user_id == user_id)
        .first()
    )


def get_or_create_customer_for_user(db: Session, store_id: int, user: User) -> Customer:
    c = get_customer_for_user(db, store_id=store_id, user_id=user.id)
    if c:
        # keep customer info up to date
        if user.email and c.email != user.email:
            c.email = user.email
        if user.name and c.name != user.name:
            c.name = user.name
        db.commit()
        db.refresh(c)
        return c

    c = Customer(store_id=store_id, user_id=user.id, email=user.email, name=user.name, phone="")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def upsert_customer_by_email(db: Session, store_id: int, email: str, name: str = "", phone: str = "") -> Customer:
    c = db.query(Customer).filter(Customer.store_id == store_id, Customer.email == email).first()
    if c:
        if name:
            c.name = name
        if phone:
            c.phone = phone
        db.commit()
        db.refresh(c)
        return c
    c = Customer(store_id=store_id, email=email, name=name, phone=phone)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c
