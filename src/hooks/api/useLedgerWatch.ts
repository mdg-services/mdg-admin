import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  LedgerFlagDto,
  LedgerFlagKind,
  LedgerFlagSeverity,
  LedgerFlagStatus,
  LedgerMovementRuleDto,
  LedgerPeriodSummaryDto,
} from '@dk/shared';

/**
 * Ledger Watch's six endpoints, mounted at `/api/v1/ledger-watch`.
 *
 * Sibling of `useCreditDod.ts` and shaped exactly like it — same `api` client,
 * same key conventions, same split of `useQuery` for a digest and
 * `useInfiniteQuery` for anything an admin pages through. Ledger Watch rides
 * the Credit & DOD run and reads the same PAD ledger, so an admin moving
 * between the two panes should not meet two different loading behaviours.
 *
 * WHAT THESE READ, IN ONE LINE: a dealer's PAD ledger is meant to be a pair —
 * fuel bought, money deposited. Everything else on it (interest, a licence-fee
 * recovery, a participation fee, a commission paid back) silently moves the
 * outstanding and therefore the due amount, and nobody was ever told. These
 * endpoints serve the classification of every line and the findings raised
 * against them.
 *
 * LEDGER WATCH OBSERVES, IT NEVER ADJUSTS. Nothing here can move `availed`,
 * `dueAmount` or `dueDate`. A status change on a flag is a note about a row; it
 * is not an input to any figure the dealer is judged on.
 */

/**
 * One page of findings.
 *
 * `counts` is a NESTED object and not a flat `total`, because that is what both
 * flag routes actually send. The first version of this interface declared a
 * top-level `total`, which the server has never sent — and since the API client
 * hands back an unchecked cast, nothing failed loudly: `total` simply read
 * `undefined`, fell to 0, and both screens showed "0 findings" above a list of
 * findings.
 *
 * The counts are also deliberately computed by the server WITHOUT the severity
 * filter applied, so the header can say how many alerts exist while the list
 * shows only the notices an admin has filtered down to. Read them from here
 * rather than counting the loaded rows, which only ever counts the first page.
 */
export interface LedgerFlagPage {
  rows: LedgerFlagDto[];
  /** Opaque cursor for the next page; absent when the list is exhausted. */
  nextCursor?: string;
  counts: {
    /** Total across the whole filter, for the header count. */
    total: number;
    alerts: number;
    notices: number;
    infos: number;
  };
}

/**
 * The rule catalogue as the server sends it — an envelope, not a bare array.
 *
 * Declared explicitly for the same reason as the counts above: `api.get` casts
 * without checking, so declaring `LedgerMovementRuleDto[]` did not fail at the
 * boundary. It failed later and harder, when the cross-dealer page called
 * `.filter()` on an object and threw into the error boundary on load.
 */
export interface LedgerMovementRuleList {
  total: number;
  rows: LedgerMovementRuleDto[];
}

/** What an admin can narrow the inbox — or one dealer's list — down to. */
export interface LedgerFlagFilters {
  status?: LedgerFlagStatus;
  kind?: LedgerFlagKind;
  severity?: LedgerFlagSeverity;
}

/** The body of `PATCH /ledger-watch/flags/:id`. */
export interface UpdateLedgerFlagInput {
  status: LedgerFlagStatus;
  /** Free text an admin leaves when they dismiss or resolve a finding. */
  note?: string;
}

/** The body of `PATCH /ledger-watch/rules/:id`. */
export interface UpdateLedgerRuleInput {
  /**
   * Confirming a proposal turns it on; rejecting one leaves it off.
   *
   * The server is what stamps `confirmedBy` / `confirmedAt` and moves `source`
   * to `ADMIN` — this body never carries either. A screen that could flip
   * `active` without the server recording who did it would have broken the
   * audit trail the whole safety model rests on, and the boot seeder would
   * revert the change on the next deploy because an unstamped rule still reads
   * as untouched.
   */
  active: boolean;
  noteEn?: string;
  noteHi?: string;
}

const PAGE_SIZE = 50;

/**
 * One prefix per surface, so a write can invalidate exactly what it changed.
 *
 * `all` deliberately covers everything under `ledgerWatch`: acknowledging a
 * flag changes the dealer's list, the cross-dealer inbox and the count in the
 * page header, and a caller that had to remember three keys would eventually
 * forget one.
 */
export const ledgerWatchKeys = {
  all: ['ledgerWatch'] as const,
  flags: ['ledgerWatch', 'flags'] as const,
  dealerFlags: (dealerId: string | undefined, filters: LedgerFlagFilters) =>
    ['ledgerWatch', 'flags', 'dealer', dealerId, filters] as const,
  inbox: (filters: LedgerFlagFilters) =>
    ['ledgerWatch', 'flags', 'inbox', filters] as const,
  summary: (dealerId: string | undefined, month: string) =>
    ['ledgerWatch', 'summary', dealerId, month] as const,
  rules: ['ledgerWatch', 'rules'] as const,
};

/* ─────────────────────────────── Queries ────────────────────────────────── */

/**
 * One dealer's findings, newest-worst first as the server orders them.
 *
 * Keyset-paginated on an opaque cursor and never on an offset: detection runs
 * on every Credit & DOD run, so rows can arrive between one page and the next,
 * and any arithmetic over row counts here would skip a finding rather than
 * repeat one — the failure mode nobody sees.
 */
export function useDealerLedgerFlags(
  dealerId: string | undefined,
  filters: LedgerFlagFilters = {},
) {
  return useInfiniteQuery({
    queryKey: ledgerWatchKeys.dealerFlags(dealerId, filters),
    enabled: !!dealerId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<LedgerFlagPage>(`/ledger-watch/dealers/${dealerId}/flags`, {
        status: filters.status,
        kind: filters.kind,
        severity: filters.severity,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

/**
 * A dealer's month: the four figures, the net, and the class breakdown.
 *
 * `month` is a `yyyy-mm` the CALLER derives from `istTodayYmd()`. It is not
 * defaulted here and it is never derived from `new Date()`: the business month
 * is IST, and a browser in another timezone must not be able to ask for a
 * different month than the backend would have picked for the same instant.
 *
 * 60-second `staleTime` — the underlying ledger moves at most once a day, and
 * an admin flicking between months should not re-hit the API for a month they
 * looked at ten seconds ago.
 */
export function useLedgerPeriodSummary(
  dealerId: string | undefined,
  month: string,
) {
  return useQuery({
    queryKey: ledgerWatchKeys.summary(dealerId, month),
    enabled: !!dealerId && !!month,
    queryFn: () =>
      api.get<LedgerPeriodSummaryDto>(
        `/ledger-watch/dealers/${dealerId}/summary`,
        { month },
      ),
    staleTime: 60_000,
  });
}

/**
 * The cross-dealer inbox: every finding across every dealer.
 *
 * `refetchOnWindowFocus: false`, for the same reason the Kavach work queue
 * turns it off: an admin who alt-tabs to check a portal statement would come
 * back to a list that had silently reordered and shortened around the row they
 * were reading. This list refreshes when they ask it to.
 */
export function useLedgerFlagInbox(filters: LedgerFlagFilters = {}) {
  return useInfiniteQuery({
    queryKey: ledgerWatchKeys.inbox(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<LedgerFlagPage>('/ledger-watch/flags', {
        status: filters.status,
        kind: filters.kind,
        severity: filters.severity,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchOnWindowFocus: false,
  });
}

/**
 * The rule catalogue — twelve seeded patterns plus anything proposed since.
 *
 * Long `staleTime`: the catalogue changes when an admin confirms a proposal or
 * a deploy re-seeds it, neither of which is worth a refetch on every focus.
 */
export function useLedgerMovementRules() {
  return useQuery({
    queryKey: ledgerWatchKeys.rules,
    queryFn: () => api.get<LedgerMovementRuleList>('/ledger-watch/rules'),
    staleTime: 10 * 60_000,
  });
}

/* ─────────────────────────────── Mutations ──────────────────────────────── */

/**
 * Acknowledge, resolve or ignore one finding.
 *
 * WHY THE LISTS ARE MARKED STALE BUT NOT REFETCHED (`refetchType: 'none'`):
 * an admin works down a list they can see. Refetching every loaded page after
 * each Acknowledge would reorder and shorten that list between one row and the
 * next, so the row under the thumb would not be the row that was there a
 * moment ago. Both screens keep a handled row on screen, marked, until a
 * deliberate refresh — the same rule the Kavach work queue already follows and
 * for the same reason.
 *
 * The month summary is NOT invalidated, and that is not an oversight: a flag's
 * status is a note about a row, and the four figures are sums over the rows
 * themselves. Acknowledging a ₹9,443 fee does not un-charge it.
 */
export function useUpdateLedgerFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateLedgerFlagInput }) =>
      api.patch<LedgerFlagDto>(`/ledger-watch/flags/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ledgerWatchKeys.flags,
        refetchType: 'none',
      });
    },
  });
}

/**
 * Confirm or reject a proposed rule.
 *
 * A confirmed rule starts classifying rows immediately — the month summary
 * classifies live rather than reading the class cached on each transaction —
 * so every summary is invalidated and refetched here. That is the opposite
 * choice from the flag mutation above, and the difference is real: this write
 * changes what the figures MEAN, so leaving a stale summary on screen would be
 * showing an admin a number the catalogue no longer agrees with.
 */
export function useUpdateLedgerMovementRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateLedgerRuleInput }) =>
      api.patch<LedgerMovementRuleDto>(`/ledger-watch/rules/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ledgerWatchKeys.rules });
      void qc.invalidateQueries({ queryKey: ledgerWatchKeys.all });
    },
  });
}

/**
 * What the fleet sweep did, as the server reports it.
 *
 * Every count is on the result rather than derivable from the screen, because
 * the two things the sweep does that a per-dealer run cannot — comparing an
 * outlet against its peers, and proposing a name for an unnameable line — are
 * both invisible in the list until it reloads. The toast is where an admin finds
 * out whether pressing the button achieved anything.
 */
export interface LedgerWatchSweepResult {
  dealers: number;
  failed: number;
  rows: number;
  flagsDetected: number;
  flagsInserted: number;
  flagsWithdrawn: number;
  unknownSignatures: number;
  proposalsAttempted: number;
  proposals: { signature: string; status: 'written' | 'existing'; titleEn: string }[];
  proposalFailures: { signature: string; outcome: string; detail: string }[];
  proposalsSkipped: string[];
}

/**
 * Run the fleet pass across every outlet.
 *
 * SLOW AND DELIBERATE. It reads every dealer's whole ledger to build the peer
 * comparison, then may make a model call per newly-unnameable signature — so it
 * is a button somebody presses, not something that fires on page load. There is
 * no `staleTime` to tune here because it is a mutation: it writes findings,
 * closes ones that have gone away, and may add inactive rule proposals.
 *
 * Everything is invalidated on success, including the summaries: a confirmed
 * peer finding changes no figure, but a withdrawn one changes the counts on both
 * screens and a new proposal changes the confirm queue.
 */
export function useRunLedgerWatchSweep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { propose?: boolean } = {}) =>
      api.post<LedgerWatchSweepResult>(
        `/ledger-watch/sweep${opts.propose === false ? '?propose=false' : ''}`,
        {},
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ledgerWatchKeys.all });
    },
  });
}
