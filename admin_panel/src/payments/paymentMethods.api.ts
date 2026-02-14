import { http } from "../api/http";

export type StorePaymentMethod = {
  id: number;
  store_id: number;
  code: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  min_amount: number | null;
  max_amount: number | null;
  installments_max: number | null;
  fee_percent: number | null;
  settlement_days: number | null;
  metadata_json: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

export type StorePaymentMethodListOut = {
  items: StorePaymentMethod[];
  total: number;
};

export type StorePaymentMethodPayload = {
  code: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  min_amount?: number | null;
  max_amount?: number | null;
  installments_max?: number | null;
  fee_percent?: number | null;
  settlement_days?: number | null;
  metadata_json?: Record<string, any> | null;
};

export async function fetchStorePaymentMethods(storeId: number): Promise<StorePaymentMethodListOut> {
  const { data } = await http.get<StorePaymentMethodListOut>(`/api/v1/admin/stores/${storeId}/payment-methods`);
  return data;
}

export async function createStorePaymentMethod(
  storeId: number,
  payload: StorePaymentMethodPayload
): Promise<StorePaymentMethod> {
  const { data } = await http.post<StorePaymentMethod>(`/api/v1/admin/stores/${storeId}/payment-methods`, payload);
  return data;
}

export async function updateStorePaymentMethod(
  storeId: number,
  methodId: number,
  payload: Partial<StorePaymentMethodPayload>
): Promise<StorePaymentMethod> {
  const { data } = await http.patch<StorePaymentMethod>(`/api/v1/admin/stores/${storeId}/payment-methods/${methodId}`, payload);
  return data;
}

export async function reorderStorePaymentMethods(
  storeId: number,
  items: Array<{ id: number; sort_order: number }>
): Promise<StorePaymentMethodListOut> {
  const { data } = await http.post<StorePaymentMethodListOut>(`/api/v1/admin/stores/${storeId}/payment-methods/reorder`, {
    items,
  });
  return data;
}

export async function deleteStorePaymentMethod(storeId: number, methodId: number): Promise<{ ok: boolean }> {
  const { data } = await http.delete<{ ok: boolean }>(`/api/v1/admin/stores/${storeId}/payment-methods/${methodId}`);
  return data;
}
