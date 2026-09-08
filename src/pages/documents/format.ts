import {
  DOCUMENT_REMINDER_OFFSET_MAX_DAYS,
  documentDaysToExpiry,
  normaliseReminderOffsets,
  type AdminDocumentAskRow,
  type ExpiryState,
} from '@dk/shared';

/**
 * The validity register's words and shapes — everything the papers-on-file
 * screens need that is not React.
 *
 * WHERE THE DECIDABLE LOGIC LIVES, AND WHY MOST OF IT IS NOT HERE
 * ---------------------------------------------------------------
 * The verdict (`documentValidityState`), the day count
 * (`documentDaysToExpiry`), the sentence on the badge
 * (`documentValidityLabel`), the ladder resolution (`resolveReminderOffsets`),
 * the sort (`compareDocumentValidityRows`) and the tiles
 * (`documentValidityTally`) are ALL in `@dk/shared`, covered by the dealer app's
 * vitest. `mdg-admin` has no `test` script and not one test file — checked, not
 * assumed — so the standing rule for this app was followed again: anything
 * decidable goes to `shared`, where a test can reach it.
 *
 * The ladder parser used to live here too. It is now
 * `parseReminderLadder` / `formatReminderLadder` / `sameReminderLadder` in
 * `@dk/shared`, with tests behind it — which is where it always belonged, and
 * the reason the rule exists: the traps it guards against (`1e3`, `0x0f`,
 * `Infinity`, `2.5`, a lower-case L typed for a one) are exactly the sort of
 * thing nobody re-checks by hand.
 *
 * What is left here is this screen's and nobody else's: the English facet
 * labels, the mapping from a facet to a query, and the flattening of
 * `AdminDocumentAskRow` into the one row three surfaces draw. It stays free of
 * JSX for the same reason `dataVault/documents/format.ts` does — a module of
 * words and data can be read and diffed without a renderer.
 *
 * THE DATE FORMATTER IS `dealerProfileDateLabel` AND NEVER `documentPeriodLabel`
 * ----------------------------------------------------------------------------
 * That is not a preference, it is the single most damaging mistake this feature
 * could make. `documentPeriodLabel` deliberately omits the YEAR, because a
 * document period is always the last few weeks. A trade licence valid until
 * 31 December 2027 printed as "31 Dec" reads as this year to anybody, and a
 * licence that lapsed on 31 August 2026 printed as "31 Aug" reads as one that
 * has not lapsed yet. The screens import `dealerProfileDateLabel` directly; this
 * note is here because the wrong import compiles.
 */

/* ─────────────────────────────── The one row ────────────────────────────── */

/**
 * One paper MDG holds, as the validity register reads it.
 *
 * Built from `AdminDocumentAskRow` rather than replacing it, because a filed
 * paper IS an accepted ask — there is no second collection and there must not be
 * a second row type that could disagree with it. The verdict and the day count
 * are taken from the SERVER'S fields, not recomputed here: every row on a
 * response is measured against one `todayYmd`, and re-deriving in the browser
 * would judge a hundred rows against a clock that is not the one the reminder
 * sweep uses.
 */
export interface DocumentValidityRow {
  /** Stable key, and the handle every action takes. */
  askId: string;
  dealerId: string;
  /** A dealer IS its code. There is no name to fall back on, by design. */
  dealerCode: string;
  kindCode: string;
  /**
   * What the paper is called, in English, with the admin's own words appended
   * for a freeform ask. Also what `compareDocumentValidityRows` breaks ties on,
   * which is why it is a plain string and never a node.
   */
  title: string;
  /** The day printed on the paper, `YYYY-MM-DD`. Absent means it does not run out. */
  validUntil?: string;
  /** `expired` | `expiring` | `valid`, or absent — which means NO VERDICT, never a good one. */
  validityState?: ExpiryState;
  /** Whole days left; negative once it has gone. `null` when unknowable. */
  daysToExpiry: number | null;
  /** The ladder actually in force, override already resolved by the server. */
  cadence: number[];
  /** True when THIS paper carries its own ladder rather than inheriting its kind's. */
  cadenceOverridden: boolean;
  /** True when a renewal request has already been opened off the back of this one. */
  renewalOpen: boolean;
  /** True when this row IS a renewal of an earlier paper. */
  isRenewal: boolean;
  /** How many ladder steps have been settled — sent or written off. */
  remindersSettled: number;
  /** ISO instant of the most recent step that actually went out. */
  lastRemindedAt?: string;
  /** ISO instant the "this has lapsed" notice went out. Once, ever. */
  lapsedNoticeAt?: string;
  /** True when an admin filed this paper rather than the dealer sending it. */
  filedByMdg: boolean;
  /** Who filed or sent it, when the row carries a name. */
  filedByName?: string;
  filedAt?: string;
  /** True when there is a paper to open. */
  hasFile: boolean;
  /** The whole row, so the drawer needs no second request. */
  ask: AdminDocumentAskRow;
}

/** One accepted ask, flattened. */
export function rowFromValidityAsk(ask: AdminDocumentAskRow): DocumentValidityRow {
  // The most recent step that was actually SENT, not merely settled. A skipped
  // step is bookkeeping — the window had gone by — and printing it as "last
  // reminded" would claim we told a dealer something we deliberately did not.
  const sent = (ask.remindersSent ?? []).filter((r) => r.outcome === 'sent');
  const lastSent = sent.length > 0 ? sent[sent.length - 1] : undefined;
  return {
    askId: ask.id,
    dealerId: ask.dealerId,
    dealerCode: ask.dealerCode ?? '',
    kindCode: ask.kindCode,
    // The admin's own words win over the catalog title for a freeform ask:
    // "A document MDG asked for" names nothing.
    title: ask.label ? `${ask.titleEn} — ${ask.label}` : ask.titleEn,
    ...(ask.validUntil ? { validUntil: ask.validUntil } : {}),
    ...(ask.validityState ? { validityState: ask.validityState } : {}),
    daysToExpiry: ask.daysToExpiry ?? null,
    // `cadence` is the server's resolved answer. The fallback re-resolves from
    // the row's own override so a response from an older build still draws
    // something truthful rather than an empty ladder, which would read as
    // "reminders are off" — the opposite of what an absent field means.
    cadence: ask.cadence ?? normaliseReminderOffsets(ask.reminderOffsetDays),
    cadenceOverridden: ask.reminderOffsetDays !== undefined,
    renewalOpen: Boolean(ask.renewedByAskId),
    isRenewal: Boolean(ask.renewalOfAskId),
    remindersSettled: (ask.remindersSent ?? []).length,
    ...(lastSent ? { lastRemindedAt: lastSent.at } : {}),
    ...(ask.lapsedNoticeAt ? { lapsedNoticeAt: ask.lapsedNoticeAt } : {}),
    filedByMdg: ask.submission?.byKind === 'admin',
    ...(ask.submission?.byName ? { filedByName: ask.submission.byName } : {}),
    ...(ask.submission?.at ? { filedAt: ask.submission.at } : {}),
    hasFile: ask.hasFile,
    ask,
  };
}

/* ─────────────────────────────── The facets ─────────────────────────────── */

/**
 * The validity facet.
 *
 * `undated` is a real answer and not a bucket for mistakes: most papers on file
 * genuinely do not run out, and one that carries an unreadable date lands here
 * too, because `expiryState` fails closed and returns no verdict rather than a
 * green one. Naming it on the filter bar is what stops "expired: 0, expiring: 0"
 * from being read as "everything is fine" when the real answer is "nothing has a
 * date on it".
 */
export type ValidityFilter = 'all' | 'expired' | 'expiring' | 'valid' | 'undated';

export const VALIDITY_FILTERS: ReadonlyArray<{ value: ValidityFilter; label: string }> = [
  { value: 'all', label: 'All papers on file' },
  { value: 'expired', label: 'Expired' },
  { value: 'expiring', label: 'Running out' },
  { value: 'valid', label: 'In force' },
  { value: 'undated', label: 'No date on file' },
];

/** The facet a URL names, falling back to everything. Total, so a stale link still opens. */
export function resolveValidityFilter(value: string | null): ValidityFilter {
  const found = VALIDITY_FILTERS.find((f) => f.value === value);
  return found ? found.value : 'all';
}

/**
 * Does this row belong to the facet?
 *
 * THE SERVER NOW DOES THIS TOO, and this is kept anyway for two cases where it
 * is still the only authority:
 *
 *  - `undated` cannot be asked for. Both server-side validity filters require
 *    `validUntil != null`, so "on file with no date" has no query behind it and
 *    is narrowed here over an unfiltered page.
 *  - a state facet AND a horizon together. The route ASSIGNS `filter.validUntil`
 *    rather than merging it, so a `validityState` overwrites the range an
 *    `expiringWithinDays` set — the horizon would be silently dropped. Only the
 *    state is sent; the horizon is applied here.
 *
 * Everywhere else it is belt-and-braces over a page the server already narrowed,
 * which costs nothing and means a filter cannot disagree with itself.
 */
export function matchesValidityFilter(
  filter: ValidityFilter,
  state: ExpiryState | undefined,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'expired':
      return state === 'expired';
    case 'expiring':
      return state === 'expiring';
    case 'valid':
      return state === 'valid';
    case 'undated':
      return state === undefined;
    default: {
      // A facet added above with no arm here stops compiling, rather than
      // quietly matching nothing and showing an empty screen.
      const unhandled: never = filter;
      return unhandled;
    }
  }
}

/**
 * The horizon this screen opens on, and the farthest one the route will take.
 *
 * A YEAR, WHICH IS ALSO THE CAP. `expiringWithinDays` is bounded at 365 by the
 * query schema, so "every dated paper, whenever it runs out" is not a question
 * this route can be asked — and that is the right trade rather than a gap. A
 * certificate good until 2029 is not running out, and a register called "what is
 * running out" should not lead with it. A paper past the horizon is reached by
 * setting the window to "Any date", which is a visible control saying what it
 * does; the two narrowings compose, so "In force" plus "Within a year" means
 * exactly what both labels say.
 *
 * Opening on a horizon rather than on nothing is what puts the list in
 * VALIDITY order: the route sorts by `validUntil` ascending only when the query
 * carries one of the two validity filters, and by period descending otherwise —
 * where every dated paper sorts last, because its period key is the empty
 * string.
 */
export const DEFAULT_EXPIRING_WITHIN_DAYS = 365;

/** The horizons the "runs out" control offers. `null` is no horizon at all. */
export const EXPIRING_WITHIN_CHOICES: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: 7, label: 'Within 7 days' },
  { value: 15, label: 'Within 15 days' },
  { value: 30, label: 'Within 30 days' },
  { value: 60, label: 'Within 60 days' },
  { value: 90, label: 'Within 90 days' },
  { value: DEFAULT_EXPIRING_WITHIN_DAYS, label: 'Within a year' },
  { value: null, label: 'Any date' },
];

/**
 * The horizon a URL names.
 *
 * ABSENT MEANS A YEAR, not "no horizon". A bare `/documents` has to open on the
 * validity ordering or the first page is three hundred register pages — see
 * {@link DEFAULT_EXPIRING_WITHIN_DAYS}. `?within=any` is how a person asks for
 * no horizon at all, and it is a real value rather than the absence of one.
 */
export function resolveExpiringWithin(value: string | null): number | null {
  if (value === null) return DEFAULT_EXPIRING_WITHIN_DAYS;
  if (value === 'any') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > DOCUMENT_REMINDER_OFFSET_MAX_DAYS) {
    return DEFAULT_EXPIRING_WITHIN_DAYS;
  }
  return EXPIRING_WITHIN_CHOICES.some((c) => c.value === n) ? n : DEFAULT_EXPIRING_WITHIN_DAYS;
}

/** The `?within=` a horizon is written as. The inverse of the resolver above. */
export function expiringWithinParam(within: number | null): string | null {
  if (within === null) return 'any';
  return within === DEFAULT_EXPIRING_WITHIN_DAYS ? null : String(within);
}

/** What `GET /v1/asks` is asked for, so the page it returns is the page wanted. */
export interface ValidityQueryFacet {
  validityState?: 'expired' | 'expiring' | 'valid';
  expiringWithinDays?: number;
}

/**
 * The facet and the horizon, as query parameters.
 *
 * ONE PLACE, because the two interact in a way no call site should have to
 * remember. The route builds `filter.validUntil` by ASSIGNMENT: an
 * `expiringWithinDays` sets a range, and a `validityState` then replaces it
 * outright. Sending both would therefore drop the horizon silently, which is why
 * a named state wins here and the horizon is left to the client-side predicate.
 *
 * `undated` sends NEITHER, deliberately. Both server-side filters require
 * `validUntil != null`, so asking for one would return an empty page; the
 * unfiltered query is the only one that contains undated rows at all.
 */
export function validityQuery(
  filter: ValidityFilter,
  within: number | null,
): ValidityQueryFacet {
  switch (filter) {
    case 'expired':
    case 'expiring':
    case 'valid':
      return { validityState: filter };
    case 'undated':
      return {};
    case 'all':
      return within === null ? {} : { expiringWithinDays: within };
    default: {
      const unhandled: never = filter;
      return unhandled;
    }
  }
}

/**
 * Whether the query behind this view is VALIDITY-ordered.
 *
 * The route sorts by `validUntil` ascending only when one of the two validity
 * filters is sent, and by period descending otherwise — and a period-ordered
 * page puts every dated paper last, because its period key is the empty string.
 * The screen has to be able to say which of the two it is showing.
 */
export function isValidityOrdered(filter: ValidityFilter, within: number | null): boolean {
  const q = validityQuery(filter, within);
  return q.validityState !== undefined || q.expiringWithinDays !== undefined;
}

/**
 * Is this paper inside the horizon?
 *
 * ALREADY-EXPIRED ROWS COUNT AS INSIDE IT, and that is the reading somebody
 * asking "what runs out in the next 30 days" wants: a licence that ran out last
 * Tuesday is not less urgent than one running out next Tuesday, and dropping it
 * from a horizon filter would hide the worst rows behind the filter meant to
 * surface them. A paper with no date at all is outside every horizon — there is
 * nothing to be within.
 */
export function matchesExpiringWithin(within: number | null, daysToExpiry: number | null): boolean {
  if (within === null) return true;
  if (daysToExpiry === null) return false;
  return daysToExpiry <= within;
}

/**
 * The facet AND the horizon, applied together — the only predicate a screen
 * should call.
 *
 * THE TWO CANCEL EACH OTHER OUT ON ONE FACET, and separately they read as
 * obviously correct. A paper with no date is outside every horizon (there is
 * nothing to be within), and the screen opens on a one-year horizon by default —
 * so `undated` combined with the default window matches NOTHING, and "No date on
 * file" shows an empty list on an estate that has plenty. The horizon simply
 * does not apply to a facet that is about the absence of a date, and saying that
 * once here is what stops it being rediscovered on the next screen.
 */
export function matchesValidityScope(
  filter: ValidityFilter,
  within: number | null,
  row: { validityState?: ExpiryState; daysToExpiry: number | null },
): boolean {
  if (!matchesValidityFilter(filter, row.validityState)) return false;
  if (filter === 'undated') return true;
  return matchesExpiringWithin(within, row.daysToExpiry);
}

/* ──────────────────────────── The validity words ────────────────────────── */

/** What each verdict is CALLED on these screens. */
export const VALIDITY_WORD: Record<ExpiryState | 'undated', string> = {
  expired: 'Expired',
  expiring: 'Running out',
  valid: 'In force',
  undated: 'No date',
};

/**
 * The colours each verdict is drawn in.
 *
 * NOT `INTENT_CLASSES`, and this is the one place in the app that departs from
 * it. The shipped pairing is `bg-*-soft` + `text-*`, which measures 3.14:1 for
 * amber and 3.00:1 for green — well under the 4.5:1 an ordinary reader needs,
 * and this list is read by a 55-year-old outdoors under a forecourt canopy on a
 * cheap screen. The `strong` shades added to `tailwind.config.ts` measure
 * 6.37:1, 6.80:1 and 6.49:1 against the same backgrounds.
 *
 * `INTENT_CLASSES` itself is deliberately left alone: changing it would restyle
 * every badge in the portal in one commit, and one accessible surface now beats
 * a whole-portal restyle nobody asked for. Neutral keeps the shared pairing
 * because it already measures 6.15:1.
 *
 * AND COLOUR IS NEVER THE ONLY CARRIER. `ValidityPill` gives each verdict its own
 * SHAPE as well, for the reasons `StatusPip`'s header sets out at length —
 * roughly one man in twelve cannot separate the amber from the green, and the
 * first thing anybody does with a list like this is screenshot it into a chat.
 */
export const VALIDITY_CLASSES: Record<ExpiryState | 'undated', string> = {
  expired: 'bg-danger-soft text-danger-strong',
  expiring: 'bg-warning-soft text-warning-strong',
  valid: 'bg-success-soft text-success-strong',
  undated: 'bg-neutral-soft text-neutral',
};

/** The same four, as a bare foreground — for a glyph on the page's own surface. */
export const VALIDITY_TEXT_CLASSES: Record<ExpiryState | 'undated', string> = {
  expired: 'text-danger-strong',
  expiring: 'text-warning-strong',
  valid: 'text-success-strong',
  undated: 'text-text-subtle',
};

/** The verdict as a key both records above can be indexed by. */
export function validityKey(state: ExpiryState | undefined): ExpiryState | 'undated' {
  return state ?? 'undated';
}

/**
 * The ladder in words: "15, 3, 2, 1 days before" — or the silence, said plainly.
 *
 * An empty ladder gets a SENTENCE and not a dash, because it is a deliberate
 * setting somebody chose and a dash reads as missing data. The pill and the push
 * both come off the first step of this list, so what is printed here is exactly
 * what will happen.
 */
export function cadenceSentence(cadence: readonly number[]): string {
  if (cadence.length === 0) return 'Never — reminders are off for this one';
  const steps = [...cadence].sort((a, b) => b - a);
  const day = (n: number) => (n === 0 ? 'the day itself' : String(n));
  const named = steps.map(day).join(', ');
  return steps.length === 1 && steps[0] === 0
    ? 'On the day it runs out'
    : `${named} days before`;
}

/**
 * What this register owes its reader when it is not showing everything.
 *
 * A SHORT PAGE IS NOT THE END OF THE LIST, and on this route that is a fact
 * rather than a caution. The `valid` / `expiring` boundary is each row's own
 * first ladder step, so the route can only narrow to "not yet lapsed" in the
 * query and must filter the exact band on the rows AFTER paging — which means a
 * page of 200 can come back holding nine while `nextCursor` still points at
 * more. Counting the rows on screen and concluding the list has ended is
 * therefore wrong here in a way it is not on an ordinary list.
 *
 * `hasMore` is accordingly the SERVER'S own answer (a `nextCursor`), never a
 * guess from `shown === limit`, and the sentence names the button that fixes it
 * because this screen really does have one.
 */
export function validityListCaveat(input: {
  shown: number;
  hasMore: boolean;
  /** Whether a facet is hiding some of the rows that WERE loaded. */
  filtered: boolean;
}): string {
  if (!input.hasMore) return '';
  const head = `Showing ${input.shown} paper${input.shown === 1 ? '' : 's'}, and there are more.`;
  return input.filtered
    ? `${head} A paper further down has not been looked at, so “nothing matches” here does not mean nothing is expiring — load more, or narrow by dealer or by paper.`
    : `${head} Load more, or narrow by dealer or by paper.`;
}

/* ─────────────────────────── The prefilled date ─────────────────────────── */

/**
 * How many days a typed date is from today, for the "does this look right?"
 * line under a validity box.
 *
 * A thin wrapper on the shared helper so the two call sites (the file-for-dealer
 * dialog and the accept panel) cannot come to disagree about what "today" means
 * — both hand it `istTodayYmd()`.
 */
export function daysFromToday(isoDay: string, today: string): number | null {
  return documentDaysToExpiry(isoDay, today);
}
