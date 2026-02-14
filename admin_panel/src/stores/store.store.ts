import type { MyStore } from "./stores.api";
import { useSyncExternalStore } from "react";

const STORE_ID_KEY = "admin_panel_current_store_id";

let currentStoreId: number | null = (() => {
  const raw = localStorage.getItem(STORE_ID_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
})();
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export const storeStore = {
  getCurrentStoreId(): number | null {
    return currentStoreId;
  },
  setCurrentStoreId(id: number) {
    currentStoreId = id;
    localStorage.setItem(STORE_ID_KEY, String(id));
    emitChange();
  },
  clearCurrentStoreId() {
    currentStoreId = null;
    localStorage.removeItem(STORE_ID_KEY);
    emitChange();
  },
  validateCurrentStoreId(availableStores: MyStore[]) {
    const selected = this.getCurrentStoreId();
    if (!selected) return;
    const exists = availableStores.some((s) => s.store_id === selected);
    if (!exists) {
      this.clearCurrentStoreId();
    }
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useCurrentStoreId(): number | null {
  return useSyncExternalStore(storeStore.subscribe, storeStore.getCurrentStoreId, storeStore.getCurrentStoreId);
}
