from __future__ import annotations

from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import SessionLocal
from app.repositories.users import get_user_by_id
from app.repositories.utils import get_store_by_slug
from app.schemas.user import UserOut

# Swagger "Authorize" flow must point at the versioned login endpoint.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme),
) -> UserOut:
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if not sub:
            raise ValueError("Token missing subject")
        user_id = int(sub)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = get_user_by_id(db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return UserOut.model_validate(user)


def get_current_user_optional(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> UserOut | None:
    """Best-effort auth.

    Used for public endpoints that can provide richer validation when a user is authenticated,
    but must also work without credentials.

    Returns None when:
    - Authorization header is missing
    - Token is invalid/expired
    - User not found
    """
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1]
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if not sub:
            return None
        user_id = int(sub)
    except Exception:
        return None

    user = get_user_by_id(db, user_id=user_id)
    if not user:
        return None
    return UserOut.model_validate(user)


def require_superuser(user: UserOut = Depends(get_current_user)) -> UserOut:
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def get_store_context(
    x_store_id: str | None = Header(default=None, alias="X-Store-Id"),
    x_store_slug: str | None = Header(default=None, alias="X-Store-Slug"),
):
    """Optional store hints via headers.

    Public endpoints also accept ?store_id / ?store_slug query params.
    Panels typically set X-Store-Id.
    """
    return {"store_id": x_store_id, "store_slug": x_store_slug}


def get_store_from_path(
    store_slug: str,
    db: Session = Depends(get_db),
):
    """Mandatory store resolution using a slug in the URL path.

    - Returns 404 when the slug does not map to an active store.
    - Avoids any implicit fallback logic.
    """
    s = get_store_by_slug(db, store_slug=store_slug, active_only=True)
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
    return s
