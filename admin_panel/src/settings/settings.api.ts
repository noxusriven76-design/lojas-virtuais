import { http } from "../api/http";

export type StoreUpdateInput = {
  name?: string;
  slug?: string;
  is_active?: boolean;
};

export type StoreOut = {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
};

export type StoreLogoOut = {
  store_id: number;
  logo_url: string | null;
};

export async function updateStore(storeId: number, payload: StoreUpdateInput): Promise<StoreOut> {
  const { data } = await http.patch<StoreOut>(`/api/v1/admin/stores/${storeId}`, payload);
  return data;
}

export async function uploadStoreLogo(storeId: number, file: File): Promise<StoreLogoOut> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await http.post<StoreLogoOut>(`/api/v1/admin/stores/${storeId}/logo`, form);
  return data;
}

export async function deleteStoreLogo(storeId: number): Promise<StoreLogoOut> {
  const { data } = await http.delete<StoreLogoOut>(`/api/v1/admin/stores/${storeId}/logo`);
  return data;
}
