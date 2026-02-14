from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.user import User
from app.models.store import Store


def bootstrap(db: Session) -> None:
    """Creates an initial superuser and the minimum set of stores.

    Safe to run multiple times. Intended only for dev/local.
    """

    # superuser
    desired_email = "admin@local.com"
    su = db.query(User).filter(User.email == desired_email).first()
    if not su:
        old = db.query(User).filter(User.email == "admin@local").first()
        if old:
            old.email = desired_email
            if not old.is_superuser:
                old.is_superuser = True
            su = old
            db.add(old)
            db.commit()
            db.refresh(old)
        else:
            su = User(email=desired_email, password_hash=hash_password("admin123"), name="Master", is_superuser=True)
            db.add(su)
            db.commit()
            db.refresh(su)

    if su and not su.is_superuser:
        su.is_superuser = True
        db.add(su)
        db.commit()
        db.refresh(su)

    # stores (minimal required set)
    wanted = [
        ("Loja de Roupas", "roupas"),
        ("Loja de Relógios", "relogios"),
        ("Loja Agro", "agro"),
    ]
    for name, slug in wanted:
        s = db.query(Store).filter(Store.slug == slug).first()
        if not s:
            db.add(Store(name=name, slug=slug, is_active=True))
    db.commit()
