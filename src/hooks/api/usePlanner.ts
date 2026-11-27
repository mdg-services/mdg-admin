import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { ConvertBody } from '@/lib/planner';
import type { PlannerView } from '@dk/shared';

import { dealerUsersKey } from './useDealerUsers';
import { refreshAfterChange } from './useOnboarding';

export const adminPlannerKey = (dealerId: string | undefined) => ['adminPlanner', dealerId] as const;

/**
 * One New Pump Guide account's plan, as the team sees it: the same `PlannerView`
 * the person's app reads from GET /v1/me/planner, fetched by dealer id.
 *
 * Only asked for a PLANNING dealer (`enabled`), so opening an outlet never
 * makes a request that can only fail.
 */
export function useAdminPlannerQuery(dealerId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: adminPlannerKey(dealerId),
    queryFn: () => api.get<PlannerView>(`/admin/planners/${dealerId}`),
    enabled: !!dealerId && enabled,
    // The question count moves while the person chats; a minute old is fine for
    // a page an account manager glances at.
    staleTime: 60_000,
  });
}

/**
 * Switch a planner to Dealer Kavach from the team app (ADR 0058 §7), super
 * admins only. The server does the whole switch; afterwards every view of this
 * dealer is stale (status, code, setup, logins), so all of them are re-read and
 * the page redraws as the outlet it now is. Re-read on a failure too, so a
 * switch that half-landed shows the truth rather than the old page.
 */
export function useConvertPlanner(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ConvertBody) =>
      api.post<unknown>(`/admin/planners/${dealerId}/convert`, body),
    onSettled: () => {
      refreshAfterChange(qc, dealerId);
      void qc.invalidateQueries({ queryKey: adminPlannerKey(dealerId) });
      void qc.invalidateQueries({ queryKey: dealerUsersKey(dealerId) });
      // The inbox rows carry the dealer code, which changes from P… to an outlet code.
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
