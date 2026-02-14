import { http } from "../api/http";

export type Product = {
  id: number;
  category_id: number;
  name: string;
  description?: string;
  image_url: string | null;
  images?: ProductGalleryImage[];
  base_price: number;
  is_active: boolean;
  sku?: string;
  color?: string;
  size?: string;
  stock?: number;
};

export type ProductGalleryImage = {
  id: number;
  product_id: number;
  image_url: string;
  sort_order: number;
  is_cover: boolean;
};

export type ProductCreateInput = {
  category_id: number;
  name: string;
  base_price: number;
  description?: string;
  is_active?: boolean;
  sku?: string;
  color?: string;
  size?: string;
  stock?: number;
};

export type ProductUpdateInput = {
  category_id?: number;
  name?: string;
  description?: string;
  price?: number;
  is_active?: boolean;
  sku?: string;
  color?: string;
  size?: string;
  stock?: number;
};

export type ProductDeleteOut = {
  ok: boolean;
  mode: "soft_delete" | "hard_delete" | string;
  message: string;
};

export type ProductBulkUpdateInput = {
  product_ids: number[];
  category_id?: number;
  is_active?: boolean;
  price?: number;
  stock?: number;
};

export type ProductBulkUpdateOut = {
  ok: boolean;
  updated_count: number;
};

export type CatalogImportOut = {
  ok: boolean;
  job_id: number;
  imported: number;
  updated: number;
  errors: string[];
};

export type CatalogJob = {
  id: number;
  store_id: number;
  user_id: number | null;
  job_type: string;
  status: string;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type ProductImageOut = {
  product_id: number;
  image_url: string | null;
};

export async function fetchProducts(storeId: number): Promise<Product[]> {
  const { data } = await http.get<Product[]>(`/api/v1/admin/stores/${storeId}/products`);
  return data;
}

export async function createProduct(storeId: number, payload: ProductCreateInput): Promise<{ id: number }> {
  const { data } = await http.post<{ id: number }>(`/api/v1/admin/stores/${storeId}/products`, payload);
  return data;
}

export async function updateProduct(
  storeId: number,
  productId: number,
  payload: ProductUpdateInput
): Promise<Product> {
  const { data } = await http.patch<Product>(
    `/api/v1/admin/stores/${storeId}/products/${productId}`,
    payload
  );
  return data;
}

export async function deleteProduct(storeId: number, productId: number): Promise<ProductDeleteOut> {
  const { data } = await http.delete<ProductDeleteOut>(
    `/api/v1/admin/stores/${storeId}/products/${productId}`
  );
  return data;
}

export async function duplicateProduct(storeId: number, productId: number): Promise<Product> {
  const { data } = await http.post<Product>(`/api/v1/admin/stores/${storeId}/products/${productId}/duplicate`);
  return data;
}

export async function bulkUpdateProducts(
  storeId: number,
  payload: ProductBulkUpdateInput
): Promise<ProductBulkUpdateOut> {
  const { data } = await http.post<ProductBulkUpdateOut>(`/api/v1/admin/stores/${storeId}/products/bulk-update`, payload);
  return data;
}

export async function exportProductsCsv(storeId: number): Promise<void> {
  const response = await http.get(`/api/v1/admin/stores/${storeId}/products/export.csv`, { responseType: "blob" });
  const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `products_store_${storeId}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function importProductsFile(storeId: number, file: File): Promise<CatalogImportOut> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await http.post<CatalogImportOut>(`/api/v1/admin/stores/${storeId}/products/import`, form);
  return data;
}

export async function fetchCatalogJobs(storeId: number): Promise<CatalogJob[]> {
  const { data } = await http.get<CatalogJob[]>(`/api/v1/admin/stores/${storeId}/catalog-jobs`);
  return data;
}

export async function enqueueImageReprocess(storeId: number): Promise<CatalogJob> {
  const { data } = await http.post<CatalogJob>(`/api/v1/admin/stores/${storeId}/catalog-jobs/reprocess-images`);
  return data;
}

export async function uploadProductImage(
  storeId: number,
  productId: number,
  file: File
): Promise<ProductImageOut> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await http.post<ProductImageOut>(
    `/api/v1/admin/stores/${storeId}/products/${productId}/image`,
    form
  );
  return data;
}

export async function deleteProductImage(storeId: number, productId: number): Promise<ProductImageOut> {
  const { data } = await http.delete<ProductImageOut>(
    `/api/v1/admin/stores/${storeId}/products/${productId}/image`
  );
  return data;
}

export async function fetchProductImages(storeId: number, productId: number): Promise<ProductGalleryImage[]> {
  const { data } = await http.get<ProductGalleryImage[]>(
    `/api/v1/admin/stores/${storeId}/products/${productId}/images`
  );
  return data;
}

export async function uploadProductGalleryImage(
  storeId: number,
  productId: number,
  file: File
): Promise<ProductGalleryImage> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await http.post<ProductGalleryImage>(
    `/api/v1/admin/stores/${storeId}/products/${productId}/images`,
    form
  );
  return data;
}

export async function updateProductGalleryImage(
  storeId: number,
  productId: number,
  imageId: number,
  payload: { is_cover?: boolean; sort_order?: number }
): Promise<ProductGalleryImage> {
  const { data } = await http.patch<ProductGalleryImage>(
    `/api/v1/admin/stores/${storeId}/products/${productId}/images/${imageId}`,
    payload
  );
  return data;
}

export async function deleteProductGalleryImage(
  storeId: number,
  productId: number,
  imageId: number
): Promise<ProductGalleryImage[]> {
  const { data } = await http.delete<ProductGalleryImage[]>(
    `/api/v1/admin/stores/${storeId}/products/${productId}/images/${imageId}`
  );
  return data;
}
