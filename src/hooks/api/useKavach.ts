import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  KavachDashboardRow,
  KavachItem,
  KavachItemStatus,
  KavachProgramme,
} from '@dk/shared';
import type {
  InitiateKavachProgrammeInput,
  SetKavachItemPausedInput,
  SetKavachSosComplianceInput,
  UpdateKavachProgrammeInput,
} from '@dk/shared/schemas';

/**
 * Query keys for the per-dealer Kavach surfaces. The cross-dealer work queue
 * keeps its own hooks in `useKavachQueue.ts`; `workQueue` below exists so a
 * write on THIS side can mark that queue stale without importing it.
 */

export const kavachKeys = {
  dashboard: ['kavach', 'dashboard'] as const,
  /** Must match `kavachQueueKeys.all` in useKavachQueue.ts — one cache, one key. */
  workQueue: ['kavach', 'work-queue'] as const,
  programme: (dealerId: string | undefined) =>
    ['kavach', 'programme', dealerId] as const,
  items: (dealerId: string | undefined) =>
    ['kavach', 'items', dealerId] as const,
};

/* ─────────────────────────────── Queries ────────────────────────────────── */

/** Cross-dealer compliance dashboard (admin fleet-health lens). */
export function useKavachDashboardQuery() {
  return useQuery({
    queryKey: kavachKeys.dashboard,
    queryFn: () => api.get<KavachDashboardRow[]>('/kavach/dashboard'),
  });
}

/**
 * A dealer's programme (incl. live score). Returns `null` when no programme has
 * been initiated yet (the backend 404s, which we map to null so the panel can
 * render the initiate form instead of an error).
 */
export function useKavachProgrammeQuery(dealerId: string | undefined) {
  return useQuery({
    queryKey: kavachKeys.programme(dealerId),
    queryFn: async () => {
      try {
        return await api.get<KavachProgramme>(
          `/dealers/${dealerId}/kavach/programme`,
        );
      } catch (err) {
        // No programme yet → treat as "not initiated", not an error.
        if (
          err &&
          typeof err === 'object' &&
          'status' in err &&
          (err as { status: number }).status === 404
        ) {
          return null;
        }
        throw err;
      }
    },
    enabled: !!dealerId,
    retry: false,
  });
}

interface KavachItemsParams {
  dueOnly?: boolean;
  bucket?: string;
  status?: KavachItemStatus;
}

/** A dealer's tracked items, with optional filters. */
export function useKavachItemsQuery(
  dealerId: string | undefined,
  params: KavachItemsParams = {},
) {
  return useQuery({
    queryKey: [...kavachKeys.items(dealerId), params] as const,
    queryFn: () =>
      api.get<KavachItem[]>(`/dealers/${dealerId}/kavach/items`, {
        dueOnly: params.dueOnly,
        bucket: params.bucket,
        status: params.status,
      }),
    enabled: !!dealerId,
  });
}

/* ─────────────────────────────── Mutations ──────────────────────────────── */

function useItemInvalidation(dealerId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: kavachKeys.items(dealerId) });
    qc.invalidateQueries({ queryKey: kavachKeys.programme(dealerId) });
    qc.invalidateQueries({ queryKey: kavachKeys.workQueue });
    qc.invalidateQueries({ queryKey: kavachKeys.dashboard });
  };
}

/** Initiate the programme for a dealer (admin, once). */
export function useInitiateKavachProgramme(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InitiateKavachProgrammeInput) =>
      api.post<KavachProgramme>(`/dealers/${dealerId}/kavach/programme`, input),
    onSuccess: (data) => {
      qc.setQueryData(kavachKeys.programme(dealerId), data);
      qc.invalidateQueries({ queryKey: kavachKeys.items(dealerId) });
      qc.invalidateQueries({ queryKey: kavachKeys.workQueue });
      qc.invalidateQueries({ queryKey: kavachKeys.dashboard });
    },
  });
}

/**
 * Programme-level settings: pause/resume, digest hour, and the switch that
 * decides whether this dealer hears from us at all.
 */
export function useUpdateKavachProgramme(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateKavachProgrammeInput) =>
      api.patch<KavachProgramme>(
        `/dealers/${dealerId}/kavach/programme`,
        input,
      ),
    onSuccess: (data) => {
      qc.setQueryData(kavachKeys.programme(dealerId), data);
      qc.invalidateQueries({ queryKey: kavachKeys.dashboard });
    },
  });
}

/** Pause / resume an item for a dealer. */
export function useSetKavachItemPaused(dealerId: string) {
  const invalidate = useItemInvalidation(dealerId);
  return useMutation({
    mutationFn: ({
      itemId,
      body,
    }: {
      itemId: string;
      body: SetKavachItemPausedInput;
    }) => api.patch<KavachItem>(`/kavach/items/${itemId}/paused`, body),
    onSuccess: invalidate,
  });
}

/** Flag / clear an SOS item's availability (admin/field-agent only). */
export function useSetKavachSosCompliance(dealerId: string) {
  const invalidate = useItemInvalidation(dealerId);
  return useMutation({
    mutationFn: ({
      itemId,
      body,
    }: {
      itemId: string;
      body: SetKavachSosComplianceInput;
    }) => api.patch<KavachItem>(`/kavach/items/${itemId}/sos`, body),
    onSuccess: invalidate,
  });
}
