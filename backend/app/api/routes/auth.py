from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.repositories.users import get_user_by_email, create_user
from app.schemas.auth import TokenOut, RegisterIn
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth")


@router.post("/login", response_model=TokenOut)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = get_user_by_email(db, email=form_data.username)
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")

    token = create_access_token(subject=str(user.id), extra_claims={"is_superuser": user.is_superuser})
    return TokenOut(access_token=token)


@router.post("/register", response_model=UserOut)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    existing = get_user_by_email(db, email=payload.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    u = create_user(db, email=payload.email, password_hash=hash_password(payload.password), name=payload.name)
    return UserOut.model_validate(u)


@router.get("/me", response_model=UserOut)
def me(user: UserOut = Depends(get_current_user)):
    return user
