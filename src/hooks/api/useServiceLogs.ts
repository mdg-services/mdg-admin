import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { ServiceLog } from '@dk/shared';

export const serviceLogsKey = (dealerId: string | undefined) =>
  ['serviceLogs', dealerId] as const;

export function useServiceLogs(dealerId: string | undefined) {
  return useQuery({
    queryKey: serviceLogsKey(dealerId),
    queryFn: () =>
      api.get<ServiceLog[]>('/service-logs', { dealerId }),
    enabled: !!dealerId,
    staleTime: 30_000,
  });
}
