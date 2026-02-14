from __future__ import annotations

import json

from sqlalchemy import create_engine, text

from app.core.config import parse_store_cutover_map, parse_tenant_database_urls, settings


def _check_env() -> list[str]:
    issues: list[str] = []

    if not settings.db_router_enabled:
        issues.append("DB_ROUTER_ENABLED must be true in post-cutover mode")
    if (settings.db_router_default_target or "").strip().lower() != "tenant":
        issues.append("DB_ROUTER_DEFAULT_TARGET should be tenant")
    if settings.db_router_fallback_legacy:
        issues.append("DB_ROUTER_FALLBACK_LEGACY should be false")

    return issues


def _active_store_slugs(core_url: str) -> list[str]:
    engine = create_engine(core_url, future=True, pool_pre_ping=True)
    query = text("SELECT slug FROM stores WHERE is_active = 1")
    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()
    return [str(row[0]).strip().lower() for row in rows if row and row[0]]


def _check_store_maps(slugs: list[str]) -> list[str]:
    issues: list[str] = []
    tenant_urls = parse_tenant_database_urls(settings.tenant_database_urls)
    cutover_map = parse_store_cutover_map(settings.store_db_cutover_map)

    for slug in slugs:
        if slug not in tenant_urls:
            issues.append(f"missing tenant DB url for active store slug='{slug}'")
        mode = cutover_map.get(slug)
        if mode == "legacy":
            issues.append(f"active store slug='{slug}' still marked as legacy in STORE_DB_CUTOVER_MAP")

    return issues


def main() -> None:
    core_url = settings.database_url_core or settings.database_url
    slugs = _active_store_slugs(core_url)

    issues: list[str] = []
    issues.extend(_check_env())
    issues.extend(_check_store_maps(slugs))

    if issues:
        print(json.dumps({"result": "failed", "issues": issues}, ensure_ascii=False))
        raise SystemExit(2)

    print(json.dumps({"result": "ok", "active_stores": slugs}, ensure_ascii=False))


if __name__ == "__main__":
    main()
