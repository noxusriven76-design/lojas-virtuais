import { http } from "../api/http";

export type OrderItem = {
  id: number;
  product_id: number;
  variant_id: number;
  quantity: number;
  cancelled_quantity: number;
  unit_price: number;
  line_total: number;
  product_name: string;
  variant_label: string;
  image_url: string;
};

export type AdminOrder = {
  id: number;
  status: string;
  created_at: string;
  shipping_service: string;
  shipping_price: number;
  shipping_eta_days: number;
  subtotal: number;
  discount: number;
  total: number;
  recipient_name: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  user_id: number;
  user_name: string | null;
  user_email: string | null;
  items: OrderItem[];
};

export type AdminOrderListOut = {
  items: AdminOrder[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminOrderEvent = {
  id: number;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  meta: Record<string, unknown> | null;
  user_id: number | null;
  created_at: string;
};

export type AdminOrderTimelineOut = {
  items: AdminOrderEvent[];
};

export async function fetchStoreOrders(
  storeId: number,
  params: {
    limit: number;
    offset: number;
    status?: string;
    q?: string;
    date_from?: string;
    date_to?: string;
  }
): Promise<AdminOrderListOut> {
  const { data } = await http.get<AdminOrderListOut>(`/api/v1/admin/stores/${storeId}/orders`, { params });
  return data;
}

export async function fetchStoreOrderById(storeId: number, orderId: number): Promise<AdminOrder> {
  const { data } = await http.get<AdminOrder>(`/api/v1/admin/stores/${storeId}/orders/${orderId}`);
  return data;
}

export async function updateStoreOrderStatus(
  storeId: number,
  orderId: number,
  status: string
): Promise<AdminOrder> {
  const { data } = await http.patch<AdminOrder>(`/api/v1/admin/stores/${storeId}/orders/${orderId}/status`, {
    status,
  });
  return data;
}

export async function fetchStoreOrderTimeline(
  storeId: number,
  orderId: number
): Promise<AdminOrderTimelineOut> {
  const { data } = await http.get<AdminOrderTimelineOut>(
    `/api/v1/admin/stores/${storeId}/orders/${orderId}/timeline`
  );
  return data;
}

export async function addStoreOrderNote(
  storeId: number,
  orderId: number,
  note: string
): Promise<AdminOrderTimelineOut> {
  const { data } = await http.post<AdminOrderTimelineOut>(
    `/api/v1/admin/stores/${storeId}/orders/${orderId}/notes`,
    { note }
  );
  return data;
}

export async function cancelStoreOrder(
  storeId: number,
  orderId: number,
  payload: { reason: string; items?: Array<{ order_item_id: number; quantity: number }> }
): Promise<AdminOrder> {
  const { data } = await http.post<AdminOrder>(`/api/v1/admin/stores/${storeId}/orders/${orderId}/cancel`, payload);
  return data;
}
