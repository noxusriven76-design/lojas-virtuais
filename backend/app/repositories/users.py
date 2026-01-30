from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.user import User


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def create_user(db: Session, email: str, password_hash: str, name: str, is_superuser: bool = False) -> User:
    u = User(email=email, password_hash=password_hash, name=name, is_superuser=is_superuser)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u
