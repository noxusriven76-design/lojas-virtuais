from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.store import Store, StoreMember


def list_stores(db: Session) -> list[Store]:
    return db.query(Store).order_by(Store.id.desc()).all()


def create_store(db: Session, name: str, slug: str) -> Store:
    s = Store(name=name, slug=slug, is_active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def add_member(db: Session, store_id: int, user_id: int, role: str) -> StoreMember:
    m = StoreMember(store_id=store_id, user_id=user_id, role=role)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def get_member_role(db: Session, store_id: int, user_id: int) -> str | None:
    m = db.query(StoreMember).filter(StoreMember.store_id == store_id, StoreMember.user_id == user_id).first()
    return m.role if m else None


def list_members(db: Session, store_id: int) -> list[StoreMember]:
    return db.query(StoreMember).filter(StoreMember.store_id == store_id).order_by(StoreMember.id.desc()).all()


def remove_member(db: Session, store_id: int, user_id: int) -> bool:
    m = db.query(StoreMember).filter(StoreMember.store_id == store_id, StoreMember.user_id == user_id).first()
    if not m:
        return False
    db.delete(m)
    db.commit()
    return True
