import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { FuelIndentVaultView, FuelPlacingControlView } from '@dk/shared';

/**
 * Fuel orders (ADR 0041), mounted at `/api/v1/fuel-indent`.
 *
 * One read endpoint and a few narrow writes, none of which presses anything on
 * the portal: settling a cancel or an order press whose answer was lost and that
 * the order list could not settle, and pausing or resuming PLACING (per outlet;
 * everywhere for a super-admin). Placing and cancelling happen only on an owner's
 * "yes" in the chat, never from the admin.
 * "Check now" is NOT here either: it is the generic dealer-service run-now
 * (`useRunNow` in `useDealerServices.ts`), the same way the Load Planner does it,
 * and the pane re-reads this view once that run lands.
 */
export const fuelIndentKeys = {
  all: ['fuelIndent'] as const,
  dealer: (dealerId: string | undefined) => ['fuelIndent', 'dealer', dealerId] as const,
};

/**
 * Everything one outlet's Fuel orders pane shows: the portal's orders, the
 * orders asked for in the chat, the fuels the outlet may order and when the
 * portal was last read. Never 404s; an outlet with nothing yet gets empty lists.
 *
 * `staleTime` is 30 s, as for the RO supply status: the pane is opened by
 * someone who wants to know now, usually because a dealer rang asking where his
 * tanker is.
 */
export function useFuelIndentView(dealerId: string | undefined) {
  return useQuery({
    queryKey: fuelIndentKeys.dealer(dealerId),
    enabled: !!dealerId,
    queryFn: () => api.get<FuelIndentVaultView>(`/fuel-indent/dealers/${dealerId}`),
    staleTime: 30_000,
  });
}

/**
 * A person looked at the portal and says how an unclear cancel ended. Nothing is
 * pressed; the owner is told how it ended. The answer is the refreshed view.
 */
export function useSettleUnclearCancel(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ indentId, outcome }: { indentId: string; outcome: 'cancelled' | 'not_cancelled' }) =>
      api.post<FuelIndentVaultView>(`/fuel-indent/dealers/${dealerId}/orders/${indentId}/cancel-outcome`, { outcome }),
    onSuccess: (view) => {
      qc.setQueryData(fuelIndentKeys.dealer(dealerId), view);
    },
  });
}

/**
 * A person looked at the portal and says how an unclear ORDER press ended: it went
 * through as order X, or it was not placed. Nothing is pressed; the owner is told
 * how it ended. The answer is the refreshed view.
 */
export function useSettleUnclearPress(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      indentId,
      outcome,
      sapOrderNo,
    }: {
      indentId: string;
      outcome: 'placed' | 'not_placed';
      sapOrderNo?: string;
    }) =>
      api.post<FuelIndentVaultView>(`/fuel-indent/dealers/${dealerId}/orders/${indentId}/press-outcome`, {
        outcome,
        ...(sapOrderNo ? { sapOrderNo } : {}),
      }),
    onSuccess: (view) => {
      qc.setQueryData(fuelIndentKeys.dealer(dealerId), view);
    },
  });
}

/**
 * Pause or resume placing orders through MDG for ONE outlet. Tracking, the tanker
 * messages and "check now" go on. The answer is the refreshed view.
 */
export function useSetDealerPlacing(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { placingPaused: boolean; until?: string | null; reason?: string }) =>
      api.put<FuelIndentVaultView>(`/fuel-indent/dealers/${dealerId}/control`, body),
    onSuccess: (view) => {
      qc.setQueryData(fuelIndentKeys.dealer(dealerId), view);
    },
  });
}

/** Pause or resume placing EVERYWHERE (super-admins only; the server checks). */
export function useSetGlobalPlacing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { placingOn: boolean; reason?: string }) =>
      api.put<FuelPlacingControlView>('/fuel-indent/control', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: fuelIndentKeys.all });
    },
  });
}
