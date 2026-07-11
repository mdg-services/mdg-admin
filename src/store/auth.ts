import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { postToNative } from '@/lib/nativeBridge';
import type { Admin, User } from '@dk/shared';

interface AuthState {
  token: string | null;
  admin: Admin | null;
  user: User | null;
  login: (token: string, admin: Admin | null, user?: User | null) => void;
  logout: () => void;
}

/**
 * Best-effort: unregister the push token with the backend (while the auth
 * token is still valid) and tell the native shell we logged out. Never blocks
 * or throws — logout must always proceed. Done via dynamic imports to avoid a
 * static import cycle with `lib/api` (which imports from this module).
 */
function teardownPushOnLogout(authToken: string | null): void {
  try {
    void (async () => {
      try {
        const [
          { getRegisteredPushToken, clearRegisteredPushToken },
          { buildUrl },
        ] = await Promise.all([
          import('@/hooks/usePushBridge'),
          import('@/lib/api'),
        ]);
        const pushToken = getRegisteredPushToken();
        if (pushToken && authToken) {
          try {
            // DELETE carries a body, which `api.del` does not support, and we
            // must use the auth token captured before state was cleared, so
            // call fetch directly. The base URL already carries `/v1`, so this
            // hits the same `/api/v1/devices` endpoint the client app uses.
            await fetch(buildUrl('/devices'), {
              method: 'DELETE',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({ token: pushToken }),
            });
          } catch {
            // ignore network/HTTP errors on unregister
          }
        }
        clearRegisteredPushToken();
      } catch {
        // ignore module/load errors
      }
    })();
    postToNative({ type: 'auth:logout' });
  } catch {
    // never let logout teardown throw
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      admin: null,
      user: null,
      login: (token, admin, user = null) =>
        set({ token, admin, user: user ?? null }),
      logout: () => {
        const { token } = get();
        teardownPushOnLogout(token);
        set({ token: null, admin: null, user: null });
      },
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
