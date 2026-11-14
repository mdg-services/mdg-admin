import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { fuelIndentKeys } from '@/hooks/api/useFuelIndent';
import { api } from '@/lib/api';
import { describeRunFailure } from '@/lib/runFailure';
import type { ServiceRun } from '@dk/shared';

/**
 * Watch a "Check now" queued through the generic dealer-service endpoint to its
 * end, then re-read the pane.
 *
 * The run answers with an id and THEN signs in to SDMS and reads View/Cancel
 * Indents, which takes about a minute. Re-reading at the click would fetch the
 * old list and the toast would promise a refresh that never came, so the pane
 * polls the run and re-reads when it actually ends.
 *
 * The shape is `loadPlanner/useLoadPlannerRunWatcher.ts`'s, kept as its own
 * file for the reason that one gives: a shared version would need the cache key
 * and the closing words as parameters, which reads worse than two short files.
 */
export function useFuelIndentRunWatcher(dealerId: string) {
  const toast = useToast();
  const qc = useQueryClient();
  const [runId, setRunId] = React.useState<string | null>(null);

  // A run started for outlet A must never clear B's cache or toast B's admin.
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
    void qc.invalidateQueries({ queryKey: fuelIndentKeys.all });
    toast.info('Lost track of that check. It is probably still going; refresh in a minute.');
  }, [poll.isError, runId, qc, toast]);

  React.useEffect(() => {
    const st = poll.data?.status;
    if (!runId || (st !== 'SUCCESS' && st !== 'FAILED')) return;
    void qc.invalidateQueries({ queryKey: fuelIndentKeys.all });
    if (st === 'SUCCESS') {
      toast.success('Read the portal’s order list. The orders below are up to date.');
    } else {
      const copy = poll.data ? describeRunFailure(poll.data) : null;
      toast.error(
        copy?.known
          ? `${copy.title} — ${copy.hint}`
          : 'The portal’s order list could not be read. Open the dealer’s Run history for details.',
      );
    }
    setRunId(null);
  }, [poll.data, poll.data?.status, runId, qc, toast]);

  return {
    watch: setRunId,
    busy: runId !== null,
  };
}
