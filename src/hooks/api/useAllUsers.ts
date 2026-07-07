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

/** Change any user's login email and/or reset their password. */
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateUserVars) =>
      api.patch<User>(`/super-admin/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: allUsersKey }),
  });
}
