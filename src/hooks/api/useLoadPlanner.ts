import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { LoadPlan, LoadPlannerOverview } from '@dk/shared';

/**
 * The Load Planner's five endpoints, mounted at `/api/v1/load-planner`.
 *
 * Shaped like `useLedgerWatch.ts` / `useRoSupplyStatus.ts`: one query key prefix
 * (`all`) so a write can clear everything this feature caches with a single
 * invalidate, a plain `useQuery` for the overview, and a short-`staleTime`
 * query for the card — its URLs are short-lived signatures, so a cached copy
 * that outlived its signature would 403 on click (the failure Ledger Watch's
 * own card query already guards against).
 *
 * "Run now" is NOT here. It reuses the generic dealer-service run-now endpoint
 * (`useRunNow` in `useDealerServices.ts`) with `overview.dealerServiceId` — the
 * Load Planner has no run endpoint of its own, only an overview to re-read once
 * that run lands (see `useLoadPlannerRunWatcher.ts`).
 */
export const loadPlannerKeys = {
  all: ['loadPlanner'] as const,
  overview: (dealerId: string | undefined) => ['loadPlanner', 'overview', dealerId] as const,
  card: (planId: string | undefined) => ['loadPlanner', 'card', planId] as const,
};

/**
 * Everything one dealer's Load Planner pane needs in one response — whether the
 * service is attached, the latest plan, the 30-day history and the scorecard.
 *
 * `staleTime` is 30s, the same choice `useRoSupplyStatus` makes and for the same
 * reason: this is opened deliberately by someone about to decide whether to send
 * a plan, so a figure more than half a minute old is worth a quiet re-check, not
 * a deliberate refresh they have to ask for.
 */
export function useLoadPlannerOverview(dealerId: string | undefined) {
  return useQuery({
    queryKey: loadPlannerKeys.overview(dealerId),
    enabled: !!dealerId,
    queryFn: () => api.get<LoadPlannerOverview>(`/load-planner/dealers/${dealerId}`),
    staleTime: 30_000,
  });
}

/** `GET /load-planner/plans/:planId/card` — signed URLs of the stored PNG, or
 *  `null` when nothing has been drawn for this plan yet. */
export interface LoadPlanCardUrls {
  url: string;
  downloadUrl: string;
}

export function useLoadPlanCard(planId: string | undefined) {
  return useQuery({
    queryKey: loadPlannerKeys.card(planId),
    enabled: !!planId,
    queryFn: () => api.get<LoadPlanCardUrls | null>(`/load-planner/plans/${planId}/card`),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

/**
 * Draw the card if it does not exist yet, then sign it.
 *
 * Idempotent on the server: a plan's card is drawn once and kept (a plan's
 * figures never change after it is made, and a re-run draft resets its card so
 * it is drawn again). Pressing it again only re-signs the stored picture —
 * signed links expire — so this one mutation sits behind both "Draw card" and
 * "Reload image".
 */
export function useDrawLoadPlanCard(planId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<LoadPlanCardUrls>(`/load-planner/plans/${planId}/card`, {}),
    onSuccess: (data) => {
      qc.setQueryData(loadPlannerKeys.card(planId), data);
    },
  });
}

export interface ApproveLoadPlanResult {
  alreadyShared: boolean;
  conversationId: string;
  messageId: string;
  plan: LoadPlan;
}

/**
 * Approve a plan and send its card into the dealer's chat.
 *
 * `dealerId` is only here to invalidate the right overview — the request itself
 * needs nothing but the plan id, which the server already owns the dealer of.
 */
export function useApproveLoadPlan(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => api.post<ApproveLoadPlanResult>(`/load-planner/plans/${planId}/approve`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: loadPlannerKeys.overview(dealerId) });
    },
  });
}

export function useDismissLoadPlan(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, reason }: { planId: string; reason: string }) =>
      api.post<LoadPlan>(`/load-planner/plans/${planId}/dismiss`, { reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: loadPlannerKeys.overview(dealerId) });
    },
  });
}
