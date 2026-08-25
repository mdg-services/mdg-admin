import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { KavachTemplateItem } from '@dk/shared';
import type {
  CreateKavachTemplateItemInput,
  UpdateKavachTemplateItemInput,
} from '@dk/shared/schemas';

export const kavachCatalogKey = ['kavachCatalog'] as const;

/**
 * The GLOBAL Kavach task catalog (super-admin only). Returns retired rows too,
 * so the defaults editor can show and revive them.
 */
export function useKavachCatalogQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: kavachCatalogKey,
    queryFn: () => api.get<KavachTemplateItem[]>('/super-admin/kavach-items'),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

/**
 * Definitions resolve at read time, so a points or cadence edit here moves every
 * dealer who has no override for that task. Anything showing a score or a due
 * date is therefore stale the moment one of these succeeds.
 */
function useCatalogInvalidation() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: kavachCatalogKey });
    qc.invalidateQueries({ queryKey: ['kavach'] });
    qc.invalidateQueries({ queryKey: ['effectiveKavachItems'] });
  };
}

export function useCreateKavachTemplateItem() {
  const invalidate = useCatalogInvalidation();
  return useMutation({
    mutationFn: (input: CreateKavachTemplateItemInput) =>
      api.post<KavachTemplateItem>('/super-admin/kavach-items', input),
    onSuccess: invalidate,
  });
}

export interface UpdateKavachTemplateItemVars extends UpdateKavachTemplateItemInput {
  code: string;
}

export function useUpdateKavachTemplateItem() {
  const invalidate = useCatalogInvalidation();
  return useMutation({
    mutationFn: ({ code, ...body }: UpdateKavachTemplateItemVars) =>
      api.patch<KavachTemplateItem>(`/super-admin/kavach-items/${code}`, body),
    onSuccess: invalidate,
  });
}

/** Retire a task (server sets `active: false`; history is never hard-deleted). */
export function useRetireKavachTemplateItem() {
  const invalidate = useCatalogInvalidation();
  return useMutation({
    mutationFn: (code: string) =>
      api.del<KavachTemplateItem>(`/super-admin/kavach-items/${code}`),
    onSuccess: invalidate,
  });
}
