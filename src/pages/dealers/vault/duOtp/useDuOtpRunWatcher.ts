import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { useToast } from '@/components/ui';
import { duOtpKeys } from '@/hooks/api/useDuOtp';
import { api } from '@/lib/api';
import { describeRunFailure } from '@/lib/runFailure';
import type { DuOtpAdminView, ServiceRun } from '@dk/shared';

/** What the watched run was for, so the closing toast can say it in the right words. */
export type DuOtpWatchKind = 'check' | 'submit' | 'testFill';

interface Watched {
  runId: string;
  kind: DuOtpWatchKind;
  /** The group a submit or test fill is for, so only that group's button shows the spinner. */
  group: string | null;
}

const FALLBACK_DONE: Record<DuOtpWatchKind, string> = {
  check: 'Read the portal list. The events below are up to date.',
  submit: 'The portal row was filed. What IndianOil replied is on the event below.',
  testFill: 'Test fill finished. Nothing was filed.',
};

const FALLBACK_FAILED: Record<DuOtpWatchKind, string> = {
  check: 'The portal list could not be read. See the runs below.',
  submit: 'The row was not filed. See the event below for why.',
  testFill: 'The test fill did not finish. See the runs below.',
};

/**
 * Watch a queued run of this service to its end, then re-read the pane and say
 * what happened.
 *
 * `check` and `submit` answer a run id and THEN drive IndianOil's portal for a
 * minute or more. Re-reading at the moment of the click would fetch the old
 * answer, because the run has not opened the portal yet, and the toast would
 * promise a refresh that never came. So the pane polls the run, and when it
 * ends it re-reads the view and speaks in the run's own summary — the plain
 * words the server wrote for what it found or did — falling back to a general
 * line only when the summary is empty.
 *
 * The shape is `roSupply/useRoSupplyRunWatcher.ts`, kept as its own file for the
 * reason that one gives: the two differ in which cache they clear and in what
 * they say when a run ends.
 */
export function useDuOtpRunWatcher(dealerId: string) {
  const toast = useToast();
  const qc = useQueryClient();
  const [watched, setWatched] = React.useState<Watched | null>(null);
  const handled = React.useRef<string | null>(null);

  // A run started for outlet A must be dropped if the pane ever stops being
  // remounted per outlet — otherwise B's cache is cleared and B's admin is
  // toasted for A's run.
  const owner = React.useRef(dealerId);
  if (owner.current !== dealerId) {
    owner.current = dealerId;
    if (watched !== null) setWatched(null);
  }

  const runId = watched?.runId ?? null;
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
    if (!watched || !poll.isError) return;
    // Lost sight of the run — it is still finishing server-side.
    setWatched(null);
    void qc.invalidateQueries({ queryKey: duOtpKeys.dealer(dealerId) });
    toast.info('Lost track of that run. It is probably still going; this section refreshes when it ends.');
  }, [poll.isError, watched, qc, toast, dealerId]);

  React.useEffect(() => {
    const status = poll.data?.status;
    if (!watched || (status !== 'SUCCESS' && status !== 'FAILED')) return;
    if (handled.current === watched.runId) return;
    handled.current = watched.runId;
    const { runId: id, kind } = watched;
    const run = poll.data;

    void (async () => {
      // Wait for the re-read so the summary below is this run's, not the last one's.
      await qc.invalidateQueries({ queryKey: duOtpKeys.dealer(dealerId) });
      const view = qc.getQueryData<DuOtpAdminView>(duOtpKeys.dealer(dealerId));
      const summary = view?.runs.find((r) => r.id === id)?.summary?.trim() || null;
      if (status === 'SUCCESS') {
        toast.success(summary ?? FALLBACK_DONE[kind]);
      } else {
        const copy = run ? describeRunFailure(run) : null;
        toast.error(
          summary ??
            (copy?.known ? `${copy.title} — ${copy.hint}` : FALLBACK_FAILED[kind]),
        );
      }
      setWatched(null);
    })();
  }, [poll.data, watched, qc, toast, dealerId]);

  return {
    /** Start watching a freshly queued run. */
    watch: (runId: string, kind: DuOtpWatchKind, group: string | null = null) => {
      handled.current = null;
      setWatched({ runId, kind, group });
    },
    /** A run of ours is being watched; the run-starting buttons wait. */
    busy: watched !== null,
    /** What it is, so the button that started it can show its own spinner. */
    kind: watched?.kind ?? null,
    /** Which group it is for, when it is for one. */
    group: watched?.group ?? null,
  };
}
