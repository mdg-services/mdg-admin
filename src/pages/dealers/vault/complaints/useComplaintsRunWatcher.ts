import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { complaintsKeys } from '@/hooks/api/useComplaints';
import { api } from '@/lib/api';
import { describeRunFailure } from '@/lib/runFailure';
import type { ServiceRun } from '@dk/shared';

/**
 * Watch a "Check now" to its end, then re-read the pane (same shape as
 * `fuelIndent/useFuelIndentRunWatcher.ts`). The run signs in to the portals and
 * reads the lists, which takes a minute or two, so re-reading at the click would
 * show the old list under a toast that promised a refresh.
 *
 * `watch(undefined)` is for an answer without a run id: nothing to poll, so the
 * pane is re-read after a pause instead.
 */
export function useComplaintsRunWatcher(dealerId: string) {
  const toast = useToast();
  const qc = useQueryClient();
  const [runId, setRunId] = React.useState<string | null>(null);
  const [waiting, setWaiting] = React.useState(false);

  const watched = React.useRef(dealerId);
  if (watched.current !== dealerId) {
    watched.current = dealerId;
    if (runId !== null) setRunId(null);
    if (waiting) setWaiting(false);
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
    void qc.invalidateQueries({ queryKey: complaintsKeys.all });
    toast.info('Lost track of that check. It is probably still going; refresh in a minute.');
  }, [poll.isError, runId, qc, toast]);

  React.useEffect(() => {
    const st = poll.data?.status;
    if (!runId || (st !== 'SUCCESS' && st !== 'FAILED')) return;
    void qc.invalidateQueries({ queryKey: complaintsKeys.all });
    if (st === 'SUCCESS') {
      toast.success('Read the portals’ complaint lists. The complaints below are up to date.');
    } else {
      const copy = poll.data ? describeRunFailure(poll.data) : null;
      toast.error(
        copy?.known
          ? `${copy.title} — ${copy.hint}`
          : 'The portals’ complaint lists could not be read. Open the outlet’s Run history for details.',
      );
    }
    setRunId(null);
  }, [poll.data, poll.data?.status, runId, qc, toast]);

  React.useEffect(() => {
    if (!waiting) return;
    const t = window.setTimeout(() => {
      void qc.invalidateQueries({ queryKey: complaintsKeys.all });
      setWaiting(false);
    }, 45_000);
    return () => window.clearTimeout(t);
  }, [waiting, qc]);

  return {
    watch: (id?: string) => (id ? setRunId(id) : setWaiting(true)),
    busy: runId !== null || waiting,
  };
}
