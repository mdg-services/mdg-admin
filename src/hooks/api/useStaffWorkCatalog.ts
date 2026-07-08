import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { StaffWorkItem } from '@dk/shared';
import type {
  CreateStaffWorkItemInput,
  UpdateStaffWorkItemInput,
} from '@dk/shared/schemas';

export const staffWorkCatalogKey = ['staffWorkCatalog'] as const;

/**
 * The GLOBAL default work catalog (super-admin only). Returns all items,
 * including inactive ones, so the defaults page can reactivate soft-deleted
 * rows. Pass `enabled: false` to skip the fetch for non-super-admin viewers.
 */
export function useStaffWorkCatalogQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: staffWorkCatalogKey,
    queryFn: () => api.get<StaffWorkItem[]>('/super-admin/staff-work-items'),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useCreateStaffWorkItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStaffWorkItemInput) =>
      api.post<StaffWorkItem>('/super-admin/staff-work-items', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: staffWorkCatalogKey }),
  });
}

export interface UpdateStaffWorkItemVars extends UpdateStaffWorkItemInput {
  code: string;
}

export function useUpdateStaffWorkItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, ...body }: UpdateStaffWorkItemVars) =>
      api.patch<StaffWorkItem>(`/super-admin/staff-work-items/${code}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: staffWorkCatalogKey }),
  });
}

/** Soft-delete a catalog item (server sets active=false). */
export function useDeleteStaffWorkItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api.del<void>(`/super-admin/staff-work-items/${code}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: staffWorkCatalogKey }),
  });
}
