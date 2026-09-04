import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

import { assuranceKeys } from './useAssuranceQueue';

/**
 * A dealer's standing operational remarks — the record of a fault that is true,
 * physical and ongoing.
 *
 * "1E tank 6's dip meter is broken so its dip is entered by hand." "16E nozzles
 * 5 and 6 are not functioning." Without somewhere to write those down an admin
 * has two options and both are bad: click an override on every report forever
 * until the click stops meaning anything, or widen a threshold for all nine
 * dealers because one tank has a broken gauge.
 *
 * Sibling of `useAssuranceQueue.ts` and shares its `['assurance']` key prefix
 */

/* ─────────────────────────────── Wire shapes ────────────────────────────── */

/** `AssuranceRemarkPublic` on the server. Hand-declared, as `useDsr.ts` does. */
export interface AssuranceRemark {
  id: string;
  dealerId: string;
  /** `null` = every service. The common case: a broken gauge is a fact about
   *  the tank, not about the report that noticed it. */
  serviceId: string | null;
  /** Every field left null is a wildcard. An empty scope covers the dealer. */
  scope: {
    productKey?: string | null;
    tankNo?: number | null;
    nozzleNo?: number | null;
  };
  /** The catalogue codes this remark explains. Never empty. */
  suppresses: string[];
  /**
   * The finding's figure when the remark was written, against which the 3x
   * escalation rule is judged.
   *
   * Always `null` on anything created through the admin API: `remarkBody` in
   * `routes/v1/assurance.ts` has no `observedAtIssue` field, and Zod strips
   * what it does not declare. Surfaced here rather than hidden so the screen
   * can say so instead of implying a guard that is not running.
   */
  observedAtIssue: number | null;
  text: string;
  effectiveFrom: string;
  /** Already capped at 90 days from `effectiveFrom` by the time it is stored. */
  effectiveTo: string;
  createdBy: string;
  createdAt: string;
  /** Revocation is a stamp, never a delete — the reason has to stay answerable. */
  revokedAt: string | null;
  revokedBy: string | null;
}

/** `POST /assurance/dealers/:dealerId/remarks`. */
export interface CreateRemarkVars {
  serviceId?: string;
  scope: {
    productKey?: string;
    tankNo?: number;
    nozzleNo?: number;
  };
  suppresses: string[];
  text: string;
  /** `YYYY-MM-DD`. */
  effectiveFrom: string;
  /** `YYYY-MM-DD`. Omit and the server stores `effectiveFrom` + 90 days. */
  effectiveTo?: string;
}

/* ─────────────────────────────── Queries ────────────────────────────────── */

/**
 * Every remark for a dealer, newest first. Live ones only unless asked
 * otherwise — a revoked remark is history and should not sit in a list of what
 * is currently explaining a fault away.
 */
export function useRemarks(dealerId: string | undefined, includeRevoked = false) {
  return useQuery({
    queryKey: assuranceKeys.remarks(dealerId, includeRevoked),
    queryFn: ({ signal }) =>
      api.get<AssuranceRemark[]>(
        `/assurance/dealers/${dealerId}/remarks`,
        { includeRevoked: includeRevoked ? 'true' : undefined },
        signal,
      ),
    enabled: !!dealerId,
    staleTime: 30_000,
  });
}

/* ────────────────────────────── Mutations ───────────────────────────────── */

/**
 * Write a standing remark.
 *
 * ONLY THE REMARKS LIST IS INVALIDATED, and the hold queue deliberately is not.
 * Remarks are applied at GENERATE time (`assurance/run.ts` loads them, then
 * `applyRemarks` folds them into the stored verdict); the queue evaluates the
 * gate, which re-runs today's checks over the stored digest. So a remark
 * written now changes nothing in the queue until the report is regenerated, and
 * refreshing it here would suggest an effect that has not happened.
 */
export function useCreateRemark(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: CreateRemarkVars) =>
      api.post<AssuranceRemark>(`/assurance/dealers/${dealerId}/remarks`, vars),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assurance', 'remarks', dealerId] });
    },
  });
}

/**
 * Withdraw a remark — the tank was fixed, or it was written in error.
 *
 * Idempotent server-side, and a stamp rather than a delete: re-revoking returns
 * the row untouched instead of moving the timestamp, because the date it
 * stopped covering reports is a fact about the past.
 */
export function useRevokeRemark(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (remarkId: string) =>
      api.del<AssuranceRemark>(`/assurance/dealers/${dealerId}/remarks/${remarkId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assurance', 'remarks', dealerId] });
    },
  });
}
