export function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
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
  return d.toLocaleDateString(undefined, {
    ...(opts?.weekday ? { weekday: 'short' as const } : {}),
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
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
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
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
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
  const body = Math.abs(n).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });
  const sign = n < 0 ? '-' : opts?.sign && n > 0 ? '+' : '';
  return `${sign}${body} L`;
}

export function groupByDay<T extends { startedAt: string }>(
  items: T[],
): Array<{ day: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const d = new Date(item.startedAt);
    const key = d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      weekday: 'short',
    });
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.entries()).map(([day, items]) => ({ day, items }));
}
