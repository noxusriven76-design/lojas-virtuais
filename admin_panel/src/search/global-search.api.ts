import { http } from "../api/http";

export type GlobalSearchProduct = {
  id: number;
  name: string;
  sku: string | null;
  price: number;
  is_active: boolean;
};

export type GlobalSearchCustomer = {
  id: number;
  name: string;
  email: string | null;
  total_orders: number;
};

export type GlobalSearchOrder = {
  id: number;
  status: string;
  total: number;
  created_at: string;
  customer_name: string | null;
};

export type GlobalSearchResult = {
  query: string;
  products: GlobalSearchProduct[];
  customers: GlobalSearchCustomer[];
  orders: GlobalSearchOrder[];
};

export async function fetchGlobalSearch(
  storeId: number,
  q: string,
  limit = 5,
): Promise<GlobalSearchResult> {
  const { data } = await http.get<GlobalSearchResult>(`/api/v1/admin/stores/${storeId}/global-search`, {
    params: { q, limit },
  });
  return data;
}
