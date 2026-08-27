import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api';
import type { PnlProductInput } from '@/lib/fuelPnl';
import type {
  DsrReportDigest,
  DsrReportStale,
} from '@dk/shared';


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
  /** Set when a receipt correction left this report out of date. */
  stale?: DsrReportStale | null;
  products: DsrProductHeadline[];
}

/** One dealer row on `GET /dsr/overview`. */
export interface DsrOverviewDealerRow {
  dealerId: string;
  dealerCode: string | null;
  enabled: boolean;
  /** `null` for a dealer configured for DSR but never generated. */
  latest: DsrOverviewLatest | null;
}

/**
 * `GET /dsr/dealers/:dealerId/pnl` — litres for a window, plus the configuration
 * constants that produced them. Mirrors `DsrPnlData` on the server.
 */
export interface DsrPnlResponse {
  dealerId: string;
  outletCode: string | null;
  from: string;
  to: string;
  config: {
    sinceDate: string;
    receiptBasis: 'DECANTED' | 'INVOICE';
    testingPerActivePumpLitres: number;
    testingMinDeltaLitres: number;
  };
  products: PnlProductInput[];
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
  roCode?: string | null;
  outletCode: string;
  businessDate: string;
  digest: DsrReportDigest;
  warnings: string[];
  // The backend emits these as string | null (a report may lack an artifact key
  // or a run id), so the client type must not overstate them as required.
  htmlKey?: string | null;
  jsonKey?: string | null;
  /**
   * Set while an input this report was built from changed after it was
   * generated — a hand-corrected IRAS figure. The figures shown are still the
   * ones that were shared, so the report stays readable — it just needs
   * regenerating.
   */
  stale?: DsrReportStale | null;
  runId?: string | null;
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
  /**
   * The share this report had BEFORE it was last regenerated — i.e. the dealer
   * is holding an OLDER version of these figures and has not been told. Present
   * alongside `shared: null`, which is what makes re-sharing possible again.
   */
  sharedSuperseded?: {
    at: string;
    by: string;
    supersededAt: string;
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
  outletCode: string;
  businessDate: string;
  generatedAt: string;
  warningCount: number;
  stale?: DsrReportStale | null;
  products: DsrProductHeadline[];
}

/** `GET /dsr/dealers/:dealerId/reports`. */
export interface DsrReportsResponse {
  reports: DsrReportSummary[];
}

/** One report that no longer matches its inputs — `GET /dsr/dealers/:id/stale`. */
export interface DsrStaleReport {
  businessDate: string;
  stale: DsrReportStale;
}

/** `GET /dsr/dealers/:dealerId/stale`. */
export interface DsrStaleResponse {
  reports: DsrStaleReport[];
}

/** `POST /dsr/dealers/:dealerId/regenerate-stale` — 202 with the queued run. */
export interface DsrRegenerateStaleAccepted {
  runId: string;
  /** The date the run targets — where the rebuild has to start. */
  businessDate: string;
  /** Every date currently flagged, so the caller can say how many are left. */
  staleDates: string[];
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
  stale: (dealerId: string | undefined) => ['dsr', 'stale', dealerId] as const,
  setupDraft: (dealerId: string | undefined) =>
    ['dsr', 'setup-draft', dealerId] as const,
  pnl: (dealerId: string | undefined, from: string, to: string) =>
    ['dsr', 'pnl', dealerId, from, to] as const,
};

/** A missing report (404) is a normal state here, and a client error never
 * benefits from a retry — only retry once for genuinely transient 5xx/network. */
function retryUnlessClientError(count: number, err: unknown): boolean {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
    return false;
  }
  return count < 1;
}

/** One tank's contribution to a discovered product. */
export interface DsrDiscoveredTank {
  tankNo: number;
  stock: number | null;
  dip: number | null;
  waterDip: number | null;
  nozzleNos: number[];
}

/** One product as read off the dealer's own shift data, before confirmation. */
export interface DsrDiscoveredProduct {
  key: string;
  labelEn: string;
  labelHi: string;
  tankLabel: string;
  prodCodes: string[];
  tankNos: number[];
  nozzleNos: number[];
  leakagePct: number | null;
  permissiblePct: number;
  provisional: boolean;
  currentMeterByNozzle: Record<string, number>;
  currentStock: number | null;
  tanks: DsrDiscoveredTank[];
  /** Proposed per-nozzle reading correction, when a pump reports off-scale. */
  meterScale?: Record<string, number>;
  /** Baselines read from the dealer's inspection report; null if none captured. */
  inspection: DsrDiscoveredInspection | null;
}

/** How a product's inspection baselines were recovered from the report. */
export interface DsrDiscoveredInspection {
  openingStock: number | null;
  meterByNozzle: Record<string, number>;
  assignment: 'BY_LABEL' | 'BY_READING' | 'INCOMPLETE';
  unassignedReadings: number[];
  nozzlesWithoutBaseline: number[];
  notes: string[];
}

export interface DsrSetupDraft {
  businessDate: string;
  capturedAt: string;
  products: DsrDiscoveredProduct[];
  warnings: string[];
  /** The inspection the baselines came from — its date becomes `sinceDate`. */
  inspection: { date: string; ref: string | null } | null;
  existingConfig: Record<string, unknown> | null;
}

/* ─────────────────────────────── Queries ────────────────────────────────── */

/**
 * The outlet layout read off the dealer's own IRAS shift data — which grades
 * they sell, which tanks hold each, which nozzles draw from them.
 *
 * Fetched on demand (the setup form asks for it), never on mount: it is a
 * starting point an operator chooses to pull in, not something that should
 * silently overwrite a config they are part-way through editing.
 */
export function useDsrSetupDraft(dealerId: string | undefined) {
  return useQuery({
    queryKey: dsrKeys.setupDraft(dealerId),
    queryFn: () => api.get<DsrSetupDraft>(`/dsr/dealers/${dealerId}/setup-draft`),
    enabled: false,
    retry: retryUnlessClientError,
    gcTime: 0,
  });
}

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

/**
 * One dealer's litres for a window — what the fuel P&L screen prices.
 *
 * Deliberately returns no rupee figure: nothing we collect publishes a rate, so
 * the multiplication happens in the browser with the rates on screen beside it.
 */
export function useDsrPnl(
  dealerId: string | undefined,
  from: string,
  to: string,
  enabled = true,
) {
  return useQuery({
    queryKey: dsrKeys.pnl(dealerId, from, to),
    queryFn: () => api.get<DsrPnlResponse>(`/dsr/dealers/${dealerId}/pnl`, { from, to }),
    enabled: !!dealerId && enabled,
    retry: retryUnlessClientError,
    staleTime: 30_000,
    // Every window change is a new key, so without this the whole page — the
    // period picker included — is replaced by skeletons on each change, and on a
    // phone the admin's own control vanishes from under their finger. Keeping
    // the previous window's figures up while the next loads is what the rest of
    // this admin does for the same reason.
    placeholderData: (prev) => prev,
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

/**
 * Every report of this dealer's that no longer matches its inputs. `enabled` is
 * a parameter because the only caller already knows from the report in hand
 * whether anything is stale — asking the server on every DSR page view just to
 * be told "nothing" would be a request per page load for the normal case.
 */
export function useDsrStaleReports(dealerId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: dsrKeys.stale(dealerId),
    queryFn: () => api.get<DsrStaleResponse>(`/dsr/dealers/${dealerId}/stale`),
    enabled: !!dealerId && enabled,
    staleTime: 30_000,
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
 * Rebuild the reports a receipt correction invalidated. Answers 202 with the
 * queued run, exactly as a generate does, so the caller can watch it the same
 * way.
 */
export function useRegenerateStaleDsr(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<DsrRegenerateStaleAccepted>(
        `/dsr/dealers/${dealerId}/regenerate-stale`,
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
