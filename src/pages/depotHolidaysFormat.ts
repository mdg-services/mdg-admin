/**
 * The Depot holidays page's decisions, kept out of the component so they read
 * as plain rules. This app has no test runner, so the less logic a `.tsx`
 * carries, the less of it can go wrong unseen — same reasoning as
 * `pages/alerts/format.ts`.
 *
 * The one rule unique to this page: a `weekly: true` row (a Sunday) is a
 * server-manufactured fact, not an admin decision. It is never sent back on
 * Save, never counts toward "unsaved changes", and can never be removed or
 * toggled.
 */
import type { DepotHolidayInput } from '@/hooks/api/useDepotHolidays';
import type { DepotHolidayMonthRow } from '@dk/shared';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sat, 15 Aug 2026" from the calendar date + its weekday (0=Sun…6=Sat). */
export function formatHolidayDate(date: string, weekday: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  const day = d.getUTCDate();
  const monthName = d.toLocaleDateString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${WEEKDAY_LABELS[weekday] ?? ''}, ${day} ${monthName} ${d.getUTCFullYear()}`;
}

/** "August 2026" for the given year + 1-based month. */
export function monthLabelOf(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/** Two-digit padded date part, e.g. 1 -> "01". */
export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** A Sunday row is a fact, not a decision — nothing on it can be edited. */
export function isRowEditable(row: DepotHolidayMonthRow): boolean {
  return !row.weekly;
}

/** Every enabled, editable row that has no name — Save must block on these. */
export function rowsMissingName(rows: DepotHolidayMonthRow[]): boolean {
  return rows.some((r) => isRowEditable(r) && r.enabled && !r.name.trim());
}

/**
 * The PUT /month payload from the local draft: weekly (Sunday) rows are
 * dropped — the backend rejects a Sunday date outright — and a row with no
 * name is dropped rather than saved blank.
 */
export function buildConfirmHolidays(
  rows: DepotHolidayMonthRow[],
): DepotHolidayInput[] {
  return rows
    .filter((r) => isRowEditable(r) && r.name.trim())
    .map((r) => ({
      date: r.date,
      name: r.name.trim(),
      source: r.source,
      type: r.type,
      enabled: r.enabled,
    }));
}

/**
 * Whether the local draft has drifted from what the server sent. Weekly rows
 * are excluded on both sides — they are identical every time, so comparing
 * them only risks a false "unsaved changes" from array ordering.
 */
export function rowsDirty(
  saved: DepotHolidayMonthRow[],
  draft: DepotHolidayMonthRow[],
): boolean {
  const savedEditable = saved.filter(isRowEditable);
  const draftEditable = draft.filter(isRowEditable);
  if (savedEditable.length !== draftEditable.length) return true;
  return draftEditable.some((r, i) => {
    const was = savedEditable[i];
    return (
      !was ||
      was.date !== r.date ||
      was.name !== r.name ||
      was.enabled !== r.enabled
    );
  });
}
