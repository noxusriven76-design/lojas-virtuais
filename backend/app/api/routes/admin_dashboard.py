from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.core.permissions import require_dashboard_read
from app.models.catalog import ProductVariant
from app.models.catalog_job import CatalogJob
from app.models.order import Order
from app.schemas.dashboard import (
    DashboardAlertOut,
    DashboardAlertsOut,
    DashboardCompareMetricOut,
    DashboardCompareOut,
    DashboardHealthOut,
    DashboardKpiOut,
)

router = APIRouter(prefix="/admin/stores/{store_id}/dashboard")

PAID_STATUSES = {"pago", "enviado", "concluido"}


def _period_window(period: str) -> tuple[datetime, datetime, datetime]:
    now = datetime.utcnow()
    normalized = (period or "day").strip().lower()
    if normalized == "week":
        start = now - timedelta(days=7)
        prev_start = start - timedelta(days=7)
        return start, now, prev_start
    if normalized == "month":
        start = now - timedelta(days=30)
        prev_start = start - timedelta(days=30)
        return start, now, prev_start
    start = now - timedelta(days=1)
    prev_start = start - timedelta(days=1)
    return start, now, prev_start


def _safe_change_pct(current: float, previous: float) -> float:
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return ((current - previous) / previous) * 100.0


@router.get("/kpis", response_model=DashboardKpiOut)
def get_dashboard_kpis(
    store_id: int,
    period: str = Query(default="day"),
    db: Session = Depends(get_db),
    _=Depends(require_dashboard_read),
):
    start, end, _ = _period_window(period)
    period_key = (period or "day").strip().lower()
    q = db.query(Order).filter(Order.store_id == store_id, Order.created_at >= start, Order.created_at < end)

    orders_total = q.count()
    paid_orders = q.filter(Order.status.in_(PAID_STATUSES)).count()
    revenue = (
        q.filter(Order.status.in_(PAID_STATUSES)).with_entities(func.coalesce(func.sum(Order.total), 0)).scalar() or 0
    )
    average_ticket = float(revenue) / paid_orders if paid_orders else 0.0
    conversion_rate = (paid_orders / orders_total * 100.0) if orders_total else 0.0
    abandonment_rate = ((orders_total - paid_orders) / orders_total * 100.0) if orders_total else 0.0

    stockout_count = (
        db.query(ProductVariant.id)
        .filter(ProductVariant.store_id == store_id, ProductVariant.active == True, ProductVariant.stock <= 0)  # noqa: E712
        .count()
    )
    total_active_variants = (
        db.query(ProductVariant.id)
        .filter(ProductVariant.store_id == store_id, ProductVariant.active == True)  # noqa: E712
        .count()
    )
    stockout_rate = (stockout_count / total_active_variants * 100.0) if total_active_variants else 0.0

    return DashboardKpiOut(
        period=period_key,
        orders_total=orders_total,
        paid_orders=paid_orders,
        revenue=float(revenue),
        average_ticket=float(average_ticket),
        conversion_rate=float(conversion_rate),
        abandonment_rate=float(abandonment_rate),
        stockout_count=stockout_count,
        stockout_rate=float(stockout_rate),
    )


@router.get("/compare", response_model=DashboardCompareOut)
def get_dashboard_compare(
    store_id: int,
    period: str = Query(default="day"),
    db: Session = Depends(get_db),
    _=Depends(require_dashboard_read),
):
    start, end, prev_start = _period_window(period)
    period_key = (period or "day").strip().lower()
    q_current = db.query(Order).filter(Order.store_id == store_id, Order.created_at >= start, Order.created_at < end)
    q_previous = db.query(Order).filter(
        Order.store_id == store_id, Order.created_at >= prev_start, Order.created_at < start
    )

    current_orders = q_current.count()
    previous_orders = q_previous.count()
    current_revenue = (
        q_current.filter(Order.status.in_(PAID_STATUSES)).with_entities(func.coalesce(func.sum(Order.total), 0)).scalar()
        or 0
    )
    previous_revenue = (
        q_previous.filter(Order.status.in_(PAID_STATUSES)).with_entities(func.coalesce(func.sum(Order.total), 0)).scalar()
        or 0
    )

    current_paid = q_current.filter(Order.status.in_(PAID_STATUSES)).count()
    previous_paid = q_previous.filter(Order.status.in_(PAID_STATUSES)).count()
    current_ticket = float(current_revenue) / current_paid if current_paid else 0.0
    previous_ticket = float(previous_revenue) / previous_paid if previous_paid else 0.0

    return DashboardCompareOut(
        period=period_key,
        revenue=DashboardCompareMetricOut(
            current=float(current_revenue),
            previous=float(previous_revenue),
            change_pct=float(_safe_change_pct(float(current_revenue), float(previous_revenue))),
        ),
        orders=DashboardCompareMetricOut(
            current=float(current_orders),
            previous=float(previous_orders),
            change_pct=float(_safe_change_pct(float(current_orders), float(previous_orders))),
        ),
        average_ticket=DashboardCompareMetricOut(
            current=float(current_ticket),
            previous=float(previous_ticket),
            change_pct=float(_safe_change_pct(float(current_ticket), float(previous_ticket))),
        ),
    )


@router.get("/alerts", response_model=DashboardAlertsOut)
def get_dashboard_alerts(
    store_id: int,
    period: str = Query(default="day"),
    db: Session = Depends(get_db),
    _=Depends(require_dashboard_read),
):
    start, end, prev_start = _period_window(period)
    alerts: list[DashboardAlertOut] = []

    stockout_count = (
        db.query(ProductVariant.id)
        .filter(ProductVariant.store_id == store_id, ProductVariant.active == True, ProductVariant.stock <= 0)  # noqa: E712
        .count()
    )
    if stockout_count > 0:
        alerts.append(
            DashboardAlertOut(
                key="stockout",
                level="warning",
                title="Ruptura de estoque",
                detail=f"{stockout_count} variante(s) ativas com estoque zerado.",
            )
        )

    current_orders = (
        db.query(Order.id).filter(Order.store_id == store_id, Order.created_at >= start, Order.created_at < end).count()
    )
    previous_orders = (
        db.query(Order.id)
        .filter(Order.store_id == store_id, Order.created_at >= prev_start, Order.created_at < start)
        .count()
    )
    if previous_orders > 0 and current_orders < previous_orders * 0.7:
        alerts.append(
            DashboardAlertOut(
                key="order_drop",
                level="warning",
                title="Queda de pedidos",
                detail=f"Pedidos no periodo atual cairam de {previous_orders} para {current_orders}.",
            )
        )

    jobs_with_errors = (
        db.query(CatalogJob.id)
        .filter(
            CatalogJob.store_id == store_id,
            CatalogJob.created_at >= start,
            CatalogJob.status.in_(["failed", "completed_with_errors"]),
        )
        .count()
    )
    if jobs_with_errors > 0:
        alerts.append(
            DashboardAlertOut(
                key="integration_error",
                level="error",
                title="Erro de integracao/catalogo",
                detail=f"{jobs_with_errors} job(s) de catalogo com erro no periodo.",
            )
        )

    if not alerts:
        alerts.append(
            DashboardAlertOut(
                key="ok",
                level="info",
                title="Sem alertas criticos",
                detail="Nenhum alerta operacional relevante para o periodo.",
            )
        )
    return DashboardAlertsOut(items=alerts)


@router.get("/health", response_model=DashboardHealthOut)
def get_dashboard_health(
    store_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_dashboard_read),
):
    _ = store_id
    api_status = "ok"
    db_status = "ok"
    jobs_status = "ok"

    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"

    jobs_running = db.query(CatalogJob.id).filter(CatalogJob.status == "running").count()
    jobs_failed_recent = (
        db.query(CatalogJob.id)
        .filter(CatalogJob.created_at >= datetime.utcnow() - timedelta(hours=24), CatalogJob.status == "failed")
        .count()
    )
    if jobs_failed_recent > 0:
        jobs_status = "degraded"
    elif jobs_running > 20:
        jobs_status = "warning"

    return DashboardHealthOut(
        api=api_status,
        database=db_status,
        jobs=jobs_status,
        checked_at=datetime.utcnow().isoformat(),
    )
