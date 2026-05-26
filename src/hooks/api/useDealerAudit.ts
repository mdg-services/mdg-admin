import type { AuditLog, Paginated } from '@dk/shared';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useDealerAuditQuery(
  id: string | undefined,
  params: { page?: number; pageSize?: number } = {},
) {
  return useQuery({
    queryKey: ['dealerAudit', id, params],
    queryFn: () =>
      api.get<Paginated<AuditLog>>(`/dealers/${id}/audit`, {
        page: params.page,
        pageSize: params.pageSize,
      }),
    enabled: !!id,
  });
}
