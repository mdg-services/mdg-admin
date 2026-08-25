import { AlertTriangle, CalendarDays, ChevronDown } from 'lucide-react';
import * as React from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { formatDate, isYmd, toYmd } from '@/lib/format';

import { Button } from './Button';
import { Input } from './Input';
import { Menu, MenuItem } from './Menu';
import { Sheet } from './Sheet';

/**
 * A date-window filter: three quick presets plus a custom from/to range.
 *
 * This lives in the UI kit rather than inside the one tab that needed it first
 * because every windowed ledger in the admin wants the same behaviour — and,
 * more importantly, the same guard rails. A naive pair of `<input type="date">`
 * fields fires requests nobody asked for:
 *
 *  - The native picker only reports a value once all three segments are filled,
 *    but a year typed digit-by-digit produces four *complete* dates on the way
 *    there (0002-…, 0020-…, 0202-…, 2026-…). Committing each one hammers the API
 *    with absurd windows, so edits are debounced and anything before
 *    `MIN_SELECTABLE_YMD` is refused outright.
 *  - A reversed range (`from` after `to`) is not an error server-side: a Mongo
 *    `$gte`/`$lte` match on it simply returns zero rows, which reads as "this
 *    dealer did nothing" instead of "you typed the dates backwards". So we swap
 *    the pair and say so, rather than rendering a truthful-looking empty state.
 *  - A half-filled range never reaches the caller at all: `onChange` is only
 *    called with a complete, clamped window, so the parent's query keeps
 *    showing the last good window while the user is still picking.
 *
 * The same rules apply to a window handed *in*, whatever preset it carries. A
 * `value` seeded from a URL or a saved filter is vetted on arrival and the
 * correction emitted back, so the `onChange` contract holds for whatever window
 * the parent ends up holding — not only for the ones typed into these two
 * fields. A hand-edited `?preset=last7&from=…&to=…` runs backwards exactly as
 * easily as a typed pair, and vetting a quick preset costs nothing because its
 * own window always resolves clean. What vetting cannot repair — chiefly a
 * range longer than `maxRangeDays`, where shortening it means guessing which
 * end the admin meant — is named in the message line rather than left to come
 * back a silent 400.
 */

/* ─────────────────────────────── Types ──────────────────────────────────── */

/** The presets with a window we can compute ourselves. */
export type DateRangeQuickPreset = 'today' | 'last7' | 'month' | 'lastMonth';

export type DateRangePreset = DateRangeQuickPreset | 'custom';

export interface DateRangeValue {
  preset: DateRangePreset;
  /** Local calendar day, `YYYY-MM-DD`. Always a complete, valid day. */
  from: string;
  /** Local calendar day, `YYYY-MM-DD`. Never in the future, never before `from`. */
  to: string;
}

export interface DateRangeResolution {
  /** The window to query, or `null` when the pair cannot produce a usable one. */
  value: DateRangeValue | null;
  /** Why nothing can be queried yet. Set if and only if `value` is `null`. */
  problem?: string;
  /** A correction that had to be applied to make the pair usable. */
  adjustment?: string;
}

export interface DateRangeFilterProps {
  value: DateRangeValue;
  /**
   * Called with a complete, clamped, in-order window. The lone exception is
   * pressing Custom on a window the parent seeded that we refuse to query: that
   * pair is handed straight back untouched, so the parent queries nothing it
   * was not already querying, and the fields can open on the very range that
   * needs fixing. See `selectPreset`.
   */
  onChange: (next: DateRangeValue) => void;
  /**
   * Longest window the caller's API can serve, in inclusive days. When the
   * custom range is longer we refuse to commit it and say so, instead of
   * letting the request come back a 400; a quick preset that would exceed it is
   * not offered at all. Omit when the server has no cap.
   */
  maxRangeDays?: number;
  /** Appended to the resolved-window line, e.g. " · target 8 pts / worker". */
  summarySuffix?: React.ReactNode;
  /** Accessible name for the preset chip group. */
  label?: string;
  /** How long to wait after the last keystroke before querying. */
  commitDelayMs?: number;
  /**
   * How the presets are offered below md. Default `'menu'`.
   *
   * Five chips at a 44px touch height wrap to three rows at 360px — about
   * 132px of the screen spent before a single figure is on it, above a table
   * the admin came to read. `'menu'` collapses them to one trigger showing the
   * window that is currently on, and `Menu` already degrades to a bottom sheet
   * on a phone. `'chips'` keeps the row for a screen where switching windows
   * IS the task. At md both render the chip row exactly as before.
   */
  mobilePresets?: 'menu' | 'chips';
  /**
   * Below md, put the custom From/To fields behind a button that opens a
   * sheet, instead of inline under the presets. For a filter that sits at the
   * top of a long list, where two date fields permanently on screen push the
   * first row of data off it. Default false — today's inline behaviour.
   */
  mobileCustomInSheet?: boolean;
  className?: string;
}

/* ─────────────────────────────── Constants ──────────────────────────────── */

export const DATE_RANGE_PRESETS: ReadonlyArray<{ id: DateRangePreset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'custom', label: 'Custom' },
];

/**
 * Floor for a hand-typed date. Nothing in this product predates it, and it is
 * what stops the half-typed years (`0002-07-12`) described above from ever
 * reaching a query.
 */
export const MIN_SELECTABLE_YMD = '2000-01-01';

/* ─────────────────────────────── Pure helpers ───────────────────────────── */

/* `toYmd` / `isYmd` live in `@/lib/format`: the same two questions ("what is
   today's calendar day" and "is this string a real one") are asked by the Data
   Vault's `?date=` control and the staff-points window, and three copies of the
   answer is how they drift apart. */

/** Inclusive day count — a single day is 1, not 0. */
export function dateRangeDays(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000) + 1;
}

/** The window a quick preset resolves to, evaluated against "now". */
export function dateRangeForPreset(preset: DateRangeQuickPreset): DateRangeValue {
  const now = new Date();
  const to = toYmd(now);
  if (preset === 'today') return { preset, from: to, to };
  if (preset === 'last7') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6); // inclusive 7-day window
    return { preset, from: toYmd(from), to };
  }
  if (preset === 'lastMonth') {
    // Day 0 of this month IS the last day of the previous one, so the month
    // length (28/29/30/31) and the January→December year rollover both fall
    // out of the constructor rather than being counted by hand. Unlike every
    // other preset this window ENDS in the past — a settled month is the whole
    // point of it — which is also why it needs no clamping against today.
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    return { preset, from: toYmd(start), to: toYmd(end) };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { preset, from: toYmd(from), to };
}

/** Guard for callers: is this window safe to send to an API? */
export function isValidDateRange(v: { from: string; to: string }): boolean {
  return isYmd(v.from) && isYmd(v.to) && v.from <= v.to;
}

/** The one human rendering of a window — "12 Jul 2026 – 18 Jul 2026". */
export function formatDateRangeLabel(v: { from: string; to: string }): string {
  if (!v.from || !v.to) return '—';
  return v.from === v.to
    ? formatDate(v.from)
    : `${formatDate(v.from)} – ${formatDate(v.to)}`;
}

/**
 * Turn a raw from/to pair into something queryable, or explain why it is not.
 * Exported so callers (and tests) can apply the same rules to a range that
 * arrives from a URL or a saved filter, not just from these two inputs.
 */
export function resolveCustomDateRange(
  from: string,
  to: string,
  opts: { today?: string; maxRangeDays?: number } = {},
): DateRangeResolution {
  const today = opts.today ?? toYmd(new Date());

  if (!isYmd(from) || !isYmd(to)) {
    return {
      value: null,
      problem: 'Pick both a start and an end date to apply a custom range.',
    };
  }
  if (from < MIN_SELECTABLE_YMD || to < MIN_SELECTABLE_YMD) {
    return {
      value: null,
      problem: `Dates before ${formatDate(MIN_SELECTABLE_YMD)} are not supported.`,
    };
  }

  const adjustments: string[] = [];
  let start = from;
  let end = to;

  if (start > today || end > today) {
    if (start > today) start = today;
    if (end > today) end = today;
    adjustments.push(`Future dates hold no data, so the range stops at ${formatDate(today)}.`);
  }
  if (start > end) {
    [start, end] = [end, start];
    adjustments.push('The start date was after the end date, so the two were swapped.');
  }

  const days = dateRangeDays(start, end);
  if (opts.maxRangeDays !== undefined && days > opts.maxRangeDays) {
    return {
      value: null,
      problem: `That is a ${days}-day range. Pick at most ${opts.maxRangeDays} days.`,
    };
  }

  return {
    value: { preset: 'custom', from: start, to: end },
    adjustment: adjustments.join(' ') || undefined,
  };
}

/* ─────────────────────────────── Component ──────────────────────────────── */

interface DraftRange {
  from: string;
  to: string;
}

/** Windows are compared by content: parents rebuild the object every render. */
function sameWindow(a: DateRangeValue | null | undefined, b: DateRangeValue): boolean {
  return !!a && a.preset === b.preset && a.from === b.from && a.to === b.to;
}

export function DateRangeFilter({
  value,
  onChange,
  maxRangeDays,
  summarySuffix,
  label = 'Date range',
  commitDelayMs = 350,
  mobilePresets = 'menu',
  mobileCustomInSheet = false,
  className,
}: DateRangeFilterProps) {
  const fieldsId = React.useId();
  const messageId = React.useId();
  const isMd = useMediaQuery('(min-width: 768px)');
  const [datesOpen, setDatesOpen] = React.useState(false);

  const isCustom = value.preset === 'custom';
  const today = toYmd(new Date());

  /* A quick preset the caller's API cannot serve is not offered. Its window is
     computed from "now", not typed, so there is no half-filled state to wait
     out and nothing to explain after the fact — pressing it could only fire the
     400 that `maxRangeDays` exists to prevent. Re-evaluated every render on
     purpose: "This month" grows past a short cap partway through the month. */
  const presets =
    maxRangeDays === undefined
      ? DATE_RANGE_PRESETS
      : DATE_RANGE_PRESETS.filter((p) => {
          if (p.id === 'custom') return true;
          const w = dateRangeForPreset(p.id);
          return dateRangeDays(w.from, w.to) <= maxRangeDays;
        });

  const [draft, setDraftState] = React.useState<DraftRange>({
    from: value.from,
    to: value.to,
  });
  /** Sticky note about a correction we applied at commit time. The live
   *  resolution can't carry it: once the inputs snap to the corrected window
   *  there is nothing left to complain about, and the explanation would vanish
   *  in the same frame the user needs to read it. */
  const [adjustment, setAdjustment] = React.useState<string | undefined>();

  // The debounced commit runs outside the render that scheduled it, so the
  // draft it reads has to come from a ref rather than a captured closure.
  const draftRef = React.useRef(draft);
  const timerRef = React.useRef<number | null>(null);
  // What we last handed the parent, used to tell our own echo apart from the
  // parent moving the window on its own.
  const lastEmittedRef = React.useRef<DateRangeValue>(value);
  // Whether the window currently on the props has been through the rules below.
  // `lastEmittedRef` starts out holding the very first one, so the echo test
  // alone would wave the seed window through unvetted.
  const vettedRef = React.useRef(false);
  // A window we corrected on the way in and got handed straight back. We argue
  // once: re-emitting at a parent that keeps overriding us is a render loop, and
  // the fields already show the corrected pair either way.
  const refusedRef = React.useRef<DateRangeValue | null>(null);

  const setDraft = React.useCallback((next: DraftRange) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const cancelPending = React.useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const emit = React.useCallback(
    (next: DateRangeValue) => {
      lastEmittedRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  const commit = React.useCallback(() => {
    const resolved = resolveCustomDateRange(draftRef.current.from, draftRef.current.to, {
      today,
      maxRangeDays,
    });
    // Blocked: hold the last good window rather than querying a half-filled one.
    if (!resolved.value) return;

    const { from, to } = resolved.value;
    // Snap the inputs to what we are about to query so the fields and the
    // resolved-window label can never disagree.
    if (from !== draftRef.current.from || to !== draftRef.current.to) {
      setDraft({ from, to });
    }
    setAdjustment(resolved.adjustment);

    if (isCustom && value.from === from && value.to === to) return;
    emit(resolved.value);
  }, [today, maxRangeDays, setDraft, emit, isCustom, value.from, value.to]);

  const commitRef = React.useRef(commit);
  React.useEffect(() => {
    commitRef.current = commit;
  });

  // Drop a pending commit if the control unmounts mid-edit.
  React.useEffect(() => cancelPending, [cancelPending]);

  /**
   * Take on a window the parent handed us: abandon any in-flight edit, mirror it
   * into the inputs — they must show what is queried — and hold it to the same
   * rules as a hand-typed one.
   *
   * The vetting is the point. `onChange` promises a complete, clamped, in-order
   * window, and that promise has to hold for a window we were *given* as much as
   * for one we produced: these fields get seeded from URL params, and a stale or
   * hand-edited `?from=`/`?to=` pair that runs backwards is not an error
   * server-side — it matches nothing, and reads as "this dealer did nothing".
   */
  const adopt = React.useCallback(
    (next: DateRangeValue) => {
      cancelPending();
      lastEmittedRef.current = next;
      refusedRef.current = null; // a new window, a fresh argument

      // Every preset is vetted, not just Custom. A quick preset the *chips*
      // produced always resolves clean, so this costs nothing there — but a
      // quick preset rehydrated from a URL carries whatever from/to the query
      // string said, and `?preset=last7&from=…&to=…` typed backwards by hand is
      // no more queryable than a backwards custom range.
      const resolved = resolveCustomDateRange(next.from, next.to, { today, maxRangeDays });
      // Nothing to correct, or nothing correctable (half-filled, too long a
      // range): show the pair as given and let the live resolution explain it.
      const fixed = resolved.value;
      const from = fixed?.from ?? next.from;
      const to = fixed?.to ?? next.to;

      if (from !== draftRef.current.from || to !== draftRef.current.to) {
        setDraft({ from, to });
      }
      setAdjustment(resolved.adjustment);

      if (fixed && (from !== next.from || to !== next.to)) {
        refusedRef.current = next;
        // We corrected the preset's window; we did not turn it into a custom
        // range. `resolveCustomDateRange` always tags its result 'custom'
        // because that is all it is ever asked about, so put the tag back.
        emit({ ...fixed, preset: next.preset });
      }
    },
    [cancelPending, setDraft, emit, today, maxRangeDays],
  );

  React.useEffect(() => {
    if (vettedRef.current) {
      if (sameWindow(lastEmittedRef.current, value)) {
        // Our own echo. The parent kept what we handed it, so whatever it
        // refused before is water under the bridge.
        refusedRef.current = null;
        return;
      }
      // A correction this parent has already handed straight back to us.
      if (sameWindow(refusedRef.current, value)) return;
    }
    vettedRef.current = true;
    adopt(value);
  }, [value, adopt]);

  function selectPreset(next: DateRangePreset) {
    cancelPending();
    setAdjustment(undefined);
    if (next === 'custom') {
      // Seed Custom from the window already on screen: opening it neither blanks
      // the page nor fires a second query, it just exposes the same dates. They
      // still go through the rules — a quick preset cannot produce a bad pair,
      // but the window a parent seeded us with can, and Custom is where it
      // finally becomes visible and editable.
      const resolved = resolveCustomDateRange(value.from, value.to, { today, maxRangeDays });
      // When the pair is one we refuse to query — a seeded range over
      // `maxRangeDays` — we still pass it through rather than swallowing the
      // press. Everything about this control keys off `value.preset`, so
      // refusing would leave the chip unlit and the fields shut: a dead button
      // in the one state where the admin needs them, with no way back. The pair
      // is the parent's own, unchanged, so nothing new is queried; the fields
      // open on it and the message line says what is wrong with it.
      const seed: DateRangeValue = resolved.value ?? {
        preset: 'custom',
        from: value.from,
        to: value.to,
      };
      setDraft({ from: seed.from, to: seed.to });
      setAdjustment(resolved.adjustment);
      // `sameWindow` compares the preset too, so this also catches the switch
      // into Custom from a quick preset holding the identical dates.
      if (!sameWindow(value, seed)) emit(seed);
      return;
    }
    emit(dateRangeForPreset(next));
  }

  function editDraft(patch: Partial<DraftRange>) {
    setDraft({ ...draftRef.current, ...patch });
    setAdjustment(undefined); // described the previous commit, not this edit
    cancelPending();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      commitRef.current();
    }, commitDelayMs);
  }

  /** Commit now instead of waiting out the debounce (blur, Enter). */
  function flush() {
    if (timerRef.current === null) return;
    cancelPending();
    commitRef.current();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      flush();
    }
  }

  // Live view of the window, so a blocking problem shows the moment it exists
  // rather than one debounce later. Custom reads the draft — that is what is
  // being typed into. Every other preset reads `value`, because a window we
  // refuse to query can arrive on the props and stay there (`adopt` cannot
  // shorten an over-long range without guessing which end was meant), and
  // saying nothing about it is what turns it into an unexplained empty table.
  const resolution = React.useMemo(
    () =>
      isCustom
        ? resolveCustomDateRange(draft.from, draft.to, { today, maxRangeDays })
        : resolveCustomDateRange(value.from, value.to, { today, maxRangeDays }),
    [isCustom, draft.from, draft.to, value.from, value.to, today, maxRangeDays],
  );
  const problem = resolution.problem;
  const message = problem ?? adjustment;

  // Only flag the field that is actually unusable; a range-level problem (too
  // long) leaves both dates valid and is explained by the message alone.
  const usable = (v: string) => isYmd(v) && v >= MIN_SELECTABLE_YMD;
  const fromInvalid = !!problem && !usable(draft.from);
  const toInvalid = !!problem && !usable(draft.to);

  /* Both fields carry the same absolute bounds — deliberately not `from`-capped-
     at-`to` and `to`-floored-at-`from`. Coupling them reads fine on a desktop
     text field and is a trap on a phone: with the window on 01–07 Jul, an admin
     moving it to August taps "From" first and gets a calendar with every August
     day greyed out, no explanation, and no way through except to raise "To"
     first — which also fires a query for the union of both windows on the way.
     Either field can be edited first here; a pair that ends up backwards is what
     `resolveCustomDateRange`'s swap is for, and swapping and saying so is a far
     better answer than a picker that looks broken. */

  const activePreset = DATE_RANGE_PRESETS.find((p) => p.id === value.preset);
  const asMenu = !isMd && mobilePresets === 'menu';
  const customInSheet = !isMd && mobileCustomInSheet;

  const customFields = (
    <>
      <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
        From
        <Input
          type="date"
          value={draft.from}
          min={MIN_SELECTABLE_YMD}
          max={today}
          invalid={fromInvalid}
          aria-invalid={fromInvalid || undefined}
          aria-describedby={message ? messageId : undefined}
          onChange={(e) => editDraft({ from: e.target.value })}
          onBlur={flush}
          onKeyDown={handleKeyDown}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
        To
        <Input
          type="date"
          value={draft.to}
          min={MIN_SELECTABLE_YMD}
          max={today}
          invalid={toInvalid}
          aria-invalid={toInvalid || undefined}
          aria-describedby={message ? messageId : undefined}
          onChange={(e) => editDraft({ to: e.target.value })}
          onBlur={flush}
          onKeyDown={handleKeyDown}
        />
      </label>
    </>
  );

  return (
    <div className={cn('grid gap-2', className)}>
      {/* One shape or the other is rendered, never both. A `md:hidden` pair
          would mount two copies of the same fields and put `fieldsId` in the
          document twice, and duplicate ids are what make `aria-controls` point
          at the wrong element. */}
      {asMenu ? (
        <Menu
          label={label}
          title={label}
          align="start"
          triggerShape="auto"
          // `justify-between` and `w-full` beat the trigger's own
          // `justify-center`/`shrink-0` on stylesheet order, which is safe;
          // the LABEL colour is set on the child span instead, because
          // `text-text` passed here would lose to the trigger's own
          // `text-text-muted` for exactly the same reason.
          triggerClassName="w-full justify-between rounded-md border border-border-strong px-3"
          trigger={
            <>
              <span className="min-w-0 truncate font-medium text-text">
                {activePreset?.label ?? 'Custom'}
              </span>
              <ChevronDown
                width={16}
                height={16}
                strokeWidth={1.75}
                aria-hidden
                className="shrink-0"
              />
            </>
          }
        >
          {presets.map((p) => (
            <MenuItem
              key={p.id}
              selected={value.preset === p.id}
              onSelect={() => selectPreset(p.id)}
            >
              {p.label}
            </MenuItem>
          ))}
        </Menu>
      ) : (
        <div
          role="group"
          aria-label={label}
          // `w-fit`, not `self-start`: in a grid, `align-self` does nothing to the
          // inline axis, so the chip group's border used to stretch to whatever
          // the widest row below it made the column — which is the summary line,
          // and that grows with the window. `fit-content` shrinks to the chips
          // while still capping at the available width, so it wraps on a phone.
          className="inline-flex w-fit flex-wrap gap-0.5 self-start rounded-md border border-border-strong p-0.5"
        >
          {presets.map((p) => {
            const active = value.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPreset(p.id)}
                aria-pressed={active}
                aria-expanded={p.id === 'custom' ? isCustom : undefined}
                aria-controls={p.id === 'custom' && isCustom ? fieldsId : undefined}
                className={cn(
                  // The 44px floor only applies below md; ≥ md keeps the original
                  // compact chip density, matching Button's SIZES convention.
                  'min-h-11 rounded-[5px] px-3 py-1.5 text-sm md:min-h-0',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  active
                    ? 'bg-brand font-semibold text-text-inverse'
                    : 'font-medium text-text-muted hover:text-text',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      {isCustom ? (
        customInSheet ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="w-fit"
              onClick={() => setDatesOpen(true)}
              leftIcon={
                <CalendarDays width={14} height={14} strokeWidth={1.75} />
              }
            >
              Choose the dates
            </Button>
            <Sheet
              open={datesOpen}
              onClose={() => setDatesOpen(false)}
              title="Custom range"
            >
              {/* One column: the sheet is 360px wide and a `type="date"` field
                  is 44px tall with a native picker behind it — two of them side
                  by side is 160px each, which is narrower than the placeholder
                  text they show before a value is picked. */}
              <div id={fieldsId} className="grid grid-cols-1 gap-3 px-4 pb-3 pt-1">
                {customFields}
              </div>
            </Sheet>
          </>
        ) : (
          // `md:`, not `sm:`. `sm` is 640px — above every phone width in this
          // programme's targets — so the two-column form used to appear on a
          // 640-767px screen that is otherwise still phone-shaped, and never
          // appeared as a mobile improvement at all.
          <div
            id={fieldsId}
            className="grid grid-cols-1 gap-2 md:max-w-md md:grid-cols-2"
          >
            {customFields}
          </div>
        )
      ) : null}

      <p className="flex items-start gap-1.5 text-sm text-text-muted" aria-live="polite">
        <CalendarDays width={14} height={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        <span>
          Showing{' '}
          <span className="font-medium text-text">{formatDateRangeLabel(value)}</span>
          {summarySuffix}
        </span>
      </p>

      {message ? (
        <p
          id={messageId}
          role="status"
          className={cn(
            'flex items-start gap-1.5 text-xs',
            problem ? 'text-danger' : 'text-text-muted',
          )}
        >
          <AlertTriangle width={14} height={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}
