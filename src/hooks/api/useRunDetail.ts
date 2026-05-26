import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { ServiceRunWithSteps } from '@/types/serviceRun';

export interface UseRunDetailOptions {
  /** Poll every 2s while the run status is RUNNING. */
  pollWhileRunning?: boolean;
}

export function useRunDetail(
  runId: string | undefined,
  options: UseRunDetailOptions = {},
) {
  const { pollWhileRunning = false } = options;
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.get<ServiceRunWithSteps>(`/runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) => {
      if (!pollWhileRunning) return false;
      const data = query.state.data as ServiceRunWithSteps | undefined;
      return data?.status === 'RUNNING' ? 2000 : false;
    },
  });
}
