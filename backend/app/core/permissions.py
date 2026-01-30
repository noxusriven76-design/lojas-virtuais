from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.repositories.stores import get_member_role
from app.schemas.user import UserOut


def require_store_member(
    store_id: int,
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
) -> str:
    """Returns role if the user is a member of store."""
    if user.is_superuser:
        return "superuser"
    role = get_member_role(db, store_id=store_id, user_id=user.id)
    if not role:
        raise HTTPException(status_code=403, detail="Forbidden")
    return role


def require_store_manager(
    store_id: int,
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
) -> str:
    role = require_store_member(store_id=store_id, db=db, user=user)
    if role in ("superuser", "owner", "manager"):
        return role
    raise HTTPException(status_code=403, detail="Insufficient role")
