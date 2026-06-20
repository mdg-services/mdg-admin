import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { User, UserRole, UserStatus } from '@dk/shared';

export const dealerUsersKey = (dealerId: string | undefined) =>
  ['dealerUsers', dealerId] as const;

export function useDealerUsers(dealerId: string | undefined) {
  return useQuery({
    queryKey: dealerUsersKey(dealerId),
    queryFn: () => api.get<User[]>(`/dealers/${dealerId}/users`),
    enabled: !!dealerId,
    staleTime: 30_000,
  });
}

export interface CreateDealerUserInput {
  dealerId: string;
  email: string;
  name: string;
  role: Extract<UserRole, 'dealer-owner' | 'dealer-staff'>;
  title?: string;
  password: string;
  phone?: string;
}

export function useCreateDealerUser(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDealerUserInput) =>
      api.post<User>('/dealer-users', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealerUsersKey(dealerId) });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export interface UpdateDealerUserInput {
  id: string;
  name?: string;
  title?: string;
  phone?: string;
  status?: UserStatus;
  password?: string;
}

export function useUpdateDealerUser(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateDealerUserInput) =>
      api.patch<User>(`/dealer-users/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealerUsersKey(dealerId) });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useDeleteDealerUser(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<User | void>(`/dealer-users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealerUsersKey(dealerId) });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
