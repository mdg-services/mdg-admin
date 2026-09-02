import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { isYmd } from '@/lib/format';
import type {
  IrasCorrectionCommitInput,
  IrasCorrectionCommitResult,
  IrasCorrectionPreview,
  IrasDataCorrection,
  IrasDayEditorView,
  SlipReading,
} from '@dk/shared';
import type { ReadSlipInput } from '@dk/shared/schemas';

import { dsrKeys } from './useDsr';
import { irasDataKeys } from './useIrasData';

/**
 * The shift data editor's API surface.
 *
 * One read for the whole day, one write for every kind of change (including
 * reverts), and one read-only recompute. Kept apart from `useIrasData` because
 * that file is the read-only Vault and this one is the only place in the admin
 * that WRITES portal figures — a distinction worth being able to see in an import
 * list.
 */

/**
 * The pending change set, i.e. a commit without its revision and reason.
 *
 * `acknowledgedUnchangedNozzles` is subtracted too, and that is deliberate. It
 * is a statement about the operator ("this pump did not run today"), not a
 * change to any figure: it belongs in the commit's audit entry and nowhere else.
 * Leaving it in this type would let it be sent to the preview endpoint, which
 * neither reads it nor records it — and would make the change set the unload
 * guard counts disagree with the change set the server is asked to apply.
 */
export type IrasPendingChanges = Omit<
  IrasCorrectionCommitInput,
  'revision' | 'reason' | 'acknowledgedUnchangedNozzles'
>;

export const irasEditKeys = {
  all: ['irasEdits'] as const,
  day: (dealerId: string | undefined, businessDate: string | undefined) =>
    ['irasEdits', 'day', dealerId, businessDate] as const,
  history: (dealerId: string | undefined) => ['irasEdits', 'history', dealerId] as const,
  slipPhoto: (dealerId: string | undefined, slipReadId: string | undefined) =>
    ['irasEdits', 'slipPhoto', dealerId, slipReadId] as const,
};

/**
 * The commit body, with the one field `@dk/shared` does not carry.
 *
 * `slipReadIds` is on the wire and on the route's zod schema, and deliberately
 * NOT on `IrasCorrectionCommitInput`: it is not a change to a figure, it is a
 * note saying which photographs the operator was looking at while they typed,
 * and the same reasoning that keeps `acknowledgedUnchangedNozzles` off every
 * correction document keeps this off the shared type. Widened here, at the one
 * place in the admin that sends a commit, rather than by editing `shared`.
 *
 * A stale id is harmless by design: the server keeps only the ids that belong to
 * this dealer AND this business date, and then works out per nozzle which
 * figures actually landed. Sending none is harmless too — nothing is refused
 * over it, because a photograph must never be able to fail a morning.
 */
export type IrasCorrectionCommitBody = IrasCorrectionCommitInput & {
  /** Slip reads whose figures this commit is putting on record. At most ten. */
  slipReadIds?: string[];
};

/**
 * Everything the editor needs for one dealer-day.
 *
 * `staleTime: 0` on purpose. Every other Vault read is a cache-friendly view of
 * immutable capture data; this one carries the `revision` token a commit is
 * validated against, and a stale token means the operator's Apply fails with
 * "somebody else changed this day" when nobody did.
 */
export function useIrasDay(dealerId: string | undefined, businessDate: string | undefined) {
  return useQuery({
    queryKey: irasEditKeys.day(dealerId, businessDate),
    queryFn: () =>
      api.get<IrasDayEditorView>(`/iras-data/dealers/${dealerId}/days/${businessDate}`),
    enabled: !!dealerId && !!businessDate && isYmd(businessDate),
    staleTime: 0,
  });
}

/** Every correction this dealer has had made, newest day first. */
export function useDealerCorrections(dealerId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: irasEditKeys.history(dealerId),
    queryFn: () =>
      api.get<{ corrections: IrasDataCorrection[] }>(
        `/iras-data/dealers/${dealerId}/corrections`,
        { limit: 100 },
      ),
    enabled: !!dealerId && enabled,
    staleTime: 30_000,
  });
}

/**
 * Recompute the day with the pending changes applied — persists nothing.
 *
 * A mutation rather than a query because it is driven by an explicit "review"
 * action over a body the operator is still assembling; caching it by that body
 * would be caching a keystroke.
 */
export function usePreviewIrasCorrections(dealerId: string, businessDate: string) {
  return useMutation({
    mutationFn: (changes: IrasPendingChanges) =>
      api.post<IrasCorrectionPreview>(
        `/iras-data/dealers/${dealerId}/days/${businessDate}/corrections/preview`,
        changes,
      ),
  });
}

/**
 * How long a finished save waits for the day to come back before it stops
 * waiting.
 *
 * Eight seconds, chosen against the journey rather than against a round trip:
 * the day payload is one small JSON document, it is well under a second on a
 * usable connection and a couple of seconds on a bad one, so eight is far past
 * "slow" and squarely in "this network is gone". Below that a genuinely slow
 * forecourt connection would start finishing saves early and bring back the
 * flash of "every row is missing" the wait exists to prevent; far above it the
 * operator is left watching a spinner for work that is already safe.
 */
const DAY_CATCH_UP_MS = 8_000;

/** Resolves after `ms`. Deliberately never rejects — it is a deadline, not a
 *  failure. */
function afterMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Apply a day's corrections. Invalidates the Vault (the rows changed), the DSR
 * (reports were flagged) and this day (a new revision token) — the commit is one
 * decision, so it refreshes everything that decision touched.
 *
 * The day is the one of the three that is WAITED for, and that is the whole
 * point of the shape below. React Query awaits a promise returned from
 * `onSuccess` before it resolves `mutateAsync` and before the mutation leaves
 * its pending state, so returning the day's invalidation makes "the save
 * finished" mean "the day has caught up" rather than "the server said yes".
 *
 * Without that wait, the caller's very next act — `pending.discardAll()` in
 * `ShiftDataEditorPage` — ran against the payload React Query is still serving
 * from BEFORE the commit, which on a first save is a day with no corrections and
 * no portal rows at all. For one round trip, seconds on a 2G phone, the operator
 * was told the shift had saved and, in the same breath, that every row they had
 * just typed was missing — eight empty sections under a red panel offering to
 * lay the rows out again. Pressing that button scaffolded a second set of blank
 * rows into the now-empty pending set, and when the refetch landed each one
 * collided with the row already saved for that nozzle, so every one of them came
 * back DUPLICATE_IDENTITY and the only way out was discarding the morning.
 *
 * The Vault list and the DSR queries stay fire-and-forget on purpose: they feed
 * other screens, nothing on this one reads them before it is safe to, and making
 * the save button spin until they answer would buy an operator nothing.
 *
 * The wait is BOUNDED, though, because waiting for the day is a courtesy and the
 * save is not. A phone that loses the network in the second after the PUT lands
 * leaves that refetch neither finished nor failed: React Query pauses a query it
 * cannot run offline, and a request that merely stalls on a dying 2G cell never
 * calls back at all. Every one of those cases used to hold `mutateAsync` open
 * for as long as the outage lasted, and everything the screen does after the
 * save is behind that await — the dialog stays spinning with its Cancel
 * disabled, the pending set is never discarded, so the unload guard is still
 * armed and closing the tab warns the operator they are about to lose a morning
 * that is already on the server. That is a worse lie than the one the wait was
 * added to prevent. So the day gets {@link DAY_CATCH_UP_MS} to catch up and the
 * save then finishes regardless, with the refetch still running behind it and
 * still landing when the network comes back.
 */
export function useCommitIrasCorrections(dealerId: string, businessDate: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IrasCorrectionCommitBody) =>
      api.put<IrasCorrectionCommitResult>(
        `/iras-data/dealers/${dealerId}/days/${businessDate}/corrections`,
        body,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: irasDataKeys.all });
      void qc.invalidateQueries({ queryKey: dsrKeys.all });
      // Every cached day, not just this one: a day's meter readings are the next
      // day's "yesterday". Only the mounted day actually refetches — React Query
      // refetches active queries — so this is also exactly the promise to wait on.
      const dayCaughtUp = qc
        .invalidateQueries({ queryKey: irasEditKeys.all })
        // A refetch that fails is already swallowed inside React Query, which
        // wraps each one in its own catch; this is here so that a future version
        // of that library, or a query configured to throw, cannot turn a save
        // the server has accepted into "your changes were not applied".
        .catch(() => undefined);
      return Promise.race([dayCaughtUp, afterMs(DAY_CATCH_UP_MS)]);
    },
  });
}

/* ─────────────────────────── reading the slip ──────────────────────────── */

/**
 * What one read of one photograph came back with.
 *
 * Declared here rather than imported, because it is the backend service's own
 * response shape and `@dk/shared` carries only the half both sides decide with —
 * `SlipReading`. The four fields around it are this route's, and typing them
 * here is what keeps the screen from reaching for a field the route does not
 * send.
 */
export interface SlipReadResponse {
  slipReadId: string;
  reading: SlipReading;
  /** The transcript the parser read. Shown to the operator against the paper. */
  transcript: string[];
  photo: { storageKey: string; viewUrl: string; expiresIn: number };
  quota: { limit: number; used: number; remaining: number; businessDate: string };
  cost: { tokensIn: number; tokensOut: number; estPaise: number };
}

/**
 * Read one slip. Writes nothing to the day — not one figure, not one row.
 *
 * A mutation and not a query, because it is an act with a cost: it spends one of
 * this dealer's ten reads for the day, it holds a slot on a box that also runs
 * portal sessions, and it is driven by a photograph the operator has just taken.
 * Cached by anything, it would be re-run by a refocus.
 *
 * `signal` is threaded through because `Stop` has to mean it. The route wires
 * the response's close to an `AbortController` of its own, so a client that goes
 * away actually releases the slot rather than paying for a read nobody will see.
 */
export function useReadSlip(dealerId: string, businessDate: string) {
  return useMutation({
    mutationFn: ({ body, signal }: { body: ReadSlipInput; signal?: AbortSignal }) =>
      api.post<SlipReadResponse>(
        `/iras-data/dealers/${dealerId}/days/${businessDate}/read-slip`,
        body,
        signal,
      ),
  });
}

/**
 * A fresh signed URL for one slip's photograph, every time the picture is drawn.
 *
 * Signed on demand and never held. The URL lives fifteen minutes, and one held
 * across a break renders as a broken image — which, on the one screen whose
 * whole job is showing the operator the evidence, looks exactly like no evidence
 * at all. `refetchOnMount: 'always'` with no stale window is what makes "opened
 * the picture" and "asked for a URL" the same event.
 *
 * `gcTime: 0` so a URL that has expired cannot be served from the cache to the
 * next open, and `retry: false` because a 404 here means the id belongs to
 * another dealer and asking again will not change that.
 */
export function useSlipPhotoUrl(
  dealerId: string | undefined,
  slipReadId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: irasEditKeys.slipPhoto(dealerId, slipReadId),
    queryFn: () =>
      api.get<{ viewUrl: string; filename: string; contentType: string; expiresIn: number }>(
        `/iras-data/dealers/${dealerId}/slip-reads/${slipReadId}/photo-url`,
      ),
    enabled: enabled && !!dealerId && !!slipReadId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
  });
}
