import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, api } from '@/lib/api';
import type {
  TtDensitySummary,
  TtInvoice,
  TtInvoiceSummary,
  TtSignedFileUrls,
 BrowserPlace } from '@dk/shared';

/**
 * Every TT Density request the admin makes.
 *
 * Two things here are not boilerplate and are worth reading before changing.
 *
 * First, the PDF URL query treats a 404 as an ANSWER, not a failure. The portal
 * lists an invoice before we manage to download it, and a run that ran out of
 * its seven minutes leaves rows in exactly that state — so "we have not got the
 * file yet" is an ordinary Tuesday, and the drawer renders it as a block with a
 * Fetch button while still showing every figure we read. Retrying it, or routing
 * it through the generic error path into a red toast, would tell an operator
 * something is broken when nothing is.
 *
 * Second, the day range is one endpoint asked two different questions. The pane's
 * first paint wants "the last N days"; the month calendar wants "August" the
 * moment somebody presses the back arrow. They are separate keys so switching
 * months does not evict the strip, and both are cached under the same
 * `ttDensityKeys.all` prefix so one invalidation after an upload refreshes the
 * calendar, the counter and the summary together.
 */

/**
 * Every key hangs off the `['ttDensity']` prefix so one invalidation after a
 * fetch refreshes the hero and the invoice list at once.
 */
export const ttDensityKeys = {
  all: ['ttDensity'] as const,
  summary: (dealerId: string | undefined) => ['ttDensity', 'summary', dealerId] as const,
  invoices: (dealerId: string | undefined, params: TtInvoiceListParams) =>
    ['ttDensity', 'invoices', dealerId, params] as const,
  invoice: (dealerId: string | undefined, invoiceId: string | undefined) =>
    ['ttDensity', 'invoice', dealerId, invoiceId] as const,
  pdfUrl: (dealerId: string | undefined, invoiceId: string | undefined) =>
    ['ttDensity', 'pdfUrl', dealerId, invoiceId] as const,
};

/** Inclusive IST bounds and paging for the invoice list (A2). */
export interface TtInvoiceListParams {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** A2's envelope. */
export interface TtInvoiceListResponse {
  items: TtInvoiceSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * A client error never benefits from a retry, and the 404 that means "the file
 * has not downloaded yet" is a state this UI renders rather than an error it
 * reports. Only genuinely transient failures get the one retry.
 */
function retryUnlessClientError(count: number, err: unknown): boolean {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
  return count < 1;
}

/**
 * The pane's whole payload: the headline figures, the recent invoices, the last
 * fortnight of register days and how the newest run went. Never 404s — a dealer
 * that has never been collected answers with an empty summary — so this drives
 * the pane directly rather than through a "does it exist" branch.
 */
export function useTtDensitySummary(dealerId: string | undefined) {
  return useQuery({
    queryKey: ttDensityKeys.summary(dealerId),
    enabled: !!dealerId,
    queryFn: () =>
      api.get<TtDensitySummary>(`/tt-density/dealers/${dealerId}/summary`),
    staleTime: 30_000,
  });
}

/** A page of this dealer's invoices, for a window wider than the summary's recent list. */
export function useTtDensityInvoices(
  dealerId: string | undefined,
  params: TtInvoiceListParams = {},
  enabled = true,
) {
  return useQuery({
    queryKey: ttDensityKeys.invoices(dealerId, params),
    enabled: !!dealerId && enabled,
    queryFn: () =>
      api.get<TtInvoiceListResponse>(`/tt-density/dealers/${dealerId}/invoices`, {
        from: params.from,
        to: params.to,
        page: params.page,
        pageSize: params.pageSize,
      }),
    staleTime: 30_000,
  });
}

/**
 * One invoice in full — the tank numbers, compartments, sample references and
 * document numbers the list deliberately does not carry. Asked only when the
 * drawer is open.
 */
export function useTtInvoice(
  dealerId: string | undefined,
  invoiceId: string | undefined,
) {
  return useQuery({
    queryKey: ttDensityKeys.invoice(dealerId, invoiceId),
    enabled: !!dealerId && !!invoiceId,
    queryFn: () =>
      api.get<TtInvoice>(`/tt-density/dealers/${dealerId}/invoices/${invoiceId}`),
    retry: retryUnlessClientError,
    staleTime: 5 * 60_000,
  });
}

/**
 * The two signed URLs for one invoice PDF — `inline` for the frame, `attachment`
 * for the Download button.
 *
 * A second request on purpose: the drawer opens on facts it already holds and
 * fills the frame when the signature lands, so an operator reads the densities
 * immediately instead of watching a spinner, and still reads them when there is
 * no file to sign at all.
 *
 * They expire, which is why this is not cached long: a drawer left open over
 * lunch re-signs on reopen rather than feeding the frame a dead URL.
 */
export function useTtInvoicePdfUrl(
  dealerId: string | undefined,
  invoiceId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ttDensityKeys.pdfUrl(dealerId, invoiceId),
    enabled: !!dealerId && !!invoiceId && enabled,
    queryFn: () =>
      api.get<TtSignedFileUrls>(
        `/tt-density/dealers/${dealerId}/invoices/${invoiceId}/pdf-url`,
      ),
    retry: retryUnlessClientError,
    gcTime: 60_000,
    staleTime: 0,
  });
}

/**
 * "Fetch invoices now" — queues one collection and answers 202 with a run id.
 * The caller watches that run to completion; nothing here waits for it.
 */
export function useCollectTtDensity(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input?: { lookbackDays?: number; browserOn?: BrowserPlace }) =>
      api.post<{ runId: string }>(
        `/tt-density/dealers/${dealerId}/collect`,
        input ?? {},
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ttDensityKeys.summary(dealerId) });
    },
  });
}
