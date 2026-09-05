import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { roSupplyStatusKeys } from '@/hooks/api/useRoSupplyStatus';
import { api } from '@/lib/api';
import { describeRunFailure } from '@/lib/runFailure';
import type { ServiceRun } from '@dk/shared';

/**
 * Watch a queued supply-status check to completion, then refresh the pane and
 * say what happened.
 *
 * "Check now" answers 202 and then drives a browser against the IndianOil portal
 * for about a minute. Invalidating the summary at the moment of the click — which
 * is what the pane did first — re-fetches the OLD answer, because the run has not
 * opened the portal yet. The toast then promised a refresh that never came, and
 * the operator was left looking at a stale timestamp wondering whether their
 * click had done anything.
 *
 * The shape is `ttDensity/useTtDensityRunWatcher.ts`, kept as its own file for the
 * reason that one gives: the two differ in which cache they clear and in what
 * they say when a run fails, and a shared version parameterised on both is a
 * worse thing to read than two short files.
 */
export function useRoSupplyRunWatcher(dealerId: string) {
  const toast = useToast();
  const qc = useQueryClient();
  const [runId, setRunId] = React.useState<string | null>(null);

  // A check started for dealer A must be dropped if the pane ever stops being
  // remounted per dealer — otherwise B's cache is cleared and B's operator is
  // toasted for A's check.
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
    // Lost sight of the run — it is still finishing server-side.
    setRunId(null);
    void qc.invalidateQueries({ queryKey: roSupplyStatusKeys.all });
    toast.info('Lost track of that check — it is probably still finishing. Refresh in a moment.');
  }, [poll.isError, runId, qc, toast]);

  React.useEffect(() => {
    const st = poll.data?.status;
    if (!runId || (st !== 'SUCCESS' && st !== 'FAILED')) return;
    void qc.invalidateQueries({ queryKey: roSupplyStatusKeys.all });
    if (st === 'SUCCESS') {
      toast.success('Checked — the supply status below is up to date.');
    } else {
      // Say WHY at the point of action. The commonest failure here is SDMS
      // credentials, which an admin can fix themselves, so sending them to Run
      // history to discover that is a step too many.
      const copy = poll.data ? describeRunFailure(poll.data) : null;
      toast.error(
        copy?.known
          ? `${copy.title} — ${copy.hint}`
          : "The supply status could not be checked. Open the dealer's Run history for details.",
      );
    }
    setRunId(null);
  }, [poll.data, poll.data?.status, runId, qc, toast]);

  return {
    /** The check being watched, or `null` when idle. */
    runId,
    /** Start watching a freshly queued check. */
    watch: setRunId,
    busy: runId !== null,
  };
}
