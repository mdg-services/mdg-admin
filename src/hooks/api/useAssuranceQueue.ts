import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  AssuranceDecision,
  AssuranceDowngradeFloor,
  AssuranceSeverity,
} from '@/lib/assuranceCatalogue';

/**
 * The cross-dealer queue of everything the pre-send gate is withholding.
 *
 * WHY THE QUEUE EXISTS AT ALL. Without it a hold is discovered by trying to
 * share — and on the automatic paths there is nobody trying: the Kavach daily
 * digest posts on its own schedule at its own hour, so a withheld report would
 * simply never be looked at. This is the only screen where an artefact nobody
 * asked about surfaces.
 */

export interface AssuranceScope {
  productKey?: string;
  businessDate?: string;
  tankNo?: number;
  nozzleNo?: number;
}

/** One thing wrong with one report. */
export interface AssuranceFinding {
  /** Stable catalogue id, e.g. `dsr.variation.exceeds_stock_ever_held`. */
  code: string;
  tier: 'A' | 'B';
  severity: AssuranceSeverity;
  /** The lowest severity a remark may take this to. `NONE` = untouchable. */
  maxDowngrade: AssuranceDowngradeFloor;
  scope: AssuranceScope;
  /** One plain sentence with the real figures in it. Shown verbatim. */
  message: string;
  observed: number | null;
  limit: number | null;
  source: 'DETECTOR' | 'MODEL';
  /** Present when a standing remark moved this finding's severity. */
  downgradedBy?: {
    remarkId: string;
    from: AssuranceSeverity;
    observedAtIssue: number | null;
  };
}

/** One withheld report — `GET /assurance/holds`. */
export interface AssuranceHoldRow {
  reportId: string;
  dealerId: string;
  /** The only thing that identifies a dealer. `null` on a report that stored none. */
  outletCode: string | null;
  businessDate: string;
  /**
   * Already in the dealer's chat.
   *
   * History, not a queue item: `routes/v1/messages` has no delete and no edit,
   * so the gate cannot unsend it and an admin cannot act on it.
   */
  alreadyShared: boolean;
  decision: AssuranceDecision;
  /**
   * The report carries no verdict of its own — it was generated before the gate
   * existed. What is listed is today's live re-check, NOT a failure recorded at
   * the time, and it must never be read as "this report was checked and failed".
   */
  neverChecked: boolean;
  /** One line per holding finding. The API error body quotes the same strings. */
  reasons: string[];
  findings: AssuranceFinding[];
}

/* ─────────────────────────────── Query keys ─────────────────────────────── */

/**
 * Everything assurance hangs off `['assurance']`, so the remarks hooks in
 * `useRemarks.ts` share the prefix and one invalidation can reach both.
 */
/**
 * THE ONE key namespace for everything assurance. It lived in two files under the
 * same exported name — one with `report`, one with `holds`/`remarks` — so a module
 * importing both needed an alias, and importing from the wrong one lost a builder
 * silently until it was called. Every builder lives here now.
 */
export const assuranceKeys = {
  all: ['assurance'] as const,
  report: (reportId: string | undefined) => ['assurance', 'report', reportId] as const,
  holds: (limit: number) => ['assurance', 'holds', limit] as const,
  remarks: (dealerId: string | undefined, includeRevoked: boolean) =>
    ['assurance', 'remarks', dealerId, includeRevoked] as const,
};

/* ─────────────────────────────── Queries ────────────────────────────────── */

/** The server's own ceiling on `limit`; asking for more is a 400. */
export const HOLDS_MAX_LIMIT = 200;

/**
 * Everything currently withheld, newest business date first.
 *
 * DELIBERATELY NOT POLLED. Each call re-reads the 600 most recent reports and
 * re-evaluates every one of them, digests included, so a 60-second interval per
 * open tab is a real cost on a 908MB box — and the alarm this screen raises is
 * a daily one, not a per-minute one. It refreshes on focus like the rest of the
 * app, and the page carries an explicit Refresh.
 */
export function useAssuranceHolds(limit = 100) {
  return useQuery({
    queryKey: assuranceKeys.holds(limit),
    queryFn: ({ signal }) =>
      api.get<AssuranceHoldRow[]>('/assurance/holds', { limit }, signal),
    staleTime: 30_000,
  });
}
