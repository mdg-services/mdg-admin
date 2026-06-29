import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { Admin, LoginResponse, User } from '@dk/shared';
import type { LoginInput } from '@dk/shared/schemas';

/**
 * The backend now returns `{ token, user, admin? }`. We keep `admin` for
 * back-compat, but prefer `user` going forward. If only `user` is returned
 * and the role is admin, synthesize an Admin shape so existing consumers
 * (e.g. AppShell admin menu) continue to work.
 */
type ExtendedLoginResponse = LoginResponse & { user?: User };
type MaybeUserOnlyResponse = { token: string; user: User; admin?: Admin };

function adminFromUser(u: User): Admin {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roles: [u.role],
    ...(u.lastLoginAt !== undefined ? { lastLoginAt: u.lastLoginAt } : {}),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export function useLoginMutation() {
  const login = useAuthStore((s) => s.login);
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const data = await api.post<ExtendedLoginResponse | MaybeUserOnlyResponse>(
        '/auth/login',
        input,
      );
      return data;
    },
    onSuccess: (data) => {
      const user = (data as { user?: User }).user ?? null;
      const admin =
        (data as { admin?: Admin }).admin ??
        (user ? adminFromUser(user) : null);
      login(data.token, admin, user);
    },
  });
}

export function useMeQuery() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<Admin>('/auth/me'),
    enabled: !!token,
  });
}
