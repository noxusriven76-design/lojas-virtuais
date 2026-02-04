import { storeStore } from "../stores/store.store";

const TOKEN_KEY = "admin_panel_token";

export type AuthUser = {
  id: number;
  email: string;
  is_superuser: boolean;
  [key: string]: unknown;
};

let token: string | null = localStorage.getItem(TOKEN_KEY);
let user: AuthUser | null = null;

export const authStore = {
  getToken(): string | null {
    return token;
  },
  setToken(nextToken: string) {
    token = nextToken;
    localStorage.setItem(TOKEN_KEY, nextToken);
  },
  clearToken() {
    token = null;
    localStorage.removeItem(TOKEN_KEY);
  },
  getUser(): AuthUser | null {
    return user;
  },
  setUser(nextUser: AuthUser | null) {
    user = nextUser;
  },
  logout() {
    this.clearToken();
    this.setUser(null);
    storeStore.clearCurrentStoreId();
  },
};

