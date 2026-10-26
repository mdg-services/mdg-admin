import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { AdminAutopay, AdminAutopayOverview, StartAutopayResult } from '@dk/shared';
import type {
  AutopayFollowUpInput,
  AutopayMoneyBackInput,
  StopAutopayAdminInput,
} from '@dk/shared/schemas';

import { outletSetupRoot } from './useOnboarding';
import { paymentsRoot } from './usePayments';

/** Every autopay query hangs off this prefix, so one invalidation refreshes them all. */
export const autopayRoot = ['autopay'] as const;
export const autopayOverviewKey = (dealerId: string | undefined) =>
  ['autopay', 'overview', dealerId] as const;

/**
 * One outlet's autopay on its Setup card (`GET /admin/autopay/dealers/:dealerId`):
 * the one that is running, the ones that ended, and whether "Set up autopay" can be
 * pressed and, if not, why.
 *
 * The owner approves on their own phone and Razorpay tells the server, so nothing
 * on this screen is touched when it happens. While an autopay is waiting for that
 * approval, or a debit is failing and being retried, the card asks again every
 * half minute; otherwise it leaves the server alone.
 */
export function useAutopayOverview(dealerId: string | undefined) {
  return useQuery({
    queryKey: autopayOverviewKey(dealerId),
    queryFn: () => api.get<AdminAutopayOverview>(`/admin/autopay/dealers/${dealerId}`),
    enabled: !!dealerId,
    staleTime: 15_000,
    refetchInterval: (q) => {
      const state = q.state.data?.current?.state;
      return state === 'setting_up' || state === 'failing' ? 30_000 : false;
    },
  });
}

/**
 * Everything a change to an autopay touches: the outlet's overview, the payments
 * lists and drawer (a debit settles a bill; a stop turns the next one back into a
 * link), the outlet's Setup card (its bill and paid-through rows), and the
 * `autopay_stopped` alert that is raised by a stop and cleared by the call.
 * Run on SETTLED, so a refusal (somebody else just stopped it) also pulls the
 * screen back to the truth.
 */
function refreshAfterChange(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: autopayRoot });
  void qc.invalidateQueries({ queryKey: paymentsRoot });
  void qc.invalidateQueries({ queryKey: outletSetupRoot });
  void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
}

/**
 * "Set up autopay" for a live outlet (`POST /admin/autopay/dealers/:dealerId`, no
 * body). The server makes the subscription and Razorpay texts the approval link
 * to the owner; the answer carries the autopay and the words (and a `wa.me` link)
 * for a person to send by hand. Any admin.
 *
 * Refused with 409 and a plain sentence when it is already on, the first month is
 * not paid yet, or the outlet is paused or closed; with 503 when Razorpay is
 * switched off. The sentence is for showing as it is.
 */
export function useStartAutopay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dealerId: string) =>
      api.post<StartAutopayResult>(`/admin/autopay/dealers/${dealerId}`),
    onSettled: () => refreshAfterChange(qc),
  });
}

/**
 * Stop an autopay on the owner's word (`POST /admin/autopay/:id/stop`). The note
 * says who asked and how and is required; the reason is optional. The services do
 * not stop: the next bill goes as a link. Any admin.
 */
export function useStopAutopay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & StopAutopayAdminInput) =>
      api.post<AdminAutopay>(`/admin/autopay/${id}/stop`, body),
    onSettled: () => refreshAfterChange(qc),
  });
}

/**
 * The call after a stop is done, with what the owner said
 * (`POST /admin/autopay/:id/follow-up`). Clears the `autopay_stopped` alert.
 */
export function useAutopayFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string } & AutopayFollowUpInput) =>
      api.post<AdminAutopay>(`/admin/autopay/${id}/follow-up`, { note }),
    onSettled: () => refreshAfterChange(qc),
  });
}

/** Ask Razorpay about it now instead of waiting for it to tell us (`POST /admin/autopay/:id/refresh`). */
export function useRefreshAutopay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<AdminAutopay>(`/admin/autopay/${id}/refresh`),
    onSettled: () => refreshAfterChange(qc),
  });
}

/**
 * The first-month money-back (`POST /admin/autopay/dealers/:dealerId/money-back`):
 * autopay is stopped first, then the first bill is refunded in full (its credit
 * note follows). Super-admins only; the note goes on the refund.
 */
export function useMoneyBack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, ...body }: { dealerId: string } & AutopayMoneyBackInput) =>
      api.post<AdminAutopayOverview>(`/admin/autopay/dealers/${dealerId}/money-back`, body),
    onSettled: () => refreshAfterChange(qc),
  });
}
