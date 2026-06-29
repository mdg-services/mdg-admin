import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  KavachDashboardRow,
  KavachItem,
  KavachItemStatus,
  KavachProgramme,
} from '@dk/shared';
import type {
  AddCustomKavachItemInput,
  InitiateKavachProgrammeInput,
  SetKavachItemPausedInput,
  SetKavachSosComplianceInput,
} from '@dk/shared/schemas';


/* ─────────────────────────────── Query keys ─────────────────────────────── */

export const kavachKeys = {
  dashboard: ['kavach', 'dashboard'] as const,
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

function useItemInvalidation(dealerId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: kavachKeys.items(dealerId) });
    qc.invalidateQueries({ queryKey: kavachKeys.programme(dealerId) });
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
      qc.invalidateQueries({ queryKey: kavachKeys.dashboard });
    },
  });
}

/** Add a per-dealer custom item. */
export function useAddCustomKavachItem(dealerId: string) {
  const invalidate = useItemInvalidation(dealerId);
  return useMutation({
    mutationFn: (input: AddCustomKavachItemInput) =>
      api.post<KavachItem>(`/dealers/${dealerId}/kavach/items`, input),
    onSuccess: invalidate,
  });
}

/** Mark an item done on the dealer's behalf. */
export function useMarkKavachItemDone(dealerId: string) {
  const invalidate = useItemInvalidation(dealerId);
  return useMutation({
    mutationFn: (itemId: string) =>
      api.post<KavachItem>(`/kavach/items/${itemId}/mark-done`, {}),
    onSuccess: invalidate,
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

/** Delete a custom item (custom items only). */
export function useDeleteKavachItem(dealerId: string) {
  const invalidate = useItemInvalidation(dealerId);
  return useMutation({
    mutationFn: (itemId: string) =>
      api.del<{ id: string }>(`/kavach/items/${itemId}`),
    onSuccess: invalidate,
  });
}

/** Manually escalate an item into the admin inbox as an OPEN conversation. */
export function useEscalateKavachItem(dealerId: string) {
  const invalidate = useItemInvalidation(dealerId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      api.post<KavachItem>(`/kavach/items/${itemId}/escalate`, {}),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
