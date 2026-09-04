import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { dsrKeys } from '@/hooks/api/useDsr';
import { api } from '@/lib/api';
import { describeRunFailure } from '@/lib/runFailure';
import type { ServiceRun } from '@dk/shared';

/**
 * Watch a queued DSR run to completion, then refresh the views and say what
 * happened.
 *
 * Every DSR action answers 202 and does its work in the background, so on their
 * own the freshly invalidated queries would re-fetch the OLD report; polling the
 * run and invalidating again on a terminal status is what makes the new one
 * appear without a manual refresh. Shared by every button that starts a run
 * (Generate, back-date, regenerate-stale) so they all behave identically.
 */
export function useDsrRunWatcher(dealerId: string, successMessage: string) {
  const toast = useToast();
  const qc = useQueryClient();
  const [runId, setRunId] = React.useState<string | null>(null);

  // These controls are reused across dealers instead of remounting, so a run
  // started for dealer A must be dropped when the view switches to B —
  // otherwise B's caches get invalidated and toasted for A's completion.
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
    void qc.invalidateQueries({ queryKey: dsrKeys.all });
    // A run rewrites the figures, so the stored verdict is replaced too. The
    // verdict query is keyed on the report id, which does not change across a
    // regeneration, so nothing else would refetch it.
    void qc.invalidateQueries({ queryKey: ['assurance'] });
    toast.info(
      'Lost track of that run — it is probably still finishing. Refresh in a moment.',
    );
  }, [poll.isError, runId, qc, toast]);

  React.useEffect(() => {
    const st = poll.data?.status;
    if (!runId || (st !== 'SUCCESS' && st !== 'FAILED')) return;
    void qc.invalidateQueries({ queryKey: dsrKeys.all });
    // A run rewrites the figures, so the stored verdict is replaced too. The
    // verdict query is keyed on the report id, which does not change across a
    // regeneration, so nothing else would refetch it.
    void qc.invalidateQueries({ queryKey: ['assurance'] });
    if (st === 'SUCCESS') {
      toast.success(successMessage);
    } else {
      // Say WHY at the point of action. The run's failure code and message reach
      // every role, and the commonest failure by far — the day's IRAS shift data
      // could not be collected — is one the admin can act on ("Insufficient
      // Data"), so sending them off to Run history to find that out was a step
      // too many.
      const copy = poll.data ? describeRunFailure(poll.data) : null;
      toast.error(
        copy?.known
          ? `${copy.title} — ${copy.hint}`
          : "The report could not be generated. Open the dealer's Run history for details.",
      );
    }
    setRunId(null);
  }, [poll.data, poll.data?.status, runId, qc, toast, successMessage]);

  return {
    /** The run being watched, or `null` when idle. */
    runId,
    /** Start watching a freshly queued run. */
    watch: setRunId,
    busy: runId !== null,
  };
}
