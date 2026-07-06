import { useQuery } from '@tanstack/react-query';

import { api, type QueryParams } from '@/lib/api';
import type { AuditActor, AuditLog, Paginated } from '@dk/shared';

export interface AuditListParams {
  actorId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function useAuditQuery(params: AuditListParams) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: () =>
      api.get<Paginated<AuditLog>>('/audit', params as unknown as QueryParams),
    placeholderData: (prev) => prev,
  });
}

export function useAuditActorsQuery() {
  return useQuery({
    queryKey: ['auditActors'],
    queryFn: () => api.get<AuditActor[]>('/audit/actors'),
    staleTime: 60_000,
  });
}
