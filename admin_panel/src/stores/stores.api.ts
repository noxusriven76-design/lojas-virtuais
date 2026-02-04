import { http } from "../api/http";

export type MyStore = {
  store_id: number;
  name: string;
  slug: string;
  role: string;
  logo_url?: string | null;
  is_active?: boolean;
};

export async function fetchMyStores(): Promise<MyStore[]> {
  const { data } = await http.get<MyStore[]>("/api/v1/admin/my-stores");
  return data;
}

