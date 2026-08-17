import type { IrasDayEditorView, IrasReportCode } from '@dk/shared';
import { irasFieldPolicy, irasRowKeys, irasRowLabel } from '@dk/shared';

import type { PendingState } from './usePendingChanges';

/** One pending change, in the words the review dialog shows. */
export interface PendingDescription {
  code: IrasReportCode;
  rowLabel: string;
  /** The portal's own column header, or a row-level verb. */
  what: string;
  from: string;
  to: string;
  /** Whether this change can move a figure on the report. */
  usedByReport: boolean;
  /** Set when the change re-attributes a row to a different tank, nozzle or product. */
  identityWarning?: string;
}

/**
 * Turn the pending set into sentences.
 *
 * Deliberately built from the same day payload the grid renders, so "what am I
 * about to apply?" cannot describe anything other than what is on screen. The
 * `usedByReport` flag on each line is what lets the dialog say "none of these
 * changes affect any report" — the failure the whole field policy exists to
 * prevent is an operator believing they fixed a figure they did not.
 */
export function describePending(
  day: IrasDayEditorView,
  state: PendingState,
): PendingDescription[] {
  if (state.revertDay) {
    return [
      {
        code: 'TOT',
        rowLabel: 'Every row',
        what: 'all corrections on this day',
        from: `${day.corrections.length} correction${day.corrections.length === 1 ? '' : 's'}`,
        to: 'back to what the portal said',
        usedByReport: true,
      },
    ];
  }

  const out: PendingDescription[] = [];

  /** Row label + the portal's current value for a cell, per report. */
  const resolve = (code: IrasReportCode, rowKey: string, field: string) => {
    const dataset = day.snapshot?.datasets[code];
    const rows = dataset?.rows ?? [];
    const { keys } = irasRowKeys(code, rows);
    const index = keys.indexOf(rowKey);
    if (index >= 0) {
      const row = rows[index]!;
      return { label: irasRowLabel(code, row), portalValue: row[field] ?? '' };
    }
    // A row that only exists as a correction (added by hand on an earlier commit).
    const added = day.corrections.find(
      (c) => c.code === code && c.rowKey === rowKey && c.kind === 'ADDED_ROW',
    );
    return {
      label: added?.rowLabel ?? rowKey,
      portalValue: added?.row?.[field] ?? '',
    };
  };

  const header = (code: IrasReportCode, field: string) =>
    day.snapshot?.datasets[code]?.columns.find((c) => c.field === field)?.headerName ?? field;

  for (const cell of Object.values(state.cells)) {
    const { label, portalValue } = resolve(cell.code, cell.rowKey, cell.field);
    const policy = irasFieldPolicy(cell.code, cell.field);
    const committed = day.corrections.find(
      (c) =>
        c.code === cell.code &&
        c.rowKey === cell.rowKey &&
        c.field === cell.field &&
        c.kind === 'FIELD',
    );
    const from = committed?.value ?? portalValue;
    out.push({
      code: cell.code,
      rowLabel: label,
      what: header(cell.code, cell.field),
      from: from === '' ? '—' : from,
      to: cell.value === null ? (portalValue === '' ? '—' : portalValue) : cell.value,
      usedByReport: policy.usedByReport,
      identityWarning:
        cell.value !== null && cell.value !== portalValue ? policy.identityWarning : undefined,
    });
  }

  for (const added of state.addedRows) {
    out.push({
      code: added.code,
      rowLabel: irasRowLabel(added.code, added.row),
      what: 'a row added by hand',
      from: 'the portal has no such row',
      to: Object.entries(added.row)
        .filter(([, v]) => String(v).trim() !== '')
        .map(([k, v]) => `${header(added.code, k)} ${v}`)
        .join(', '),
      usedByReport: true,
    });
  }

  for (const t of state.exclude) {
    const { label } = resolve(t.code, t.rowKey, '');
    out.push({
      code: t.code,
      rowLabel: label,
      what: 'left out of the report',
      from: 'counted',
      to: 'not counted',
      usedByReport: true,
    });
  }

  for (const t of state.restore) {
    const { label } = resolve(t.code, t.rowKey, '');
    out.push({
      code: t.code,
      rowLabel: label,
      what: 'put back in the report',
      from: 'not counted',
      to: 'counted',
      usedByReport: true,
    });
  }

  for (const t of state.deleteAdded) {
    const { label } = resolve(t.code, t.rowKey, '');
    out.push({
      code: t.code,
      rowLabel: label,
      what: 'a hand-added row deleted',
      from: 'counted',
      to: 'gone',
      usedByReport: true,
    });
  }

  for (const t of state.revertRows) {
    const { label } = resolve(t.code, t.rowKey, '');
    const n = day.corrections.filter((c) => c.code === t.code && c.rowKey === t.rowKey).length;
    out.push({
      code: t.code,
      rowLabel: label,
      what: 'every correction on this row undone',
      from: `${n} correction${n === 1 ? '' : 's'}`,
      to: 'back to what the portal said',
      usedByReport: true,
    });
  }

  return out;
}

/**
 * Which of this dealer's reports the pending changes invalidate, and which of
 * those the dealer already has a version of.
 *
 * Computed locally so the footer can update as the operator types, and computed
 * with the SAME rule the server applies — every report from this business date
 * forward, because the stock-vs-sales variation is cumulative since the last
 * inspection. If these two rules ever diverged, the number shown before the
 * commit would not be the number that came back from it.
 */
export function reportsAffected(
  day: IrasDayEditorView,
): { dates: string[]; sharedDates: string[] } {
  const dates = day.dsr.reportDates.filter((d) => d >= day.businessDate);
  return {
    dates,
    sharedDates: dates.filter((d) => day.dsr.sharedDates.includes(d)),
  };
}
