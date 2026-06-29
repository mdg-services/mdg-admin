import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { ServicePluginCatalogEntry } from '@dk/shared';

export function useServicesQuery() {
  return useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<ServicePluginCatalogEntry[]>('/services'),
    staleTime: 5 * 60_000,
  });
}
