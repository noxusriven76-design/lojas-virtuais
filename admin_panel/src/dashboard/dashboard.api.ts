import { http } from "../api/http";

export type DashboardPeriod = "day" | "week" | "month";

export type DashboardKpis = {
  period: string;
  orders_total: number;
  paid_orders: number;
  revenue: number;
  average_ticket: number;
  conversion_rate: number;
  abandonment_rate: number;
  stockout_count: number;
  stockout_rate: number;
};

export type DashboardCompareMetric = {
  current: number;
  previous: number;
  change_pct: number;
};

export type DashboardCompare = {
  period: string;
  revenue: DashboardCompareMetric;
  orders: DashboardCompareMetric;
  average_ticket: DashboardCompareMetric;
};

export type DashboardAlert = {
  key: string;
  level: string;
  title: string;
  detail: string;
};

export type DashboardAlerts = {
  items: DashboardAlert[];
};

export type DashboardHealth = {
  api: string;
  database: string;
  jobs: string;
  checked_at: string;
};

export async function fetchDashboardKpis(storeId: number, period: DashboardPeriod): Promise<DashboardKpis> {
  const { data } = await http.get<DashboardKpis>(`/api/v1/admin/stores/${storeId}/dashboard/kpis`, {
    params: { period },
  });
  return data;
}

export async function fetchDashboardCompare(storeId: number, period: DashboardPeriod): Promise<DashboardCompare> {
  const { data } = await http.get<DashboardCompare>(`/api/v1/admin/stores/${storeId}/dashboard/compare`, {
    params: { period },
  });
  return data;
}

export async function fetchDashboardAlerts(storeId: number, period: DashboardPeriod): Promise<DashboardAlerts> {
  const { data } = await http.get<DashboardAlerts>(`/api/v1/admin/stores/${storeId}/dashboard/alerts`, {
    params: { period },
  });
  return data;
}

export async function fetchDashboardHealth(storeId: number): Promise<DashboardHealth> {
  const { data } = await http.get<DashboardHealth>(`/api/v1/admin/stores/${storeId}/dashboard/health`);
  return data;
}
