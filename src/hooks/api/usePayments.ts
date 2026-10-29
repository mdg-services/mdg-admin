import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  AdminPayment,
  AdminPaymentsList,
  GstDocumentDownload,
  PaymentLink,
  PaymentsConfig,
} from '@dk/shared';
import type {
  AdminPaymentsQuery,
  CancelPaymentInput,
  CreatePaymentInput,
  GiveMoreTimeInput,
  HoldChasingInput,
  RecordManualRefundInput,
  RefundPaymentInput,
  UpdateBillToInput,
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
 * Write down money that was given back by hand (`POST /admin/payments/:id/manual-refund`).
 * For a payment that came by hand: Razorpay cannot refund it, so the money goes back
 * the way it came and this records it, which also issues the credit note. Super-admin
 * only (the server enforces it; the button is hidden for everyone else). No money
 * moves from here.
 */
export function useRecordManualRefund() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & RecordManualRefundInput) =>
      api.post<AdminPayment>(`/admin/payments/${id}/manual-refund`, body),
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

/**
 * Say who the GST invoice is made out to, or correct it. The server refuses once
 * the invoice has been issued (the name and figures on it are the legal record),
 * and the drawer stops offering the edit at the same point.
 */
export function useUpdateBillTo() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, billTo }: { id: string } & UpdateBillToInput) =>
      api.patch<AdminPayment>(`/admin/payments/${id}/bill-to`, { billTo }),
    onSettled: refresh,
  });
}

/**
 * Issue the GST invoice now, for a paid payment that was waiting on who to bill
 * or on the company's GST details. Issuing is idempotent on the server, so
 * pressing it twice does no harm. Refreshes the drawer so the invoice appears.
 */
export function useIssueInvoice() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: (id: string) => api.post<AdminPayment>(`/admin/payments/${id}/invoice`),
    onSettled: refresh,
  });
}

/**
 * A GST invoice or credit note, as a short-lived link to the PDF and the name to
 * save it under. A mutation rather than a query on purpose: it is asked for on a
 * press of Download, the link expires within minutes so it must never be served
 * from a cache, and the first ask can take a few seconds while the server draws
 * the PDF. It changes nothing a screen shows, so there is nothing to refresh.
 */
export function useGstDocumentDownload() {
  return useMutation({
    mutationFn: ({ paymentId, docId }: { paymentId: string; docId: string }) =>
      api.get<GstDocumentDownload>(`/admin/payments/${paymentId}/documents/${docId}`),
  });
}

/**
 * Move a bill's pay-by day (`POST /admin/payments/:id/more-time`). Its reminders and
 * the overdue alert move with it. Nothing is sent unless `tellDealer` is true, which
 * sends one app notification with the new day and no link. Any admin, up to 7 days
 * past the bill's first due day; a super-admin further. The server's sentence is shown
 * as it is when it refuses.
 */
export function useGiveMoreTime() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & GiveMoreTimeInput) =>
      api.post<AdminPayment>(`/admin/payments/${id}/more-time`, body),
    onSettled: refresh,
  });
}

/**
 * Hold chasing on a bill autopay is meant to take (`POST /admin/payments/:id/hold-chasing`):
 * no overdue alert, reminder or payment link until the end of `until`. `until: null`
 * lifts the hold. Razorpay's own retries of the debit go on either way.
 */
export function useHoldChasing() {
  const refresh = useRefreshAfterChange();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & HoldChasingInput) =>
      api.post<AdminPayment>(`/admin/payments/${id}/hold-chasing`, body),
    onSettled: refresh,
  });
}

/**
 * The bill an outlet has open right now: its newest subscription bill that is still
 * due (the first bill, or a renewal), with its send history, any hold and any moved
 * day. `null` while there is none. Asked from the payments list because an outlet's
 * Setup card only names its FIRST bill, and the one to act on may be a later one.
 * Off while Razorpay is switched off: every payment route answers 503 then.
 */
export function useOpenBill(dealerId: string | undefined, enabled = true) {
  const q = usePaymentsQuery({ status: 'due', dealerId, page: 1, limit: 20 }, enabled && !!dealerId);
  const bill = (q.data?.items ?? []).find((p) => p.status === 'due' && p.purpose === 'subscription');
  return { bill: bill ?? null, isPending: q.isPending && enabled && !!dealerId };
}
