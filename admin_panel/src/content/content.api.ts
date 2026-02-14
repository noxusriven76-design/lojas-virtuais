import { http } from "../api/http";

export type StoreContent = {
  store_id: number;
  banner_title: string;
  banner_subtitle: string;
  banner_image_url: string | null;
  highlight_title: string;
  highlight_text: string;
  institutional_text: string;
};

export type StoreContentUpdateInput = {
  banner_title?: string;
  banner_subtitle?: string;
  highlight_title?: string;
  highlight_text?: string;
  institutional_text?: string;
};

export async function fetchStoreContent(storeId: number): Promise<StoreContent> {
  const { data } = await http.get<StoreContent>(`/api/v1/admin/stores/${storeId}/content`);
  return data;
}

export async function updateStoreContent(
  storeId: number,
  payload: StoreContentUpdateInput
): Promise<StoreContent> {
  const { data } = await http.patch<StoreContent>(`/api/v1/admin/stores/${storeId}/content`, payload);
  return data;
}

export async function uploadStoreBannerImage(storeId: number, file: File): Promise<StoreContent> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await http.post<StoreContent>(`/api/v1/admin/stores/${storeId}/content/banner-image`, form);
  return data;
}

export async function deleteStoreBannerImage(storeId: number): Promise<StoreContent> {
  const { data } = await http.delete<StoreContent>(`/api/v1/admin/stores/${storeId}/content/banner-image`);
  return data;
}
