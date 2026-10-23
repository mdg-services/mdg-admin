import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { AdminPayment, AdminPaymentsList, PaymentLink, PaymentsConfig } from '@dk/shared';
import type {
  AdminPaymentsQuery,
  CancelPaymentInput,
  CreatePaymentInput,
  RefundPaymentInput,
} from '@dk/shared/schemas';

/** Every payment query hangs off this prefix, so one invalidation refreshes them all. */
export const paymentsRoot = ['payments'] as const;
export const paymentsConfigKey = ['payments', 'config'] as const;
export const paymentsListKey = (params: ListParams) => ['payments', 'list', params] as const;
export const paymentKey = (id: string) => ['payments', 'one', id] as const;

/** What the list asks the server for: `GET /admin/payments`, with the page and the filters. */
export type ListParams = Pick<AdminPaymentsQuery, 'status' | 'dealerId' | 'q'> & {
  page: number;
  limit: number;
};

/**
 * What the server answers to a new payment: the payment itself, and — only when
 * it was asked to send a link and Razorpay refused — why the link could not be
 * made. The payment exists either way (ADR 0022 §6), so this is a warning on a
 * success and not an error.
 */
export type CreatedPayment = AdminPayment & { linkError?: string | null };

/**
 * Whether the server can take payments, and in which Razorpay mode. Answers
 * even with no keys set, which is the whole point: it is how the page knows to
 * say "switched off" instead of failing every other request.
 */
export function usePaymentsConfigQuery() {
  return useQuery({
    queryKey: paymentsConfigKey,
    queryFn: () => api.get<PaymentsConfig>('/admin/payments/config'),
    staleTime: 60_000,
  });
}

/**
 * One page of payments, newest first, with the three totals over everything the
 * filters match. The previous page stays on screen while the next one loads, so
 * typing in the search box does not blink the list.
 *
 * A payment settles without anyone touching this screen — the dealer pays on
 * their phone and Razorpay tells the server — so it polls once a minute.
 */
export function usePaymentsQuery(params: ListParams, enabled = true) {
  return useQuery({
    queryKey: paymentsListKey(params),
    queryFn: () =>
      api.get<AdminPaymentsList>('/admin/payments', {
        status: params.status,
        dealerId: params.dealerId,
        q: params.q,
        page: params.page,
        limit: params.limit,
      }),
    // Off while the server has no Razorpay keys: every payment route but the
    // config answers 503 then, and asking would only fill the page with errors.
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

/**
 * One payment, for the drawer. Its own request rather than a row picked out of
 * the list, because the drawer is opened by a link (`?payment=`) from the
 * activity log and from an alert, and that payment may not be on the page the
 * list happens to be showing.
 */
export function usePaymentQuery(id: string | null) {
  return useQuery({
    queryKey: paymentKey(id ?? ''),
    queryFn: () => api.get<AdminPayment>(`/admin/payments/${id}`),
    enabled: !!id,
    staleTime: 10_000,
    // While one is being confirmed the drawer should catch up with it by itself.
    refetchInterval: (q) => (q.state.data?.status === 'processing' ? 15_000 : false),
  });
}

/**
 * Everything a change to a payment touches: the lists and their totals, the
 * open drawer, and the `payment_problem` alert that clears when a person marks
 * the payment checked. Run on SETTLED, so a failure (somebody else just
 * cancelled it) also pulls the screen back to the truth.
 */
function useRefreshAfterChange() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: paymentsRoot });
    void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
  };
}

/** Raise a payment for an outlet, and (unless told not to) have Razorpay send the link by SMS. */
export function useCreatePayment() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (input: CreatePaymentInput) => api.post<CreatedPayment>('/admin/payments', input),
    onSettled: refresh,
  });
}

/** Withdraw a payment nobody has paid. Only a `due` one; the reason is kept with it. */
export function useCancelPayment() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string } & CancelPaymentInput) =>
      api.post<AdminPayment>(`/admin/payments/${id}/cancel`, { reason }),
    onSettled: refresh,
  });
}

/**
 * Give money back. Super-admin only (the server enforces it; the button is
 * hidden for everyone else). Leave `amountPaise` out to return everything not
 * yet returned.
 */
export function useRefundPayment() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, amountPaise, reason }: { id: string } & RefundPaymentInput) =>
      api.post<AdminPayment>(`/admin/payments/${id}/refund`, { amountPaise, reason }),
    onSettled: refresh,
  });
}

/**
 * A link to put into WhatsApp: the live one, or a fresh one made without an SMS.
 * Asking can create the link, so the row's `linkUrl` may have changed.
 */
export function usePaymentLink() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (id: string) => api.post<PaymentLink>(`/admin/payments/${id}/link`),
    onSettled: refresh,
  });
}

/** Ask Razorpay to send the link to the outlet again, by SMS and by email where there is one. */
export function useResendPaymentLink() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (id: string) => api.post<unknown>(`/admin/payments/${id}/resend`),
    onSettled: refresh,
  });
}

/** Look the payment up at Razorpay now instead of waiting for it to tell us. */
export function useRefreshPayment() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (id: string) => api.post<AdminPayment>(`/admin/payments/${id}/refresh`),
    onSettled: refresh,
  });
}

/** A person has looked at what went wrong with this payment. Clears its alert. */
export function useMarkPaymentProblemChecked() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (id: string) => api.post<AdminPayment>(`/admin/payments/${id}/problem-checked`),
    onSettled: refresh,
  });
}
