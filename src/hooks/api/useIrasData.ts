import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  IrasDataSnapshot,
  IrasDataSnapshotSummary,
  IrasDataVaultDealerRow,
  IrasDataVaultOverview,
  IrasSnapshotStatus,
} from '@dk/shared';

import { api } from '@/lib/api';

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
  dealerLatest: (dealerId: string | undefined) =>
    ['irasData', 'dealerLatest', dealerId] as const,
};

/* ─────────────────────────────── Queries ────────────────────────────────── */

/**
 * Every configured dealer's collection state for one business date, plus the
 * roll-up counters above the list. Kept fresh for 30s so stepping back and
 * forth across dates does not re-hit the API on every click.
 */
export function useIrasVaultQuery(businessDate: string) {
  return useQuery({
    queryKey: irasDataKeys.vault(businessDate),
    queryFn: () =>
      api.get<IrasVaultResponse>('/iras-data/vault', { businessDate }),
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

/*
 * CSV export note: the Vault builds dataset CSVs in the BROWSER from the rows
 * `GET /iras-data/snapshots/:id` already returned — a bare navigation to the
 * server's `export.csv` route cannot carry the bearer token it requires, so it
 * would 401. The server route still exists for programmatic API consumers.
 */
