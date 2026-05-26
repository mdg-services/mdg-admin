import type { Paginated, ServiceRun, ServiceRunStatus } from '@dk/shared';
import { useQuery } from '@tanstack/react-query';

import { api, type QueryParams } from '@/lib/api';

export interface RunsListParams {
  dealerId?: string;
  serviceId?: string;
  status?: ServiceRunStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function useRunsQuery(params: RunsListParams) {
  return useQuery({
    queryKey: ['runs', params],
    queryFn: () =>
      api.get<Paginated<ServiceRun>>(
        '/runs',
        params as unknown as QueryParams,
      ),
    placeholderData: (prev) => prev,
  });
}

export function useRunQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['run', id],
    queryFn: () => api.get<ServiceRun>(`/runs/${id}`),
    enabled: !!id,
  });
}
