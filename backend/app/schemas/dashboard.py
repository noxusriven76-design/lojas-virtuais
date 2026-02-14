from __future__ import annotations

from pydantic import BaseModel


class DashboardKpiOut(BaseModel):
    period: str
    orders_total: int
    paid_orders: int
    revenue: float
    average_ticket: float
    conversion_rate: float
    abandonment_rate: float
    stockout_count: int
    stockout_rate: float


class DashboardCompareMetricOut(BaseModel):
    current: float
    previous: float
    change_pct: float


class DashboardCompareOut(BaseModel):
    period: str
    revenue: DashboardCompareMetricOut
    orders: DashboardCompareMetricOut
    average_ticket: DashboardCompareMetricOut


class DashboardAlertOut(BaseModel):
    key: str
    level: str
    title: str
    detail: str


class DashboardAlertsOut(BaseModel):
    items: list[DashboardAlertOut]


class DashboardHealthOut(BaseModel):
    api: str
    database: str
    jobs: str
    checked_at: str
