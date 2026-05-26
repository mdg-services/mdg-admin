import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { OverviewSnapshot } from '@/types/overview';

export function useOverviewQuery() {
  return useQuery({
    queryKey: ['overview'],
    queryFn: () => api.get<OverviewSnapshot>('/overview'),
  });
}
