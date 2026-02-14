from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Any

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import NoSuchTableError


TENANT_TABLE_ORDER = [
    "categories",
    "products",
    "product_images",
    "product_variants",
    "coupons",
    "coupon_redemptions",
    "customers",
    "addresses",
    "favorites",
    "orders",
    "order_items",
    "store_contents",
    "support_conversations",
    "support_messages",
]


@dataclass
class TableCount:
    table: str
    source_count: int
    target_count: int


def _engine(url: str) -> Engine:
    return create_engine(url, future=True, pool_pre_ping=True)


def _table_has_store_id(engine: Engine, table: str) -> bool:
    try:
        columns = inspect(engine).get_columns(table)
    except NoSuchTableError:
        return False
    return any(col.get("name") == "store_id" for col in columns)


def _rows_for_store(engine: Engine, table: str, store_id: int) -> list[dict[str, Any]]:
    query = text(f"SELECT * FROM `{table}` WHERE store_id = :store_id")
    with engine.connect() as conn:
        result = conn.execute(query, {"store_id": store_id})
        return [dict(row._mapping) for row in result]


def _delete_store_rows(engine: Engine, table: str, store_id: int) -> None:
    query = text(f"DELETE FROM `{table}` WHERE store_id = :store_id")
    with engine.begin() as conn:
        conn.execute(query, {"store_id": store_id})


def _insert_rows(engine: Engine, table: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    cols = list(rows[0].keys())
    col_sql = ", ".join(f"`{col}`" for col in cols)
    val_sql = ", ".join(f":{col}" for col in cols)
    query = text(f"INSERT INTO `{table}` ({col_sql}) VALUES ({val_sql})")
    with engine.begin() as conn:
        conn.execute(query, rows)


def run_backfill(source_url: str, target_url: str, store_id: int, dry_run: bool) -> None:
    source = _engine(source_url)
    target = _engine(target_url)

    print(f"[INFO] starting backfill store_id={store_id} dry_run={dry_run}")
    for table in TENANT_TABLE_ORDER:
        if not _table_has_store_id(source, table):
            print(f"[SKIP] {table}: no store_id column in source")
            continue
        if not _table_has_store_id(target, table):
            print(f"[SKIP] {table}: no store_id column in target")
            continue

        rows = _rows_for_store(source, table, store_id)
        print(f"[TABLE] {table}: source_rows={len(rows)}")
        if dry_run:
            continue

        _delete_store_rows(target, table, store_id)
        _insert_rows(target, table, rows)
        print(f"[DONE] {table}: inserted={len(rows)}")

    print("[INFO] backfill finished")


def run_reconcile(source_url: str, target_url: str, store_id: int) -> list[TableCount]:
    source = _engine(source_url)
    target = _engine(target_url)
    output: list[TableCount] = []

    print(f"[INFO] starting reconcile store_id={store_id}")
    for table in TENANT_TABLE_ORDER:
        if not _table_has_store_id(source, table) or not _table_has_store_id(target, table):
            print(f"[SKIP] {table}: missing store_id in source or target")
            continue

        src = len(_rows_for_store(source, table, store_id))
        tgt = len(_rows_for_store(target, table, store_id))
        output.append(TableCount(table=table, source_count=src, target_count=tgt))
        status = "OK" if src == tgt else "DIFF"
        print(f"[CHECK] {table}: source={src} target={tgt} status={status}")

    print("[INFO] reconcile finished")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Store data backfill/reconcile between DBs by store_id")
    parser.add_argument("--mode", choices=["backfill", "reconcile"], required=True)
    parser.add_argument("--source-url", required=True, help="Legacy/source database URL")
    parser.add_argument("--target-url", required=True, help="Tenant/target database URL")
    parser.add_argument("--store-id", type=int, required=True)
    parser.add_argument("--dry-run", action="store_true", help="Only for backfill mode")
    args = parser.parse_args()

    if args.mode == "backfill":
        run_backfill(args.source_url, args.target_url, args.store_id, args.dry_run)
        return

    results = run_reconcile(args.source_url, args.target_url, args.store_id)
    diffs = [r for r in results if r.source_count != r.target_count]
    if diffs:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
