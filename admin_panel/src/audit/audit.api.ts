import { http } from "../api/http";

export type AuditLogRow = {
  id: number;
  store_id: number | null;
  user_id: number | null;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  request_path: string | null;
  request_method: string | null;
  request_ip: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
};

export type AuditLogList = {
  items: AuditLogRow[];
  total: number;
  limit: number;
  offset: number;
};

export type AuditLogFilters = {
  action?: string;
  entity_type?: string;
  user_id?: number;
  q?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
};

export async function fetchAuditLogs(storeId: number, params: AuditLogFilters): Promise<AuditLogList> {
  const { data } = await http.get<AuditLogList>(`/api/v1/admin/stores/${storeId}/audit-logs`, { params });
  return data;
}

export async function exportAuditLogsCsv(storeId: number, params: AuditLogFilters): Promise<void> {
  const response = await http.get(`/api/v1/admin/stores/${storeId}/audit-logs/export.csv`, {
    params,
    responseType: "blob",
  });
  const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `audit_store_${storeId}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
