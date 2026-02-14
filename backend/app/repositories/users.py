from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.user import User


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def create_user(db: Session, email: str, password_hash: str, name: str, is_superuser: bool = False) -> User:
    u = User(
        email=email,
        password_hash=password_hash,
        name=name,
        is_superuser=is_superuser,
        password_changed_at=datetime.now(timezone.utc),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def register_login_failure(db: Session, user: User, max_attempts: int, lock_minutes: int) -> User:
    user.failed_login_attempts = int(user.failed_login_attempts or 0) + 1
    if user.failed_login_attempts >= max_attempts:
        user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=max(1, int(lock_minutes)))
    db.add(user)
    db.flush()
    return user


def clear_login_failure_state(db: Session, user: User) -> User:
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = datetime.now(timezone.utc)
    db.add(user)
    db.flush()
    return user
