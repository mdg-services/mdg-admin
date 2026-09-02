/**
 * One formatter per shape, built once when this module loads.
 *
 * The trap: `date.toLocaleString(undefined, opts)` and
 * `number.toLocaleString('en-IN', opts)` read as free, and are not. V8 keeps a
 * cached formatter only for the *no-options* path — hand it an options bag and
 * it renegotiates the locale, re-resolves the pattern and allocates a fresh ICU
 * formatter on every call. Measured (node, M-series): 24.85 µs per call against
 * 0.63 µs through a hoisted `Intl.DateTimeFormat` — 39× — and 12.33 µs against
 * 0.30 µs for numbers, 41×. A mid-range Android is several times slower again.
 * These run once per row per render, and the award history draws up to 1,000
 * rows as a table *and* as a card stack: 2,000 calls, which is 49.7 ms here
 * against 1.3 ms, and a third of a second of blocked main thread on the phones
 * this is actually used on.
 *
 * What this gives up: the locale is resolved once, at import, rather than per
 * call. Every formatter below either pins `en-IN` or takes the browser's own
 * locale, and that cannot change without a reload, so the output is identical.
 */
const DATE_TIME_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});

/**
 * A calendar day printed in UTC — shared by `formatYmd` and `formatDmy`, which
 * take different input shapes but deliberately print the same one: the app
 * shows a business date one way only, and two formatters could drift apart.
 */
const UTC_DAY_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  timeZone: 'UTC',
});

/** `formatYmd({ weekday: true })` — the same day with its weekday in front. */
const UTC_DAY_WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  timeZone: 'UTC',
});

/** `groupByDay`'s bucket key: a local day, weekday included. */
const DAY_KEY_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  weekday: 'short',
});

const INR_FMT = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const LITRES_FMT = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_TIME_FMT.format(d);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_FMT.format(d);
}

/**
 * A `Date` as a local `YYYY-MM-DD` calendar day.
 *
 * The one conversion — date pickers, `?date=` links and the staff-points window
 * all speak this format, and `toISOString().slice(0, 10)` is the trap they used
 * to fall into: that reads the date back in UTC, so anyone east of Greenwich
 * gets yesterday for most of the evening.
 */
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Today's calendar date in IST (UTC+5:30) as `YYYY-MM-DD`, matching the backend's
 * `istDateKey` regardless of the browser's own timezone. Use this — not
 * `toYmd(new Date())` — for date ceilings the server also enforces in IST (the
 * DSR / IRAS "not in the future" guards), so a browser east or west of IST can't
 * offer, or reject, a day the backend disagrees about.
 */
export function istTodayYmd(): string {
  // Shift the current instant into IST, then read its UTC Y-M-D.
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A real calendar day in `YYYY-MM-DD` form — `2026-02-31` is rejected, which a
 * bare regex would wave through. Accepts null/undefined so it can guard a value
 * straight out of a query string or an input event.
 *
 * This answers one question only — does this day exist — not "is it a day this
 * product cares about". A floor (nothing before 2000) belongs to the caller.
 */
export function isYmd(v?: string | null): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const y = Number(v.slice(0, 4));
  const m = Number(v.slice(5, 7));
  const d = Number(v.slice(8, 10));
  if (m < 1 || m > 12 || d < 1) return false;
  // Counted out by hand rather than round-tripped through `Date`: `Date.UTC(y, …)`
  // still honours the two-digit-year legacy and maps 0-99 to 1900-1999, so the
  // round-trip could never agree with itself for a year below 100 — which is
  // exactly the shape a date input emits while a year is being typed
  // (`0002-07-12`), and those were being rejected as "not a real day" instead of
  // as "too far in the past".
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const short = m === 4 || m === 6 || m === 9 || m === 11; // Apr, Jun, Sep, Nov
  const lastDay = m === 2 ? (leap ? 29 : 28) : short ? 30 : 31;
  return d <= lastDay;
}

/**
 * Step a `YYYY-MM-DD` by whole days, staying on the calendar and never below
 * `floor`.
 *
 * THE FLOOR IS PART OF THE ARITHMETIC, NOT A POLICY THE CALLER APPLIES
 * AFTERWARDS. `new Date(y, …)` honours the two-digit-year legacy and reads year
 * 2 as 1902, so stepping a half-typed `0002-07-12` back a day returned
 * `1902-07-11` — an arrow that teleported a date-scoped screen 1900 years with
 * nothing on it to say so. Starting from `floor` whenever the input is not a day
 * this product could hold keeps the helper correct on its own rather than merely
 * fenced off from the problem by whoever calls it.
 *
 * `floor` is a parameter and not a constant because the one this app uses,
 * `MIN_SELECTABLE_YMD`, lives in `components/ui/DateRangeFilter` and `lib` must
 * not reach up into `components`.
 *
 * `IrasShiftDataPane` carries a private twin of this (`shiftIso`) that predates
 * it; fold that one into this when the pane is next touched, so a date step
 * cannot come to mean two different things in one Vault.
 */
export function shiftYmd(ymd: string, days: number, floor: string): string {
  const from = isYmd(ymd) && ymd >= floor ? ymd : floor;
  const y = Number(from.slice(0, 4));
  const m = Number(from.slice(5, 7));
  const d = Number(from.slice(8, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const next = toYmd(dt);
  return next < floor ? floor : next;
}

/**
 * A `YYYY-MM-DD` calendar day for a human — `2026-07-23` → `23 Jul 2026`, or
 * `Thu, 23 Jul 2026` with `{ weekday: true }`.
 *
 * Built and read back in UTC so the day is never dragged across a timezone: a
 * business date is a label, not an instant, and `new Date('2026-07-23')` parsed
 * as UTC midnight prints as the 22nd anywhere west of Greenwich.
 */
export function formatYmd(ymd?: string | null, opts?: { weekday?: boolean }): string {
  if (!ymd) return '-';
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return (opts?.weekday ? UTC_DAY_WEEKDAY_FMT : UTC_DAY_FMT).format(d);
}

/**
 * Format a `dd-mm-yyyy` date — the format the SDMS portal and every Credit & DOD
 * figure use. `formatDate` can't: `new Date('16-07-2026')` is Invalid Date, so it
 * silently falls through and prints the raw string while the rest of the UI shows
 * "Jul 16, 2026".
 */
export function formatDmy(dmy?: string | null): string {
  if (!dmy) return '-';
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy.trim());
  if (!m) return dmy;
  // Build in UTC and read back in UTC so a negative local offset can't shift the
  // calendar date by a day.
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  if (Number.isNaN(d.getTime())) return dmy;
  return UTC_DAY_FMT.format(d);
}

export function formatRelativeFuture(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return 'now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}

export function formatDuration(ms?: number | null): string {
  if (ms === undefined || ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

/** Rupees with Indian digit grouping, e.g. 1234567.5 → "₹12,34,567.50". */
export function inrFormat(n?: number | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '-';
  return `₹${INR_FMT.format(n)}`;
}

/**
 * Rupees to the whole, e.g. `-412034.7` → `"-₹4,12,035"`.
 *
 * Separate from {@link inrFormat} because paise on a lakh-scale figure is noise
 * an admin has to read past, and because the sign belongs OUTSIDE the symbol:
 * `Intl` renders a negative as `-₹4,12,035` in some locales and `₹-4,12,035` in
 * others, and a column of figures that disagrees with itself about where the
 * minus goes is hard to scan.
 *
 * ASCII `-` rather than a typographic minus, deliberately: {@link formatLitres}
 * uses ASCII, and these two sit in the same table row. A row reading `−₹4,120`
 * beside `-1,240 L` looks like two different kinds of negative.
 */
export function formatInrWhole(n?: number | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '-';
  return `${n < 0 ? '-' : ''}₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
}

/**
 * Litres with Indian digit grouping, e.g. `1234.5` → `"1,234.5 L"`. Pass
 * `{ sign: true }` to prefix a `+` on positive values — used where the sign is
 * the point (a stock variation that is short vs over).
 */
export function formatLitres(
  n?: number | null,
  opts?: { sign?: boolean },
): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '-';
  const body = LITRES_FMT.format(Math.abs(n));
  const sign = n < 0 ? '-' : opts?.sign && n > 0 ? '+' : '';
  return `${sign}${body} L`;
}

export function groupByDay<T extends { startedAt: string }>(
  items: T[],
): Array<{ day: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const d = new Date(item.startedAt);
    const key = DAY_KEY_FMT.format(d);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.entries()).map(([day, items]) => ({ day, items }));
}
