from __future__ import annotations

import logging
from typing import Literal

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.config import parse_store_cutover_map, parse_tenant_database_urls, settings
from app.models.store import Store

logger = logging.getLogger(__name__)


DbTarget = Literal["legacy", "core", "tenant"]


_legacy_engine: Engine | None = None
_core_engine: Engine | None = None
_tenant_engines: dict[str, Engine] = {}


def _build_engine(url: str) -> Engine:
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=1800,
        future=True,
    )


def get_legacy_engine() -> Engine:
    global _legacy_engine
    if _legacy_engine is None:
        _legacy_engine = _build_engine(settings.database_url)
    return _legacy_engine


def get_core_engine() -> Engine:
    global _core_engine
    if _core_engine is None:
        core_url = settings.database_url_core or settings.database_url
        _core_engine = _build_engine(core_url)
    return _core_engine


def get_tenant_engine(tenant_key: str) -> Engine | None:
    key = (tenant_key or "").strip().lower()
    if not key:
        return None
    if key in _tenant_engines:
        return _tenant_engines[key]

    mapping = parse_tenant_database_urls(settings.tenant_database_urls)
    url = mapping.get(key)
    if not url:
        return None
    engine = _build_engine(url)
    _tenant_engines[key] = engine
    return engine


def resolve_store_tenant_key(
    *,
    core_db: Session,
    store_id: int | None = None,
    store_slug: str | None = None,
) -> str | None:
    row = None
    if store_id:
        row = core_db.query(Store.id, Store.slug).filter(Store.id == int(store_id), Store.is_active == True).first()  # noqa: E712
    elif store_slug:
        slug = str(store_slug).strip().lower()
        row = core_db.query(Store.id, Store.slug).filter(Store.slug == slug, Store.is_active == True).first()  # noqa: E712
    if not row:
        return None
    return str(row.slug).strip().lower()


def choose_engine_for_store(
    *,
    store_id: int | None = None,
    store_slug: str | None = None,
) -> tuple[Engine, DbTarget, str]:
    if not settings.db_router_enabled:
        return get_legacy_engine(), "legacy", "router_disabled"

    with Session(get_core_engine()) as core_db:
        tenant_key = resolve_store_tenant_key(core_db=core_db, store_id=store_id, store_slug=store_slug)

    if tenant_key:
        cutover_map = parse_store_cutover_map(settings.store_db_cutover_map)
        default_target = (settings.db_router_default_target or "legacy").strip().lower()
        mode = cutover_map.get(tenant_key, default_target)
        if mode not in {"legacy", "tenant"}:
            mode = "legacy"

        if mode == "legacy":
            return get_legacy_engine(), "legacy", f"cutover_mode:{tenant_key}:legacy"

        tenant_engine = get_tenant_engine(tenant_key)
        if tenant_engine is not None:
            return tenant_engine, "tenant", f"cutover_mode:{tenant_key}:tenant"

        if settings.db_router_fallback_legacy:
            return get_legacy_engine(), "legacy", f"cutover_mode:{tenant_key}:tenant_missing"
        return get_core_engine(), "core", f"tenant_missing:{tenant_key}"

    if settings.db_router_fallback_legacy:
        return get_legacy_engine(), "legacy", "store_context_missing"
    return get_core_engine(), "core", "store_context_missing"


def log_db_route(*, target: DbTarget, reason: str, store_id: int | None, store_slug: str | None) -> None:
    if not settings.db_router_log:
        return
    logger.info(
        "db_router target=%s reason=%s store_id=%s store_slug=%s",
        target,
        reason,
        store_id,
        store_slug,
    )
