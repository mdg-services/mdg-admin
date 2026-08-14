/**
 * Friendly schedule picker ⇆ cron.
 *
 * Admins pick a plain time / weekday / date and we turn it into the `customCron`
 * the backend already understands; on edit we turn a stored cron back into those
 * picker values. Only the SIMPLE shapes a picker can represent round-trip here —
 * a fixed minute+hour with the rest either all-wildcard (daily), a single
 * weekday (weekly), a single day-of-month (monthly) or a day+month (yearly).
 * Anything more exotic (`0 9 * * 1,3,5`, ranges, steps) returns `null` from
 * {@link parseCron}, and the UI falls back to showing it read-only.
 *
 * WALL-CLOCK IS IST. The backend interprets `customCron` in Asia/Kolkata (see
 * `utils/cadence.ts`), so "9:00" here means 9:00 am for the dealer — no timezone
 * arithmetic on either side. Keep the two ends in lockstep: if the backend tz
 * ever changes, this contract changes with it.
 */
import type { Cadence } from '@dk/shared';

/** Cadences the friendly picker can express a time for. The rest (ON_DEMAND, or
 *  the attach-only "plugin default") carry no picker and no cron. */
export type TimedCadence = Extract<Cadence, 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>;

export function isTimedCadence(c: Cadence | ''): c is TimedCadence {
  return c === 'DAILY' || c === 'WEEKLY' || c === 'MONTHLY' || c === 'YEARLY';
}

/** The picker's state: a wall-clock time plus the fields each cadence needs. */
export interface ScheduleParts {
  /** 0–23 (IST). */
  hour: number;
  /** 0–59. */
  minute: number;
  /** 0 = Sunday … 6 = Saturday. Used by WEEKLY. */
  weekday: number;
  /** 1–31. Used by MONTHLY and YEARLY. */
  monthday: number;
  /** 1–12. Used by YEARLY. */
  month: number;
}

export const DEFAULT_PARTS: ScheduleParts = {
  hour: 9,
  minute: 0,
  weekday: 1, // Monday
  monthday: 1,
  month: 1, // January
};

export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

export const MONTHS: { value: number; label: string }[] = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

/** `{hour:9, minute:5}` → `"09:05"` for an `<input type="time">`. */
export function partsToTimeValue(p: Pick<ScheduleParts, 'hour' | 'minute'>): string {
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** `"09:05"` → `{hour:9, minute:5}`, or null if not a real HH:MM. */
export function timeValueToParts(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Build the 5-field cron for a cadence + picker state (IST wall-clock).
 * Order is the standard `minute hour day-of-month month day-of-week`.
 */
export function buildCron(cadence: TimedCadence, parts: ScheduleParts): string {
  const { minute, hour, weekday, monthday, month } = parts;
  switch (cadence) {
    case 'DAILY':
      return `${minute} ${hour} * * *`;
    case 'WEEKLY':
      return `${minute} ${hour} * * ${weekday}`;
    case 'MONTHLY':
      return `${minute} ${hour} ${monthday} * *`;
    case 'YEARLY':
      return `${minute} ${hour} ${monthday} ${month} *`;
  }
}

/** A single non-negative integer field, or null (`*`, ranges, lists, steps → null). */
function intField(f: string): number | null {
  return /^\d+$/.test(f) ? Number(f) : null;
}

/**
 * Turn a stored cron back into a cadence + picker state, or null when it is not
 * one of the simple shapes the picker can show. The caller keeps the raw string
 * to display read-only in that case.
 */
export function parseCron(
  cron: string | null | undefined,
): { cadence: TimedCadence; parts: ScheduleParts } | null {
  if (!cron) return null;
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minRaw, hourRaw, domRaw, monRaw, dowRaw] = fields as [string, string, string, string, string];

  const minute = intField(minRaw);
  const hour = intField(hourRaw);
  // The time itself must be a single instant to show in a time input.
  if (minute === null || minute > 59 || hour === null || hour > 23) return null;

  const base: ScheduleParts = { ...DEFAULT_PARTS, hour, minute };
  const domWild = domRaw === '*';
  const monWild = monRaw === '*';
  const dowWild = dowRaw === '*';

  // DAILY: everything below the time is wildcard.
  if (domWild && monWild && dowWild) {
    return { cadence: 'DAILY', parts: base };
  }
  // WEEKLY: a single weekday, no day-of-month / month constraint.
  if (domWild && monWild && !dowWild) {
    const weekday = intField(dowRaw);
    if (weekday === null || weekday > 6) return null;
    return { cadence: 'WEEKLY', parts: { ...base, weekday } };
  }
  // MONTHLY: a single day-of-month, any month, no weekday constraint.
  if (!domWild && monWild && dowWild) {
    const monthday = intField(domRaw);
    if (monthday === null || monthday < 1 || monthday > 31) return null;
    return { cadence: 'MONTHLY', parts: { ...base, monthday } };
  }
  // YEARLY: a single day-of-month in a single month, no weekday constraint.
  if (!domWild && !monWild && dowWild) {
    const monthday = intField(domRaw);
    const month = intField(monRaw);
    if (monthday === null || monthday < 1 || monthday > 31) return null;
    if (month === null || month < 1 || month > 12) return null;
    return { cadence: 'YEARLY', parts: { ...base, monthday, month } };
  }
  return null;
}

/** `9` (24h) → `"9:00 AM"`. */
export function formatTime12h(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${period}`;
}

/** `1` → `"1st"`, `22` → `"22nd"`. */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? 'th');
}

/**
 * One plain sentence for the schedule preview, e.g.
 * "Runs every day at 9:00 AM IST." — so the admin reads when it fires without
 * decoding a cron.
 */
export function describePickerSchedule(cadence: TimedCadence, parts: ScheduleParts): string {
  const at = `${formatTime12h(parts.hour, parts.minute)} IST`;
  switch (cadence) {
    case 'DAILY':
      return `Runs every day at ${at}.`;
    case 'WEEKLY': {
      const day = WEEKDAYS.find((w) => w.value === parts.weekday)?.label ?? 'Monday';
      return `Runs every ${day} at ${at}.`;
    }
    case 'MONTHLY':
      return `Runs on the ${ordinal(parts.monthday)} of every month at ${at}.`;
    case 'YEARLY': {
      const mon = MONTHS.find((m) => m.value === parts.month)?.label ?? 'January';
      return `Runs every year on ${mon} ${ordinal(parts.monthday)} at ${at}.`;
    }
  }
}
