import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { loadPlannerKeys } from '@/hooks/api/useLoadPlanner';
import { api } from '@/lib/api';
import { describeRunFailure } from '@/lib/runFailure';
import type { ServiceRun } from '@dk/shared';

/**
 * Watch a "Run now" queued through the generic dealer-service endpoint to
 * completion, then refresh the pane.
 *
 * The shape is `ttDensity/useTtDensityRunWatcher.ts`'s, not generalised for the
 * same reason that file gives: a shared version would need the cache key and the
 * success/failure copy as parameters, which is a worse thing to read than two
 * short files. The one real difference here is what success means — the run
 * does not fetch anything new from a portal, it re-plans from the dealer's own
 * stock and sales, so the toast says "today's plan" rather than "fetched".
 */
export function useLoadPlannerRunWatcher(dealerId: string) {
  const toast = useToast();
  const qc = useQueryClient();
  const [runId, setRunId] = React.useState<string | null>(null);

  // Dropped on a dealer switch, exactly as the TT Density watcher drops its own
  // — a run started for dealer A must never invalidate or toast for dealer B.
  const watched = React.useRef(dealerId);
  if (watched.current !== dealerId) {
    watched.current = dealerId;
    if (runId !== null) setRunId(null);
  }

  const poll = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api.get<ServiceRun>(`/runs/${runId}`),
    enabled: !!runId,
    retry: 2,
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      return st === 'SUCCESS' || st === 'FAILED' ? false : 2500;
    },
  });

  React.useEffect(() => {
    if (!runId || !poll.isError) return;
    setRunId(null);
    void qc.invalidateQueries({ queryKey: loadPlannerKeys.all });
    toast.info('Lost track of that run — it is probably still finishing. Refresh in a moment.');
  }, [poll.isError, runId, qc, toast]);

  React.useEffect(() => {
    const st = poll.data?.status;
    if (!runId || (st !== 'SUCCESS' && st !== 'FAILED')) return;
    void qc.invalidateQueries({ queryKey: loadPlannerKeys.all });
    if (st === 'SUCCESS') {
      toast.success("Today's plan is up to date.");
    } else {
      const copy = poll.data ? describeRunFailure(poll.data) : null;
      toast.error(
        copy?.known
          ? `${copy.title} — ${copy.hint}`
          : "The plan could not be made. Open the dealer's Run history for details.",
      );
    }
    setRunId(null);
  }, [poll.data, poll.data?.status, runId, qc, toast]);

  return {
    runId,
    watch: setRunId,
    busy: runId !== null,
  };
}
