import { http } from "../api/http";

export type MyStore = {
  store_id: number;
  name: string;
  slug: string;
  role: string;
  permissions: string[];
  logo_url?: string | null;
  is_active?: boolean;
};

export async function fetchMyStores(): Promise<MyStore[]> {
  const { data } = await http.get<MyStore[]>("/api/v1/admin/my-stores");
  return data;
}

export type AdminStore = {
  id: number;
  name: string;
  slug: string;
  logo_url?: string | null;
  is_active: boolean;
};

export type StoreCreateInput = {
  name: string;
  slug: string;
};

export type StoreUpdateInput = {
  name?: string;
  slug?: string;
  is_active?: boolean;
};

export async function fetchAdminStores(): Promise<AdminStore[]> {
  const { data } = await http.get<AdminStore[]>("/api/v1/admin/stores");
  return data;
}

export async function createAdminStore(payload: StoreCreateInput): Promise<AdminStore> {
  const { data } = await http.post<AdminStore>("/api/v1/admin/stores", payload);
  return data;
}

export async function updateAdminStore(storeId: number, payload: StoreUpdateInput): Promise<AdminStore> {
  const { data } = await http.patch<AdminStore>(`/api/v1/admin/stores/${storeId}`, payload);
  return data;
}
