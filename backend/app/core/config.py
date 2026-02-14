from pathlib import Path
import json

from pydantic_settings import BaseSettings
from pydantic import Field


BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = Field(default="Loja Platform API", alias="APP_NAME")
    env: str = Field(default="dev", alias="ENV")
    debug: bool = Field(default=True, alias="DEBUG")

    database_url: str = Field(alias="DATABASE_URL")
    database_url_core: str | None = Field(default=None, alias="DATABASE_URL_CORE")
    tenant_database_urls: str = Field(default="", alias="TENANT_DATABASE_URLS")
    db_router_enabled: bool = Field(default=False, alias="DB_ROUTER_ENABLED")
    db_router_log: bool = Field(default=True, alias="DB_ROUTER_LOG")
    db_router_fallback_legacy: bool = Field(default=True, alias="DB_ROUTER_FALLBACK_LEGACY")
    db_router_default_target: str = Field(default="legacy", alias="DB_ROUTER_DEFAULT_TARGET")
    store_db_cutover_map: str = Field(default="", alias="STORE_DB_CUTOVER_MAP")

    jwt_secret_key: str = Field(alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=60, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    admin_password_min_length: int = Field(default=8, alias="ADMIN_PASSWORD_MIN_LENGTH")
    admin_password_max_age_days: int = Field(default=0, alias="ADMIN_PASSWORD_MAX_AGE_DAYS")
    admin_login_max_failed_attempts: int = Field(default=5, alias="ADMIN_LOGIN_MAX_FAILED_ATTEMPTS")
    admin_login_lock_minutes: int = Field(default=15, alias="ADMIN_LOGIN_LOCK_MINUTES")
    admin_login_rate_limit_window_seconds: int = Field(default=60, alias="ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS")
    admin_login_rate_limit_max_attempts: int = Field(default=15, alias="ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS")
    payment_webhook_secrets: str = Field(default="", alias="PAYMENT_WEBHOOK_SECRETS")

    cors_origins: str = Field(default="", alias="CORS_ORIGINS")
    uploads_dir: str = Field(default=str(BACKEND_ROOT / "uploads"), alias="UPLOADS_DIR")
    uploads_base_url: str = Field(default="/static/uploads", alias="UPLOADS_BASE_URL")
    uploads_max_size_bytes: int = Field(default=5 * 1024 * 1024, alias="UPLOADS_MAX_SIZE_BYTES")

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()


def parse_tenant_database_urls(raw: str) -> dict[str, str]:
    value = (raw or "").strip()
    if not value:
        return {}

    # Preferred format:
    # TENANT_DATABASE_URLS='{"roupas":"mysql+pymysql://...","agro":"mysql+pymysql://..."}'
    try:
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            out: dict[str, str] = {}
            for k, v in parsed.items():
                key = str(k).strip().lower()
                url = str(v).strip()
                if key and url:
                    out[key] = url
            if out:
                return out
    except Exception:
        pass

    # Fallback format:
    # TENANT_DATABASE_URLS='roupas=mysql+pymysql://...;agro=mysql+pymysql://...'
    out: dict[str, str] = {}
    chunks = [chunk.strip() for chunk in value.replace(",", ";").split(";")]
    for chunk in chunks:
        if "=" not in chunk:
            continue
        key, url = chunk.split("=", 1)
        key = key.strip().lower()
        url = url.strip()
        if key and url:
            out[key] = url
    return out


def parse_store_cutover_map(raw: str) -> dict[str, str]:
    value = (raw or "").strip()
    if not value:
        return {}

    allowed = {"legacy", "tenant"}

    # Preferred JSON:
    # STORE_DB_CUTOVER_MAP='{"agro":"tenant","roupas":"legacy"}'
    try:
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            out: dict[str, str] = {}
            for k, v in parsed.items():
                key = str(k).strip().lower()
                mode = str(v).strip().lower()
                if key and mode in allowed:
                    out[key] = mode
            if out:
                return out
    except Exception:
        pass

    # Fallback:
    # STORE_DB_CUTOVER_MAP='agro=tenant;roupas=legacy'
    out: dict[str, str] = {}
    chunks = [chunk.strip() for chunk in value.replace(",", ";").split(";")]
    for chunk in chunks:
        if "=" not in chunk:
            continue
        key, mode = chunk.split("=", 1)
        key = key.strip().lower()
        mode = mode.strip().lower()
        if key and mode in allowed:
            out[key] = mode
    return out


def parse_payment_webhook_secrets(raw: str) -> dict[str, str]:
    value = (raw or "").strip()
    if not value:
        return {}

    # Preferred JSON:
    # PAYMENT_WEBHOOK_SECRETS='{"mercadopago":"secret-a","stripe":"secret-b"}'
    try:
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            out: dict[str, str] = {}
            for k, v in parsed.items():
                key = str(k).strip().lower()
                secret = str(v).strip()
                if key and secret:
                    out[key] = secret
            if out:
                return out
    except Exception:
        pass

    # Fallback:
    # PAYMENT_WEBHOOK_SECRETS='mercadopago=secret-a;stripe=secret-b'
    out: dict[str, str] = {}
    chunks = [chunk.strip() for chunk in value.replace(",", ";").split(";")]
    for chunk in chunks:
        if "=" not in chunk:
            continue
        key, secret = chunk.split("=", 1)
        key = key.strip().lower()
        secret = secret.strip()
        if key and secret:
            out[key] = secret
    return out
