import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { api } from '@/lib/api';
import { waitingTotal } from '@/lib/kavachWords';
import type {
  KavachCheckDetail,
  KavachCheckRow,
  KavachCheckState,
  KavachOutletDetail,
  KavachOutletRow,
  KavachReviewGroup,
  KavachTaskOverride,
  KavachTaskRow,
} from '@dk/shared';
import type { KavachTaskBody } from '@dk/shared/schemas';

/**
 * Kavach on the admin side (ADR 0057 §11): the review desk, the checklist and
 * the outlets. Every key starts with `'kavach'`, so one invalidation of the root
 * refreshes the lot — and the `kavach:changed` socket event does exactly that.
 */

export type ReviewBy = 'task' | 'outlet';

export interface ReviewChecksParams {
  code?: string;
  dealerId?: string;
  state?: KavachCheckState;
  day?: string;
}

export const kavachRoot = ['kavach'] as const;
export const kavachKeys = {
  all: kavachRoot,
  groups: (by: ReviewBy) => ['kavach', 'groups', by] as const,
  checks: (p: ReviewChecksParams) => ['kavach', 'checks', p] as const,
  check: (id: string | undefined) => ['kavach', 'check', id] as const,
  tasks: ['kavach', 'tasks'] as const,
  outlets: ['kavach', 'outlets'] as const,
  outlet: (dealerId: string | undefined) => ['kavach', 'outlet', dealerId] as const,
};

/* ─────────────────────────────── Review ─────────────────────────────────── */

/** Checks waiting for a person, grouped by point or by outlet. */
export function useKavachGroupsQuery(by: ReviewBy) {
  return useQuery({
    queryKey: kavachKeys.groups(by),
    queryFn: () => api.get<KavachReviewGroup[]>('/kavach/review/groups', { by }),
    refetchOnWindowFocus: true,
  });
}

/** The number on the Kavach nav badge. Shares the by-point list with the page. */
export function useKavachWaitingCount(): number {
  const q = useKavachGroupsQuery('task');
  return waitingTotal(q.data);
}

/** The checks of one group (a point across outlets, or one outlet), newest wait first as the server lists them. */
export function useKavachReviewChecksQuery(params: ReviewChecksParams, enabled = true) {
  return useQuery({
    queryKey: kavachKeys.checks(params),
    queryFn: () =>
      api.get<KavachCheckRow[]>('/kavach/review/checks', { ...params, limit: 200 }),
    enabled,
  });
}

/** One check, fully: signed files, panels, history. */
export function useKavachCheckQuery(id: string | undefined) {
  return useQuery({
    queryKey: kavachKeys.check(id),
    queryFn: () => api.get<KavachCheckDetail>(`/kavach/checks/${id}`),
    enabled: !!id,
    // Signed file links last a few minutes; read again rather than show a dead photo.
    staleTime: 60_000,
  });
}

/** Warm the next check while the admin looks at this one. */
export function usePrefetchKavachCheck() {
  const qc = useQueryClient();
  return useCallback(
    (id: string | undefined) => {
      if (!id) return;
      void qc.prefetchQuery({
        queryKey: kavachKeys.check(id),
        queryFn: () => api.get<KavachCheckDetail>(`/kavach/checks/${id}`),
        staleTime: 60_000,
      });
    },
    [qc],
  );
}

function useRefreshKavach() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: kavachRoot });
}

export interface ApproveVars {
  id: string;
  submittedAt: string | null;
}
export function useApproveKavachCheck() {
  const refresh = useRefreshKavach();
  return useMutation({
    mutationFn: ({ id, submittedAt }: ApproveVars) =>
      api.post<unknown>(`/kavach/checks/${id}/approve`, { submittedAt }),
    onSettled: () => void refresh(),
  });
}

export interface SendBackVars {
  id: string;
  reason: string;
  note: string | null;
  submittedAt: string | null;
}
export function useSendBackKavachCheck() {
  const refresh = useRefreshKavach();
  return useMutation({
    mutationFn: ({ id, ...body }: SendBackVars) =>
      api.post<unknown>(`/kavach/checks/${id}/send-back`, body),
    onSettled: () => void refresh(),
  });
}

export interface TellOwnerVars {
  id: string;
  note: string;
  withPhoto: boolean;
  submittedAt?: string | null;
}
export function useTellOwnerKavachCheck() {
  const refresh = useRefreshKavach();
  return useMutation({
    mutationFn: ({ id, ...body }: TellOwnerVars) =>
      api.post<unknown>(`/kavach/checks/${id}/tell-owner`, body),
    onSettled: () => void refresh(),
  });
}

export function useExcuseKavachCheck() {
  const refresh = useRefreshKavach();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; reason: string; submittedAt?: string | null }) =>
      api.post<unknown>(`/kavach/checks/${id}/excuse`, body),
    onSettled: () => void refresh(),
  });
}

/** A data point decided by hand: `done` = mark-done, `not_done` = mark-not-done. */
export function useMarkKavachDataCheck() {
  const refresh = useRefreshKavach();
  return useMutation({
    mutationFn: ({ id, verdict, note }: { id: string; verdict: 'done' | 'not_done'; note: string }) =>
      api.post<unknown>(
        `/kavach/checks/${id}/${verdict === 'done' ? 'mark-done' : 'mark-not-done'}`,
        { note },
      ),
    onSettled: () => void refresh(),
  });
}

/* ─────────────────────────────── Checklist ──────────────────────────────── */

export function useKavachTasksQuery() {
  return useQuery({
    queryKey: kavachKeys.tasks,
    queryFn: () => api.get<KavachTaskRow[]>('/kavach/tasks'),
  });
}

export function useCreateKavachTask() {
  const refresh = useRefreshKavach();
  return useMutation({
    mutationFn: (vars: { code: string; task: KavachTaskBody }) =>
      api.post<KavachTaskRow>('/kavach/tasks', vars),
    onSuccess: () => void refresh(),
  });
}

/** Any field of the point, plus `active` (false retires it, true brings it back). */
export function useUpdateKavachTask() {
  const refresh = useRefreshKavach();
  return useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: Partial<KavachTaskBody> & { active?: boolean } }) =>
      api.patch<KavachTaskRow>(`/kavach/tasks/${encodeURIComponent(code)}`, patch),
    onSuccess: () => void refresh(),
  });
}

/** Retire a point (the server keeps it; checks already made stay readable). */
export function useRetireKavachTask() {
  const refresh = useRefreshKavach();
  return useMutation({
    mutationFn: (code: string) => api.del<unknown>(`/kavach/tasks/${encodeURIComponent(code)}`),
    onSuccess: () => void refresh(),
  });
}

/* ─────────────────────────────── Outlets ────────────────────────────────── */

export function useKavachOutletsQuery() {
  return useQuery({
    queryKey: kavachKeys.outlets,
    queryFn: () => api.get<KavachOutletRow[]>('/kavach/outlets'),
  });
}

export function useKavachOutletQuery(dealerId: string | undefined) {
  return useQuery({
    queryKey: kavachKeys.outlet(dealerId),
    queryFn: () => api.get<KavachOutletDetail>(`/kavach/outlets/${dealerId}`),
    enabled: !!dealerId,
  });
}

export function useSetKavachOutletOn() {
  const refresh = useRefreshKavach();
  return useMutation({
    mutationFn: ({ dealerId, on }: { dealerId: string; on: boolean }) =>
      api.patch<unknown>(`/kavach/outlets/${dealerId}`, { on }),
    onSuccess: () => void refresh(),
  });
}

export function useSwitchKavachOutlets() {
  const refresh = useRefreshKavach();
  return useMutation({
    mutationFn: ({ dealerIds, on }: { dealerIds: string[]; on: boolean }) =>
      api.post<unknown>('/kavach/outlets/switch', { dealerIds, on }),
    onSuccess: () => void refresh(),
  });
}

export interface OutletListInput {
  hiddenCodes: string[];
  customTasks: (KavachTaskBody & { code?: string })[];
  overrides: KavachTaskOverride[];
}
export function useSaveKavachOutletList(dealerId: string) {
  const refresh = useRefreshKavach();
  return useMutation({
    mutationFn: (body: OutletListInput) =>
      api.put<unknown>(`/kavach/outlets/${dealerId}/list`, body),
    onSuccess: () => void refresh(),
  });
}
