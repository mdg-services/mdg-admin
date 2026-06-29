import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Admin, User } from '@dk/shared';

interface AuthState {
  token: string | null;
  admin: Admin | null;
  user: User | null;
  login: (token: string, admin: Admin | null, user?: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      admin: null,
      user: null,
      login: (token, admin, user = null) =>
        set({ token, admin, user: user ?? null }),
      logout: () => set({ token: null, admin: null, user: null }),
    }),
    {
      name: 'dk.auth',
      partialize: (s) => ({ token: s.token, admin: s.admin, user: s.user }),
    },
  ),
);

/** Imperative accessor used by the fetch client (outside React). */
export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}

export function clearAuth(): void {
  useAuthStore.getState().logout();
}

export const selectUser = (s: AuthState): User | null => s.user;
