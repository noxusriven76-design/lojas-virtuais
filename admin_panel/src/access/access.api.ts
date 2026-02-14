import { http } from "../api/http";

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  is_superuser: boolean;
};

export type StoreMember = {
  store_id: number;
  user_id: number;
  role: string;
  user?: AdminUser | null;
};

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { data } = await http.get<AdminUser[]>("/api/v1/admin/users");
  return data;
}

export async function fetchStoreMembers(storeId: number): Promise<StoreMember[]> {
  const { data } = await http.get<StoreMember[]>(`/api/v1/admin/stores/${storeId}/members`);
  return data;
}

export async function addStoreMember(storeId: number, userId: number, role: string): Promise<StoreMember> {
  const { data } = await http.post<StoreMember>(`/api/v1/admin/stores/${storeId}/members`, {
    user_id: userId,
    role,
  });
  return data;
}

export async function updateStoreMemberRole(storeId: number, userId: number, role: string): Promise<void> {
  await http.patch(`/api/v1/admin/stores/${storeId}/members/${userId}`, { role });
}

export async function removeStoreMember(storeId: number, userId: number): Promise<void> {
  await http.delete(`/api/v1/admin/stores/${storeId}/members/${userId}`);
}

