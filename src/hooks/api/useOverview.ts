import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import type { OverviewSnapshot } from '@/types/overview';
import type { OverviewDay, OverviewHealth } from '@dk/shared';

/**
 * The legacy estate counters. Nothing renders these any more — the Overview page
 * was rewritten around `useOverviewDayQuery` — but the route still serves them
 * and the hook is left for any other caller.
 */
export function useOverviewQuery() {
  return useQuery({
    queryKey: ['overview'],
    queryFn: () => api.get<OverviewSnapshot>('/overview'),
  });
}

/**
 * The ONE definition of the day query's cache key.
 *
 * Exported and shared because the page and the mutations must agree on it
 * exactly. They did not: the page read `['overview','day','default']` (it asks
 * for no particular date) while every one-tap fix wrote to
 * `['overview','day','2026-09-05']`, using the date the SERVER had resolved to.
 * Every button therefore refetched a cache entry nothing was rendering, and the
 * row you had just cleared sat there until the two-minute poll came round.
 *
 * The argument is the date the page ASKED for — `undefined` when it asked for
 * the default — never the `reportingDate` the server answered with.
 */
export const overviewDayKey = (date?: string) =>
  ['overview', 'day', date ?? 'default'] as const;

function dayUrl(date?: string, fresh?: boolean): string {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (fresh) params.set('fresh', '1');
  const qs = params.toString();
  return `/overview/day${qs ? `?${qs}` : ''}`;
}

/**
 * "Today" — the whole Overview page in one request.
 *
 * `refetchInterval` is two minutes, not thirty seconds. The server already
 * caches for twenty, the box is a 908 MB instance that swaps under load, and
 * this screen sits open on a phone all morning; polling it hard would cost more
 * than the freshness is worth. The visibility listener below is what actually
 * makes it feel live — coming back to a backgrounded WebView refetches at once.
 */
export function useOverviewDayQuery(date?: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: overviewDayKey(date),
    queryFn: () => api.get<OverviewDay>(dayUrl(date)),
    staleTime: 20_000,
    refetchInterval: 120_000,
  });

  // The app sets `refetchOnWindowFocus: false` globally, which is right for the
  // heavy screens and wrong for this one: the admin app is a WebView that gets
  // backgrounded every time the phone locks, and coming back to a stale
  // "everything is fine" is exactly the failure this page must not have.
  const { refetch } = q;
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetch]);

  /**
   * What the Refresh button and the "try those again" link must call.
   *
   * NOT `refetch()`. The route holds its own twenty-second cache, so a plain
   * refetch is answered from it — pressing Refresh inside that window returns
   * the identical payload and reads as a dead button. This asks the server to
   * skip its cache and writes the answer straight into the key the page reads.
   */
  const [refreshing, setRefreshing] = React.useState(false);
  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await qc.fetchQuery({
        queryKey: overviewDayKey(date),
        queryFn: () => api.get<OverviewDay>(dayUrl(date, true)),
        staleTime: 0,
      });
    } finally {
      setRefreshing(false);
    }
  }, [qc, date]);

  return { ...q, refresh, refreshing };
}

/** The machinery's vital signs. Super-admin only; 403s for anyone else, so it is gated at the call site. */
export function useOverviewHealthQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['overview', 'health'],
    queryFn: () => api.get<OverviewHealth>('/overview/health'),
    enabled,
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
}

/**
 * Run one of the page's one-tap fixes.
 *
 * `date` is the date the PAGE asked for, so the refetch lands on the key the
 * page is actually rendering — see `overviewDayKey`. Bypassing the server cache
 * is not optional either: without it the refetch is answered from the twenty
 * second window and the row you just cleared stays on screen.
 */
export function useOverviewActionMutation(date?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { path: string; body?: Record<string, unknown> }) =>
      api.post<unknown>(input.path, input.body ?? {}),
    onSuccess: async () => {
      await qc.fetchQuery({
        queryKey: overviewDayKey(date),
        queryFn: () => api.get<OverviewDay>(dayUrl(date, true)),
        staleTime: 0,
      });
    },
  });
}
