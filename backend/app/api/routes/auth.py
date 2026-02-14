from __future__ import annotations

from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
import pyotp
from sqlalchemy.orm import Session

from app.core.auth_security import is_password_expired, login_rate_limiter, validate_password_policy
from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.repositories.users import (
    clear_login_failure_state,
    create_user,
    get_user_by_email,
    get_user_by_id,
    register_login_failure,
)
from app.schemas.auth import (
    ChangePasswordIn,
    RegisterIn,
    TokenOut,
    TwoFactorCodeIn,
    TwoFactorSetupOut,
)
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth")
logger = logging.getLogger("app.auth_security")


def _extract_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _is_account_locked(user: User) -> bool:
    if not user.locked_until:
        return False
    lock_until = user.locked_until
    if lock_until.tzinfo is None:
        lock_until = lock_until.replace(tzinfo=timezone.utc)
    else:
        lock_until = lock_until.astimezone(timezone.utc)
    return lock_until > datetime.now(timezone.utc)


@router.post("/login", response_model=TokenOut)
def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    otp_code: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    email = str(username or "").strip().lower()
    limiter_key = f"{_extract_client_ip(request)}:{email}"
    limiter = login_rate_limiter.check(limiter_key)
    if not limiter.allowed:
        logger.warning("login_rate_limited email=%s ip=%s retry_after=%s", email, _extract_client_ip(request), limiter.retry_after_seconds)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {limiter.retry_after_seconds}s.",
        )

    user = get_user_by_email(db, email=email)
    if not user or not verify_password(password, user.password_hash):
        if user:
            register_login_failure(
                db,
                user,
                max_attempts=settings.admin_login_max_failed_attempts,
                lock_minutes=settings.admin_login_lock_minutes,
            )
            db.commit()
        logger.warning("login_failed email=%s ip=%s", email, _extract_client_ip(request))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")

    if _is_account_locked(user):
        logger.warning("login_locked email=%s ip=%s", email, _extract_client_ip(request))
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account temporarily locked due to failed login attempts.",
        )

    if is_password_expired(user.password_changed_at):
        logger.warning("login_password_expired email=%s ip=%s", email, _extract_client_ip(request))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password expired. Change password before login.",
        )

    if user.two_factor_enabled:
        if not otp_code:
            logger.warning("login_missing_2fa email=%s ip=%s", email, _extract_client_ip(request))
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="2FA code required")
        totp = pyotp.TOTP(str(user.two_factor_secret or ""))
        if not totp.verify(str(otp_code).strip(), valid_window=1):
            register_login_failure(
                db,
                user,
                max_attempts=settings.admin_login_max_failed_attempts,
                lock_minutes=settings.admin_login_lock_minutes,
            )
            db.commit()
            logger.warning("login_invalid_2fa email=%s ip=%s", email, _extract_client_ip(request))
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code")

    clear_login_failure_state(db, user)
    db.commit()
    logger.info("login_success user_id=%s email=%s ip=%s", user.id, email, _extract_client_ip(request))

    token = create_access_token(
        subject=str(user.id),
        extra_claims={"is_superuser": user.is_superuser, "tv": int(user.token_version or 0)},
    )
    return TokenOut(access_token=token)


@router.post("/register", response_model=UserOut)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    existing = get_user_by_email(db, email=payload.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    is_valid, reason = validate_password_policy(payload.password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=reason or "Weak password")
    u = create_user(db, email=payload.email, password_hash=hash_password(payload.password), name=payload.name)
    return UserOut.model_validate(u)


@router.post("/change-password")
def change_password(
    payload: ChangePasswordIn,
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
):
    row = get_user_by_id(db, user.id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(payload.current_password, row.password_hash):
        raise HTTPException(status_code=400, detail="Current password is invalid")
    is_valid, reason = validate_password_policy(payload.new_password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=reason or "Weak password")

    row.password_hash = hash_password(payload.new_password)
    row.password_changed_at = datetime.now(timezone.utc)
    row.token_version = int(row.token_version or 0) + 1
    db.add(row)
    db.commit()
    return {"ok": True}


@router.post("/logout-all")
def logout_all_sessions(
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
):
    row = get_user_by_id(db, user.id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    row.token_version = int(row.token_version or 0) + 1
    db.add(row)
    db.commit()
    return {"ok": True}


@router.get("/2fa/setup", response_model=TwoFactorSetupOut)
def setup_2fa(
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
):
    row = get_user_by_id(db, user.id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    secret = str(row.two_factor_secret or pyotp.random_base32())
    row.two_factor_secret = secret
    db.add(row)
    db.commit()

    issuer = settings.app_name or "Loja Platform"
    otp_url = pyotp.TOTP(secret).provisioning_uri(name=row.email, issuer_name=issuer)
    return TwoFactorSetupOut(two_factor_enabled=bool(row.two_factor_enabled), secret=secret, otpauth_url=otp_url)


@router.post("/2fa/enable")
def enable_2fa(
    payload: TwoFactorCodeIn,
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
):
    row = get_user_by_id(db, user.id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    if not row.two_factor_secret:
        raise HTTPException(status_code=400, detail="2FA setup not initialized")
    totp = pyotp.TOTP(str(row.two_factor_secret))
    if not totp.verify(str(payload.code).strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")
    row.two_factor_enabled = True
    db.add(row)
    db.commit()
    return {"ok": True, "two_factor_enabled": True}


@router.post("/2fa/disable")
def disable_2fa(
    payload: TwoFactorCodeIn,
    db: Session = Depends(get_db),
    user: UserOut = Depends(get_current_user),
):
    row = get_user_by_id(db, user.id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    if not row.two_factor_enabled or not row.two_factor_secret:
        return {"ok": True, "two_factor_enabled": False}
    totp = pyotp.TOTP(str(row.two_factor_secret))
    if not totp.verify(str(payload.code).strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")
    row.two_factor_enabled = False
    db.add(row)
    db.commit()
    return {"ok": True, "two_factor_enabled": False}


@router.get("/me", response_model=UserOut)
def me(user: UserOut = Depends(get_current_user)):
    return user
