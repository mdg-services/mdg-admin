import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  EmployeeWithPoints,
  StaffPointAward,
  StaffPointsSummary,
} from '@dk/shared';

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

/* ─────────────────────────────── Query keys ─────────────────────────────── */

export const staffKeys = {
  overview: (dealerId: string | undefined, params: OverviewParams) =>
    ['staff', 'overview', dealerId, params] as const,
  awards: (dealerId: string | undefined, params: AwardsParams) =>
    ['staff', 'awards', dealerId, params] as const,
};

/* ─────────────────────────────── Queries ────────────────────────────────── */

/**
 * A dealer's staff roster + points leaderboard for a date window (read-only
 * admin lens). `from`/`to` default server-side to today (IST); `includeInactive`
 * pulls workers who have left the pump but retain award history.
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
