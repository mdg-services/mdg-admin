import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { User } from '@dk/shared';
import type { CreateAdminInput, UpdateAdminInput } from '@dk/shared/schemas';

export const adminsKey = ['admins'] as const;

export function useAdmins() {
  return useQuery({
    queryKey: adminsKey,
    queryFn: () => api.get<User[]>('/admins'),
    staleTime: 30_000,
  });
}

export function useCreateAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdminInput) => api.post<User>('/admins', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminsKey }),
  });
}

export interface UpdateAdminVars extends UpdateAdminInput {
  id: string;
}

export function useUpdateAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateAdminVars) =>
      api.patch<User>(`/admins/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminsKey }),
  });
}
