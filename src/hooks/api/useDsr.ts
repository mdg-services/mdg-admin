import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api';
import type { DsrReportDigest } from '@dk/shared';


/* ─────────────────────────────── Wire shapes ────────────────────────────── */

/**
 * One product's stock-variation headline, as the overview and history lists
 * carry it. `variation` is the meter-vs-dip figure in litres (negative ⇒
 * physical stock is short); `withinLimit` collapses the full advisory to the one
 * bit a list needs — green or not.
 */
export interface DsrProductHeadline {
  productKey: string;
  variation: number;
  withinLimit: boolean;
}

/** The most recent report's headline for a dealer, on the Vault landing. */
export interface DsrOverviewLatest {
  id: string;
  businessDate: string;
  generatedAt: string;
  warningCount: number;
  products: DsrProductHeadline[];
}

/** One dealer row on `GET /dsr/overview`. */
export interface DsrOverviewDealerRow {
  dealerId: string;
  dealerName: string | null;
  dealerCode: string | null;
  enabled: boolean;
  /** `null` for a dealer configured for DSR but never generated. */
  latest: DsrOverviewLatest | null;
}

/** `GET /dsr/overview`. */
export interface DsrOverviewResponse {
  dealers: DsrOverviewDealerRow[];
}

/**
 * A single generated report: the persisted digest plus the signed artifact URLs.
 * `htmlUrl` is the self-contained HTML deliverable rendered inline; `jsonUrl` is
 * the machine-readable export. Both are short-lived signed URLs, so a view is
 * always fetched fresh rather than cached across sessions.
 */
export interface DsrReportView {
  id: string;
  dealerId: string;
  dealerName?: string | null;
  roCode?: string | null;
  outletCode: string;
  businessDate: string;
  digest: DsrReportDigest;
  warnings: string[];
  htmlKey: string;
  jsonKey: string;
  runId: string;
  generatedAt: string;
  htmlUrl?: string;
  jsonUrl?: string;
  /** Downloadable Excel (.xlsx) mirroring the dealer's DSR workbook. */
  xlsxUrl?: string;
  /** Inline signed URLs for the two shareable cards (variation + daily sales). */
  variationCardUrl?: string;
  salesCardUrl?: string;
  /** Set once the report has been shared into the dealer's chat. */
  shared?: {
    at: string;
    by: string;
    conversationId: string;
    messageId: string;
  } | null;
}

/** `POST /dsr/reports/:id/share` result. */
export interface DsrShareResult {
  alreadyShared: boolean;
  conversationId: string;
  messageId: string;
}

/** One report headline in a dealer's history — `GET /dsr/dealers/:id/reports`. */
export interface DsrReportSummary {
  id: string;
  dealerId: string;
  dealerName?: string | null;
  outletCode: string;
  businessDate: string;
  generatedAt: string;
  warningCount: number;
  products: DsrProductHeadline[];
}

/** `GET /dsr/dealers/:dealerId/reports`. */
export interface DsrReportsResponse {
  reports: DsrReportSummary[];
}

/** `POST /dsr/dealers/:dealerId/generate` — 202 with the queued run. */
export interface DsrGenerateAccepted {
  runId: string;
}

/**
 * What to (re)generate. Omit `businessDate` to let the API pick today (IST); pass
 * it to reproduce a specific past day.
 */
export interface DsrGenerateVars {
  dealerId: string;
  /** `YYYY-MM-DD`. */
  businessDate?: string;
}

/* ─────────────────────────────── Query keys ─────────────────────────────── */

/**
 * Every key hangs off the `['dsr']` prefix so one invalidation after a
 * generation refreshes the Vault list, the dealer tab, the history selector and
 * any open report at once.
 */
export const dsrKeys = {
  all: ['dsr'] as const,
  overview: () => ['dsr', 'overview'] as const,
  latest: (dealerId: string | undefined) => ['dsr', 'latest', dealerId] as const,
  reports: (dealerId: string | undefined) =>
    ['dsr', 'reports', dealerId] as const,
  report: (id: string | undefined) => ['dsr', 'report', id] as const,
};

/** A missing report (404) is a normal state here, and a client error never
 * benefits from a retry — only retry once for genuinely transient 5xx/network. */
function retryUnlessClientError(count: number, err: unknown): boolean {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
    return false;
  }
  return count < 1;
}

/* ─────────────────────────────── Queries ────────────────────────────────── */

/**
 * Every DSR-configured dealer with their latest report's headline. Built from
 * the attachments, so a configured-but-never-generated dealer is present with a
 * `null` latest rather than absent.
 */
export function useDsrOverview() {
  return useQuery({
    queryKey: dsrKeys.overview(),
    queryFn: () => api.get<DsrOverviewResponse>('/dsr/overview'),
    staleTime: 30_000,
  });
}

/**
 * A dealer's most recent report in full (digest + signed URLs). Resolves to a
 * 404 `ApiError` when nothing has been generated yet — callers treat that as an
 * empty state, not a failure.
 */
export function useDsrLatest(dealerId: string | undefined) {
  return useQuery({
    queryKey: dsrKeys.latest(dealerId),
    queryFn: () => api.get<DsrReportView>(`/dsr/dealers/${dealerId}/latest`),
    enabled: !!dealerId,
    retry: retryUnlessClientError,
    staleTime: 30_000,
  });
}

/** A dealer's recent report headlines — the business-date selector list. */
export function useDsrReports(dealerId: string | undefined) {
  return useQuery({
    queryKey: dsrKeys.reports(dealerId),
    queryFn: () =>
      api.get<DsrReportsResponse>(`/dsr/dealers/${dealerId}/reports`, {
        limit: 60,
      }),
    enabled: !!dealerId,
    staleTime: 30_000,
  });
}

/**
 * One report by id, in full. A report is immutable until it is regenerated (and
 * a regenerate invalidates the whole `dsr` prefix), so it can be held longer.
 */
export function useDsrReport(id: string | undefined) {
  return useQuery({
    queryKey: dsrKeys.report(id),
    queryFn: () => api.get<DsrReportView>(`/dsr/reports/${id}`),
    enabled: !!id,
    retry: retryUnlessClientError,
    staleTime: 5 * 60_000,
  });
}

/* ────────────────────────────── Mutations ───────────────────────────────── */

/**
 * Generate (or regenerate) a dealer's DSR now. The API answers 202 with the
 * queued `runId`; the report lands asynchronously once the run finishes, so we
 * invalidate the whole `dsr` prefix and let the caller watch the run for the
 * final refresh.
 */
export function useGenerateDsr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, businessDate }: DsrGenerateVars) =>
      api.post<DsrGenerateAccepted>(
        `/dsr/dealers/${dealerId}/generate`,
        businessDate ? { businessDate } : {},
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dsrKeys.all });
    },
  });
}

/**
 * Share a generated report's two cards into the dealer's chat. Idempotent
 * server-side. On success we invalidate the whole `dsr` prefix so the report's
 * `shared` marker (and the "Shared" state in every view) refreshes.
 */
export function useShareDsr(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<DsrShareResult>(`/dsr/reports/${reportId}/share`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dsrKeys.all });
    },
  });
}
