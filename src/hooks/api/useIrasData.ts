import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { irasEditKeys } from '@/hooks/api/useIrasEdits';
import { api } from '@/lib/api';
import { isYmd } from '@/lib/format';
import type {
  IrasDataSnapshot,
  IrasDataSnapshotSummary,
  IrasDataVaultDealerRow,
  IrasDataVaultOverview,
  IrasDayStateRow,
  IrasDayStatesPage,
  IrasSnapshotStatus,
} from '@dk/shared';


/* ─────────────────────────────── Wire shapes ────────────────────────────── */

/** `GET /iras-data/vault` — the cross-dealer landing payload. */
export interface IrasVaultResponse {
  overview: IrasDataVaultOverview;
  dealers: IrasDataVaultDealerRow[];
}

/** Filters accepted by `GET /iras-data/snapshots`. */
export interface IrasSnapshotsParams {
  dealerId?: string;
  /** Business date floor, `YYYY-MM-DD`. */
  from?: string;
  /** Business date ceiling, `YYYY-MM-DD`. */
  to?: string;
  status?: IrasSnapshotStatus;
  page?: number;
  pageSize?: number;
}

/** `GET /iras-data/snapshots` — one page of summaries. */
export interface IrasSnapshotsPage {
  items: IrasDataSnapshotSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** Window for `GET /iras-data/dealers/:id/day-states`. */
export interface IrasDayStatesParams {
  /** How many calendar days back from `to`. Ignored when `from` is given. */
  days?: number;
  from?: string;
  to?: string;
}

/** `POST /iras-data/dealers/:id/collect` — 202 with the queued run. */
export interface IrasCollectAccepted {
  runId: string;
}

/**
 * What to collect. `businessDate` matters: the Vault is a date-scoped screen, so
 * "Collect now" on a row for last Tuesday must collect LAST TUESDAY — omitting it
 * makes the API default to today and the row the admin clicked stays empty.
 */
export interface IrasCollectVars {
  dealerId: string;
  /** `YYYY-MM-DD`. Omit to let the API pick today (IST). */
  businessDate?: string;
}

/* ─────────────────────────────── Query keys ─────────────────────────────── */

/**
 * Every key hangs off the `['irasData']` prefix so one invalidation after a
 * collection run refreshes the Vault list, the dealer tab and any open snapshot.
 */
export const irasDataKeys = {
  all: ['irasData'] as const,
  vault: (businessDate: string) => ['irasData', 'vault', businessDate] as const,
  snapshots: (params: IrasSnapshotsParams) =>
    ['irasData', 'snapshots', params] as const,
  snapshot: (id: string | undefined) => ['irasData', 'snapshot', id] as const,
  dayStates: (dealerId: string | undefined, params: IrasDayStatesParams) =>
    ['irasData', 'dayStates', dealerId, params] as const,
  dealerLatest: (dealerId: string | undefined) =>
    ['irasData', 'dealerLatest', dealerId] as const,
};

/* ─────────────────────────────── Queries ────────────────────────────────── */

/**
 * Every configured dealer's collection state for one business date, plus the
 * roll-up counters above the list. Kept fresh for 30s so stepping back and
 * forth across dates does not re-hit the API on every click.
 *
 * A date that is not a real calendar day never leaves the browser: this hook's
 * argument comes from a date field the admin is still typing in, and the native
 * control reports every complete-looking date on the way to the intended one.
 */
export function useIrasVaultQuery(businessDate: string) {
  return useQuery({
    queryKey: irasDataKeys.vault(businessDate),
    queryFn: () =>
      api.get<IrasVaultResponse>('/iras-data/vault', { businessDate }),
    enabled: isYmd(businessDate),
    staleTime: 30_000,
  });
}

/**
 * One snapshot in full, including every dataset's rows. This is the only call
 * that carries row payloads, so it is made on drill-in and never for a list.
 */
export function useIrasSnapshotQuery(id: string | undefined) {
  return useQuery({
    queryKey: irasDataKeys.snapshot(id),
    queryFn: () => api.get<IrasDataSnapshot>(`/iras-data/snapshots/${id}`),
    enabled: !!id,
    // A captured snapshot is immutable until the dealer is re-collected, and a
    // re-collect invalidates the whole `irasData` prefix anyway.
    staleTime: 5 * 60_000,
  });
}

/** Paged snapshot summaries — the per-dealer history list. */
export function useIrasSnapshotsQuery(params: IrasSnapshotsParams = {}) {
  const { dealerId } = params;
  return useQuery({
    queryKey: irasDataKeys.snapshots(params),
    queryFn: () => api.get<IrasSnapshotsPage>('/iras-data/snapshots', { ...params }),
    // Only gate on `dealerId` when the caller asked for one dealer.
    enabled: dealerId === undefined || dealerId.length > 0,
    staleTime: 30_000,
  });
}

/**
 * A dealer's most recent snapshot, whatever business date it belongs to.
 * Resolves to `null` when the pipeline has never produced one for them.
 */
export function useDealerLatestIrasSnapshot(dealerId: string | undefined) {
  return useQuery({
    queryKey: irasDataKeys.dealerLatest(dealerId),
    queryFn: () =>
      api.get<IrasDataSnapshot | null>(`/iras-data/dealers/${dealerId}/latest`),
    enabled: !!dealerId,
    staleTime: 30_000,
  });
}

/* ────────────────────────────── Mutations ───────────────────────────────── */

/**
 * Trigger an on-demand collection for one dealer. The API answers 202 with the
 * queued `runId` — the snapshot lands asynchronously, so we invalidate the whole
 * `irasData` prefix (vault + snapshots + latest) and let the caller tell the
 * admin to check back rather than pretending the data is already there.
 */
export function useCollectIrasData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, businessDate }: IrasCollectVars) =>
      api.post<IrasCollectAccepted>(
        `/iras-data/dealers/${dealerId}/collect`,
        businessDate ? { businessDate } : {},
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: irasDataKeys.all });
    },
  });
}

/**
 * Open a day BY HAND for a dealer whose portal automation does not exist.
 *
 * Creates the empty dealer-day the shift-data editor needs to exist before
 * anything can be typed into it; every figure then goes in through the ordinary
 * grid as a hand-added row. Returns 201 the first time and 200 if the day is
 * already open, so a double-click is harmless.
 */
export function useStartManualIrasDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dealerId,
      businessDate,
      shiftTime,
    }: {
      dealerId: string;
      businessDate: string;
      shiftTime?: string;
    }) =>
      api.post(
        `/iras-data/dealers/${dealerId}/days/${businessDate}`,
        shiftTime ? { shiftTime } : {},
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: irasDataKeys.all });
      void qc.invalidateQueries({ queryKey: irasEditKeys.all });
    },
  });
}

/**
 * One dealer's data day by calendar day — every date in the window, including
 * the ones nothing was ever collected for.
 *
 * Deliberately not `useIrasSnapshotsQuery` with a filter: that endpoint returns
 * captures, and a capture list cannot represent a day on which nothing was
 * captured. Those are the rows this screen exists to show.
 */
export function useIrasDayStatesQuery(
  dealerId: string | undefined,
  params: IrasDayStatesParams = {},
) {
  return useQuery({
    queryKey: irasDataKeys.dayStates(dealerId, params),
    queryFn: () =>
      api.get<IrasDayStatesPage>(`/iras-data/dealers/${dealerId}/day-states`, {
        ...params,
      }),
    enabled: !!dealerId,
    staleTime: 30_000,
  });
}

/**
 * Accept a day whose figures do not add up, with a reason.
 *
 * The server reads the gap itself at commit time rather than trusting what this
 * screen was showing — so a tab left open while the figures moved cannot sign
 * for a number that is no longer there. It answers with the day's new state.
 */
export function useVerifyIrasDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dealerId,
      businessDate,
      note,
    }: {
      dealerId: string;
      businessDate: string;
      note: string;
    }) =>
      api.put<IrasDayStateRow>(
        `/iras-data/dealers/${dealerId}/days/${businessDate}/verification`,
        { note },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: irasDataKeys.all });
    },
  });
}

/** Withdraw a day's acceptance; it goes back to standing on its own figures. */
export function useUnverifyIrasDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealerId, businessDate }: { dealerId: string; businessDate: string }) =>
      api.del<IrasDayStateRow>(
        `/iras-data/dealers/${dealerId}/days/${businessDate}/verification`,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: irasDataKeys.all });
    },
  });
}

/*
 * CSV export note: the Vault builds dataset CSVs in the BROWSER from the rows
 * `GET /iras-data/snapshots/:id` already returned — a bare navigation to the
 * server's `export.csv` route cannot carry the bearer token it requires, so it
 * would 401. The server route still exists for programmatic API consumers.
 */
