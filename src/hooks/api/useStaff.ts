import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  AwardStaffPointsResult,
  Employee,
  EmployeeWithPoints,
  StaffPointAward,
  StaffPointBatch,
  StaffPointDraftView,
  StaffPointsSummary,
} from '@dk/shared';
import type {
  AwardStaffPointsInput,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from '@dk/shared/schemas';

/* ─────────────────────────────── Types ──────────────────────────────────── */

/** Shape returned by `GET /dealers/:id/staff/overview`. */
export interface StaffOverview {
  roster: EmployeeWithPoints[];
  summary: StaffPointsSummary;
}

interface OverviewParams {
  from?: string;
  to?: string;
  includeInactive?: boolean;
}

interface AwardsParams {
  from?: string;
  to?: string;
  employeeId?: string;
}

/** Award action response — the ledger rows written plus the batch total. */
export interface AwardStaffPointsResponse extends AwardStaffPointsResult {
  totalPoints: number;
}

/* ─────────────────────────────── Query keys ─────────────────────────────── */

export const staffKeys = {
  overview: (dealerId: string | undefined, params: OverviewParams) =>
    ['staff', 'overview', dealerId, params] as const,
  awards: (dealerId: string | undefined, params: AwardsParams) =>
    ['staff', 'awards', dealerId, params] as const,
  drafts: (dealerId: string | undefined) =>
    ['staff', 'drafts', dealerId] as const,
  batches: (dealerId: string | undefined) =>
    ['staff', 'batches', dealerId] as const,
};

/** Invalidate the roster/leaderboard + award ledger for a dealer (prefix match). */
function invalidateStaffLedger(
  qc: ReturnType<typeof useQueryClient>,
  dealerId: string | undefined,
) {
  qc.invalidateQueries({ queryKey: ['staff', 'overview', dealerId] });
  qc.invalidateQueries({ queryKey: ['staff', 'awards', dealerId] });
}

/* ─────────────────────────────── Queries ────────────────────────────────── */

/**
 * A dealer's staff roster + points leaderboard for a date window. `from`/`to`
 * default server-side to today (IST); `includeInactive` pulls workers who have
 * left the pump but retain award history.
 */
export function useStaffOverviewQuery(
  dealerId: string | undefined,
  params: OverviewParams = {},
) {
  return useQuery({
    queryKey: staffKeys.overview(dealerId, params),
    queryFn: () =>
      api.get<StaffOverview>(`/dealers/${dealerId}/staff/overview`, {
        from: params.from,
        to: params.to,
        includeInactive: params.includeInactive ? true : undefined,
      }),
    enabled: !!dealerId,
    staleTime: 15_000,
  });
}

/**
 * The award ledger (audit trail) for a dealer within a window — who awarded what
 * to whom, when. Max 1000 rows, sorted workDate desc then createdAt desc.
 */
export function useStaffAwardsQuery(
  dealerId: string | undefined,
  params: AwardsParams = {},
) {
  return useQuery({
    queryKey: staffKeys.awards(dealerId, params),
    queryFn: () =>
      api.get<StaffPointAward[]>(`/dealers/${dealerId}/staff/awards`, {
        from: params.from,
        to: params.to,
        employeeId: params.employeeId,
      }),
    enabled: !!dealerId,
    staleTime: 15_000,
  });
}

/**
 * The dealer's single in-progress draft (their unsubmitted work for the shift).
 * Read-only for admins — surfaced so the admin can see what has not yet been
 * finalized to the ledger. Points are recomputed server-side.
 */
export function useDealerDraftQuery(dealerId: string | undefined) {
  return useQuery({
    queryKey: staffKeys.drafts(dealerId),
    queryFn: () =>
      api.get<StaffPointDraftView>(`/dealers/${dealerId}/staff/drafts`),
    enabled: !!dealerId,
    staleTime: 15_000,
  });
}

/**
 * Finalized submissions (batches) for a dealer. Each carries a signed hardcopy
 * photo URL used for hard-vs-soft-copy reconciliation.
 */
export function useDealerBatchesQuery(dealerId: string | undefined) {
  return useQuery({
    queryKey: staffKeys.batches(dealerId),
    queryFn: () =>
      api.get<StaffPointBatch[]>(`/dealers/${dealerId}/staff/batches`),
    enabled: !!dealerId,
    staleTime: 15_000,
  });
}

/* ─────────────────────────────── Mutations ──────────────────────────────── */

/** Add a worker to the dealer's roster. */
export function useAdminAddEmployee(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEmployeeInput) =>
      api.post<Employee>(`/dealers/${dealerId}/staff/employees`, input),
    onSuccess: () => invalidateStaffLedger(qc, dealerId),
  });
}

export interface UpdateEmployeeVars extends UpdateEmployeeInput {
  id: string;
}

/** Rename / re-designate / soft-remove (status INACTIVE) / reactivate a worker. */
export function useAdminUpdateEmployee(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateEmployeeVars) =>
      api.patch<Employee>(`/dealers/${dealerId}/staff/employees/${id}`, body),
    onSuccess: () => invalidateStaffLedger(qc, dealerId),
  });
}

/** Award points for one or more works done by a set of workers. */
export function useAdminAwardPoints(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AwardStaffPointsInput) =>
      api.post<AwardStaffPointsResponse>(
        `/dealers/${dealerId}/staff/awards`,
        input,
      ),
    onSuccess: () => {
      invalidateStaffLedger(qc, dealerId);
      qc.invalidateQueries({ queryKey: staffKeys.batches(dealerId) });
    },
  });
}

export interface UndoAwardVars {
  id: string;
  /** `batch` reverses the whole award action (all rows sharing the batchId). */
  scope?: 'batch';
}

/** Undo a single award row, or the whole batch it belongs to. */
export function useAdminUndoAward(dealerId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scope }: UndoAwardVars) =>
      api.del<void>(
        `/dealers/${dealerId}/staff/awards/${id}${
          scope === 'batch' ? '?scope=batch' : ''
        }`,
      ),
    onSuccess: () => {
      invalidateStaffLedger(qc, dealerId);
      qc.invalidateQueries({ queryKey: staffKeys.batches(dealerId) });
    },
  });
}
