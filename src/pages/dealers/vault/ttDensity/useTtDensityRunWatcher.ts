import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { ttDensityKeys } from '@/hooks/api/useTtDensity';
import { api } from '@/lib/api';
import { describeRunFailure } from '@/lib/runFailure';
import type { ServiceRun } from '@dk/shared';

/**
 * Watch a queued invoice fetch to completion, then refresh the pane and say what
 * happened.
 *
 * "Fetch invoices now" answers 202 and drives a browser against the IndianOil
 * portal for about a minute, so the queries invalidated at the moment of the
 * click would only re-fetch the OLD figures — the run has not read a single row
 * yet. Polling the run and invalidating again on a terminal status is what makes
 * a new density appear without the operator reloading the page.
 *
 * The shape is `pages/dsr/useDsrRunWatcher.ts`, kept as a separate hook rather
 * than generalised: the two differ in which cache they clear and in what they
 * say when a run fails, and a shared version would need both of those as
 * parameters, which is a worse thing to read than two short files.
 */
export function useTtDensityRunWatcher(dealerId: string) {
  const toast = useToast();
  const qc = useQueryClient();
  const [runId, setRunId] = React.useState<string | null>(null);

  // The pane is remounted per dealer today, but a run started for dealer A must
  // still be dropped if it ever is not — otherwise B's caches get invalidated
  // and B's operator gets toasted for A's collection.
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
    void qc.invalidateQueries({ queryKey: ttDensityKeys.all });
    toast.info(
      'Lost track of that fetch — it is probably still finishing. Refresh in a moment.',
    );
  }, [poll.isError, runId, qc, toast]);

  React.useEffect(() => {
    const st = poll.data?.status;
    if (!runId || (st !== 'SUCCESS' && st !== 'FAILED')) return;
    void qc.invalidateQueries({ queryKey: ttDensityKeys.all });
    if (st === 'SUCCESS') {
      toast.success('Invoices fetched — the figures below are up to date.');
    } else {
      // Say WHY at the point of action. The commonest failures here are ones an
      // admin can act on — wrong SDMS credentials most of all — so sending them
      // off to Run history to find that out was a step too many.
      const copy = poll.data ? describeRunFailure(poll.data) : null;
      toast.error(
        copy?.known
          ? `${copy.title} — ${copy.hint}`
          : "The invoices could not be fetched. Open the dealer's Run history for details.",
      );
    }
    setRunId(null);
  }, [poll.data, poll.data?.status, runId, qc, toast]);

  return {
    /** The fetch being watched, or `null` when idle. */
    runId,
    /** Start watching a freshly queued fetch. */
    watch: setRunId,
    busy: runId !== null,
  };
}
