import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  AdminPayment,
  OutletSetupAdmin,
  SendSetupBillResult,
  SetupMessageLang,
} from '@dk/shared';
import type { RecordManualPaymentInput } from '@dk/shared/schemas';

import { refreshAfterChange } from './useOnboarding';
import { paymentsRoot } from './usePayments';

/**
 * "Send bill": raises the outlet's bill as a payment, makes the Razorpay link
 * (Razorpay texts it) and sends the WhatsApp by template — or hands back the words
 * for the team to send by hand, in the one language `messageLang` names (the
 * outlet's default when left out). Leave the body empty for the flat monthly price
 * due in the usual days. The answer carries the fresh setup and how the bill
 * went out (`POST /dealers/:id/setup/bill`). Any admin.
 */
export function useSendBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dealerId,
      body,
    }: {
      dealerId: string;
      body: { amountPaise?: number; dueOn?: string; messageLang?: SetupMessageLang };
    }) => api.post<SendSetupBillResult>(`/dealers/${dealerId}/setup/bill`, body),
    onSettled: (_data, _err, vars) => {
      refreshAfterChange(qc, vars.dealerId);
      void qc.invalidateQueries({ queryKey: paymentsRoot });
    },
  });
}

/**
 * Money that came outside Razorpay, recorded against a payment by id
 * (`POST /admin/payments/:id/manual`). Any admin. The invoice, the dealer's
 * receipt and an outlet's onboarding follow, as for a Razorpay payment.
 */
export function useRecordManualPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RecordManualPaymentInput }) =>
      api.post<AdminPayment>(`/admin/payments/${id}/manual`, body),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: paymentsRoot });
      // The outlet's onboarding may have moved with it (a bill raised for its setup).
      refreshAfterChange(qc);
    },
  });
}

/**
 * The same money, recorded through the outlet's setup (`POST /dealers/:id/setup/
 * payment`): the route to use for a bill that has no payment id yet (one recorded
 * as sent before bills were payments). Any admin.
 */
export function useRecordSetupPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dealerId,
      body,
    }: {
      dealerId: string;
      body: { amountPaise: number; paidOn: string; mode: string; reference?: string };
    }) => api.post<OutletSetupAdmin>(`/dealers/${dealerId}/setup/payment`, body),
    onSettled: (_data, _err, vars) => {
      refreshAfterChange(qc, vars.dealerId);
      void qc.invalidateQueries({ queryKey: paymentsRoot });
    },
  });
}

/** Pause the outlet's services for non-payment, with a reason. Any admin. */
export function usePauseBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, reason }: { dealerId: string; reason: string }) =>
      api.post<OutletSetupAdmin>(`/dealers/${dealerId}/setup/billing-hold`, { reason }),
    // The services list changes with it: its rows turn Paused.
    onSettled: (_data, _err, vars) => {
      refreshAfterChange(qc, vars.dealerId);
      void qc.invalidateQueries({ queryKey: ['dealerServices', vars.dealerId] });
    },
  });
}

/** Resume exactly the services the pause stopped. Any admin. */
export function useResumeBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dealerId: string) =>
      api.del<OutletSetupAdmin>(`/dealers/${dealerId}/setup/billing-hold`),
    onSettled: (_data, _err, dealerId) => {
      refreshAfterChange(qc, dealerId);
      void qc.invalidateQueries({ queryKey: ['dealerServices', dealerId] });
    },
  });
}
