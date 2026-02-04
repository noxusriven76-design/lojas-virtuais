import type { MyStore } from "./stores.api";

const STORE_ID_KEY = "admin_panel_current_store_id";

let currentStoreId: number | null = (() => {
  const raw = localStorage.getItem(STORE_ID_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
})();

export const storeStore = {
  getCurrentStoreId(): number | null {
    return currentStoreId;
  },
  setCurrentStoreId(id: number) {
    currentStoreId = id;
    localStorage.setItem(STORE_ID_KEY, String(id));
  },
  clearCurrentStoreId() {
    currentStoreId = null;
    localStorage.removeItem(STORE_ID_KEY);
  },
  validateCurrentStoreId(availableStores: MyStore[]) {
    const selected = this.getCurrentStoreId();
    if (!selected) return;
    const exists = availableStores.some((s) => s.store_id === selected);
    if (!exists) {
      this.clearCurrentStoreId();
    }
  },
};

