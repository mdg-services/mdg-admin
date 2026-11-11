import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import type { MockDrillAdminView } from '@dk/shared';
import type {
  MockDrillAdminAction,
  MockDrillConfigBody,
  MockDrillReview,
} from '@dk/shared/schemas';

/**
 * Mock Drill (ADR 0034), as the admin's Data Vault pane reads and drives it. The
 * routes are mounted at `/api/v1/mock-drill`; each answers `{ ok: true, data }`,
 * which `api` unwraps.
 *
 * One cache entry per outlet holds the whole `MockDrillAdminView`. Every call an
 * admin makes — a review, an action, a switch — answers that same view, so a
 * mutation REPLACES the cached copy instead of invalidating it. An action that
 * starts a robot run answers at once with the run listed as RUNNING; the pane
 * then re-reads every few seconds (and on the socket's word) until it ends.
 */
export const mockDrillKeys = {
  all: ['mockDrill'] as const,
  dealer: (dealerId: string | undefined) => ['mockDrill', dealerId] as const,
};

/** A run that started longer ago than this and still says RUNNING is a dead record, not work in flight. */
const RUN_LIVE_WINDOW_MS = 30 * 60 * 1000;

/** Is something happening that will change this view by itself: a run in flight, or a filing under way. */
function isMoving(view: MockDrillAdminView | undefined): boolean {
  if (!view) return false;
  const now = Date.now();
  const liveRun = view.runs.some(
    (r) =>
      (r.status === 'RUNNING' || r.status === 'PENDING') &&
      now - new Date(r.startedAt).getTime() < RUN_LIVE_WINDOW_MS,
  );
  return liveRun || view.open?.state === 'submitting';
}

/** `GET /mock-drill/dealers/:dealerId` — everything the pane draws for one outlet. */
export function useMockDrillAdminView(dealerId: string | undefined) {
  return useQuery({
    queryKey: mockDrillKeys.dealer(dealerId),
    enabled: !!dealerId,
    queryFn: () => api.get<MockDrillAdminView>(`/mock-drill/dealers/${dealerId}`),
    staleTime: 15_000,
    refetchInterval: (query) => (isMoving(query.state.data) ? 4_000 : false),
  });
}

function cacheView(qc: QueryClient, dealerId: string, view: MockDrillAdminView): void {
  qc.setQueryData<MockDrillAdminView>(mockDrillKeys.dealer(dealerId), view);
}

/**
 * Re-read this outlet whenever the server says its Mock Drill state moved
 * (`mockDrill:changed`: the owner answered a step, a drill reached review, a run
 * started or ended), and when the app comes back to the foreground.
 *
 * Every admin socket gets the event for every outlet, so the payload's
 * `dealerId` is checked. Pass `undefined` to listen to nothing (a thread that
 * holds no Mock Drill box).
 */
export function useMockDrillLive(dealerId: string | undefined): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    if (!dealerId) return;
    const socket = getSocket();
    if (!socket) return;
    const onChanged = (payload: { dealerId: string }) => {
      if (payload.dealerId !== dealerId) return;
      void qc.invalidateQueries({ queryKey: mockDrillKeys.dealer(dealerId) });
    };
    socket.on('mockDrill:changed', onChanged);
    return () => {
      socket.off('mockDrill:changed', onChanged);
    };
  }, [qc, token, dealerId]);

  React.useEffect(() => {
    if (!dealerId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: mockDrillKeys.dealer(dealerId) });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc, dealerId]);
}

/**
 * `POST /mock-drill/dealers/:dealerId/action` — Ask owner, Check now, Test fill,
 * File now, Retry, Cancel. Answers the whole view again.
 */
export function useMockDrillAction(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MockDrillAdminAction) =>
      api.post<MockDrillAdminView>(`/mock-drill/dealers/${dealerId}/action`, input),
    onSuccess: (view) => {
      if (dealerId) cacheView(qc, dealerId, view);
    },
  });
}

export interface MockDrillReviewVars {
  submissionId: string;
  body: MockDrillReview;
}

/** `POST /mock-drill/dealers/:dealerId/submissions/:id/review` — approve (with edits) or send back. */
export function useMockDrillReview(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, body }: MockDrillReviewVars) =>
      api.post<MockDrillAdminView>(
        `/mock-drill/dealers/${dealerId}/submissions/${submissionId}/review`,
        body,
      ),
    onSuccess: (view) => {
      if (dealerId) cacheView(qc, dealerId, view);
    },
  });
}

/**
 * `PATCH /mock-drill/dealers/:dealerId/config` — the two switches.
 *
 * Optimistic: a switch is one tap and its answer is the same view with the
 * switch moved, so the pane flips at once and rolls back if the server refuses.
 */
export function useMockDrillConfig(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MockDrillConfigBody) =>
      api.patch<MockDrillAdminView>(`/mock-drill/dealers/${dealerId}/config`, body),
    onMutate: async (body) => {
      if (!dealerId) return { before: undefined };
      await qc.cancelQueries({ queryKey: mockDrillKeys.dealer(dealerId) });
      const before = qc.getQueryData<MockDrillAdminView>(mockDrillKeys.dealer(dealerId));
      if (before) cacheView(qc, dealerId, { ...before, ...body });
      return { before };
    },
    onError: (_err, _body, ctx) => {
      if (dealerId && ctx?.before) cacheView(qc, dealerId, ctx.before);
    },
    onSuccess: (view) => {
      if (dealerId) cacheView(qc, dealerId, view);
    },
  });
}
