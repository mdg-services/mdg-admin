import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { DealerUserGroup, User } from '@dk/shared';
import type { SuperAdminUpdateUserInput } from '@dk/shared/schemas';

export const allUsersKey = ['super-admin', 'users'] as const;

/** Every user across every dealer, grouped dealer-wise (super-admin only). */
export function useAllUsers() {
  return useQuery({
    queryKey: allUsersKey,
    queryFn: () => api.get<DealerUserGroup[]>('/super-admin/users'),
    staleTime: 30_000,
  });
}

export interface UpdateUserVars extends SuperAdminUpdateUserInput {
  id: string;
}

/**
 * Full-control edit of any user: email, password, status (suspend/reactivate),
 * role (owner↔manager), or the super-admin tier.
 */
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateUserVars) =>
      api.patch<User>(`/super-admin/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: allUsersKey }),
  });
}

/** Archive (soft-delete) any user: blocks login and hides them, but reversible. */
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<User>(`/super-admin/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: allUsersKey }),
  });
}

/** Restore an archived user (clears archivedAt; login stays off until reactivated). */
export function useRestoreUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<User>(`/super-admin/users/${id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: allUsersKey }),
  });
}
