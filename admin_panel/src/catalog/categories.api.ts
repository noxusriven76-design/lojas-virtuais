import { http } from "../api/http";

export type Category = {
  id: number;
  name: string;
  parent_id: number | null;
  is_active?: boolean | null;
  sort_order?: number | null;
  children?: Category[] | null;
};

export type CategoryCreateInput = {
  name: string;
};

export type CategoryUpdateInput = {
  name?: string;
  parent_id?: number | null;
  is_active?: boolean;
  sort_order?: number;
};

export async function fetchCategories(storeId: number, tree = false): Promise<Category[]> {
  const { data } = await http.get<Category[]>(`/api/v1/admin/stores/${storeId}/categories`, {
    params: { tree },
  });
  return data;
}

export async function createCategory(storeId: number, payload: CategoryCreateInput): Promise<Category> {
  const { data } = await http.post<Category>(`/api/v1/admin/stores/${storeId}/categories`, payload);
  return data;
}

export async function updateCategory(
  storeId: number,
  categoryId: number,
  payload: CategoryUpdateInput
): Promise<Category> {
  const { data } = await http.patch<Category>(
    `/api/v1/admin/stores/${storeId}/categories/${categoryId}`,
    payload
  );
  return data;
}

export async function deleteCategory(storeId: number, categoryId: number): Promise<{ ok: boolean }> {
  const { data } = await http.delete<{ ok: boolean }>(
    `/api/v1/admin/stores/${storeId}/categories/${categoryId}`
  );
  return data;
}
