import type { MyStore } from "../stores/stores.api";

export const ROLE_SUPER_ADMIN = "super_admin";
export const ROLE_ADMIN_LOJA = "admin_loja";
export const ROLE_OPERADOR_PEDIDOS = "operador_pedidos";
export const ROLE_EDITOR_CONTEUDO = "editor_conteudo";
export const ROLE_SUPORTE = "suporte";

const ROLE_ALIASES: Record<string, string> = {
  owner: ROLE_ADMIN_LOJA,
  manager: ROLE_ADMIN_LOJA,
  viewer: ROLE_SUPORTE,
  [ROLE_ADMIN_LOJA]: ROLE_ADMIN_LOJA,
  [ROLE_OPERADOR_PEDIDOS]: ROLE_OPERADOR_PEDIDOS,
  [ROLE_EDITOR_CONTEUDO]: ROLE_EDITOR_CONTEUDO,
  [ROLE_SUPORTE]: ROLE_SUPORTE,
  superuser: ROLE_SUPER_ADMIN,
  [ROLE_SUPER_ADMIN]: ROLE_SUPER_ADMIN,
};

const PERMISSIONS_BY_ROLE: Record<string, string[]> = {
  [ROLE_ADMIN_LOJA]: [
    "dashboard.read",
    "search.read",
    "catalog.read",
    "catalog.write",
    "orders.read",
    "orders.write",
    "customers.read",
    "content.read",
    "content.write",
    "members.read",
    "members.write",
    "settings.read",
    "settings.write",
    "coupons.manage",
    "audit.read",
    "payments.read",
    "payments.write",
    "payments.refund",
  ],
  [ROLE_OPERADOR_PEDIDOS]: [
    "dashboard.read",
    "search.read",
    "orders.read",
    "orders.write",
    "customers.read",
    "payments.read",
  ],
  [ROLE_EDITOR_CONTEUDO]: ["dashboard.read", "search.read", "content.read", "content.write"],
  [ROLE_SUPORTE]: ["dashboard.read", "search.read", "orders.read", "customers.read", "content.read", "payments.read"],
};

export function normalizeRole(role: string | null | undefined, isSuperuser = false): string {
  if (isSuperuser) return ROLE_SUPER_ADMIN;
  const raw = String(role ?? "").trim().toLowerCase();
  return ROLE_ALIASES[raw] ?? ROLE_SUPORTE;
}

export function rolePermissions(role: string, isSuperuser = false): string[] {
  if (isSuperuser || role === ROLE_SUPER_ADMIN) return ["*"];
  return PERMISSIONS_BY_ROLE[normalizeRole(role)] ?? [];
}

export function hasStorePermission(
  stores: MyStore[] | undefined,
  currentStoreId: number | null,
  permission: string,
  isSuperuser = false,
): boolean {
  if (isSuperuser) return true;
  if (!stores || !currentStoreId) return false;
  const selected = stores.find((s) => s.store_id === currentStoreId);
  if (!selected) return false;
  const perms = selected.permissions?.length ? selected.permissions : rolePermissions(selected.role, false);
  return perms.includes("*") || perms.includes(permission);
}
