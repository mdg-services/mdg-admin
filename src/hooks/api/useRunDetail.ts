import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { ServiceRunWithSteps } from '@/types/serviceRun';

export interface UseRunDetailOptions {
  /** Poll every 2s while the run is still PENDING or RUNNING. */
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
      // A queued run hasn't started yet — keep polling so the in-progress
      // notice resolves into the result on its own.
      return data?.status === 'RUNNING' || data?.status === 'PENDING'
        ? 2000
        : false;
    },
  });
}
