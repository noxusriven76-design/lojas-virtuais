import { http } from "../api/http";

export type Customer = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  total_orders: number;
};

export type CustomerListOut = {
  items: Customer[];
  total: number;
  limit: number;
  offset: number;
};

export async function fetchCustomers(
  storeId: number,
  params: { limit: number; offset: number; q?: string }
): Promise<CustomerListOut> {
  const { data } = await http.get<CustomerListOut>(`/api/v1/admin/stores/${storeId}/customers`, {
    params,
  });
  return data;
}
