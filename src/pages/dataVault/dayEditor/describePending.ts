import type { IrasDayEditorView, IrasReportCode } from '@dk/shared';
import {
  irasFieldLabel,
  irasFieldPolicy,
  irasRowKeys,
  irasRowLabel,
  recRowDayVerdict,
} from '@dk/shared';

import type { PendingState } from './usePendingChanges';

/** One pending change, in the words the review dialog shows. */
export interface PendingDescription {
  code: IrasReportCode;
  rowLabel: string;
  /**
   * What the box is called, or a row-level verb. The portal's own column header
   * where the day has one, and otherwise the plain name `@dk/shared` gives it —
   * never the database column.
   */
  what: string;
  from: string;
  to: string;
  /** Whether this change can move a figure on the report. */
  usedByReport: boolean;
  /** Moves no figure, but changes the notes printed under the report. */
  affectsReportNotes?: boolean;
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
  const handTyped = typedByHand(day);

  if (state.revertDay) {
    const n = day.corrections.length;
    return [
      {
        code: 'TOT',
        rowLabel: 'Every row',
        what: handTyped ? 'everything typed for this day' : 'all corrections on this day',
        from: handTyped
          ? `${n} saved entr${n === 1 ? 'y' : 'ies'}`
          : `${n} correction${n === 1 ? '' : 's'}`,
        // A hand day has no portal figures to fall back to: undoing everything
        // leaves the day empty, and saying it goes "back to what the portal
        // said" would promise an outlet with no portal account that its morning
        // is still somewhere.
        to: handTyped ? 'nothing saved for this day' : 'back to what the portal said',
        usedByReport: true,
      },
    ];
  }

  const out: PendingDescription[] = [];

  /**
   * Row label + what a cell held before this change set touched it, per report.
   *
   * The portal's own figure on a portal row, and the stored figure on a row
   * added by hand — which is the only kind a day typed by hand has, because
   * `createManualSnapshotDay` writes `datasets: []` and there is nothing else to
   * look in.
   */
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

  // Hoisted: the row keys are derived from the whole dataset, so recomputing
  // them per cell would be quadratic on a day with many corrections.
  const recRows = day.snapshot?.datasets.REC?.rows ?? [];
  const recWindow = day.snapshot?.datasets.REC?.window;
  const recKeys = irasRowKeys('REC', recRows).keys;
  const recRowByKey = (rowKey: string) => recRows[recKeys.indexOf(rowKey)];

  /*
   * What to call one box where a person has to read it.
   *
   * The portal's own header stays the authority wherever there is one, so the
   * eight collected dealers' dialog reads exactly as it always has. A day typed
   * by hand has no headers to ask — `createManualSnapshotDay` writes
   * `datasets: []` — and the fallback was the raw column, so the one surface
   * built for somebody who is not technical printed
   * "TOT · Nozzle 4 · TOT_READING · 452592 → 452692" back at them. The plain
   * name now comes from `@dk/shared`, which is also where the shift sheet reads
   * its box labels, so the two screens cannot disagree about what a box is
   * called.
   */
  const header = (code: IrasReportCode, field: string) =>
    day.snapshot?.datasets[code]?.columns.find((c) => c.field === field)?.headerName ??
    irasFieldLabel(code, field);

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
    // A delivery decanted on another day is read by THAT day's report, not this
    // one — so a correction to it changes nothing here, whatever the column's
    // policy says. Claiming otherwise is the same fault in miniature: a screen
    // telling someone a figure matters while the calculation skips it.
    const readsThisDay =
      cell.code !== 'REC' || recRowDayVerdict(recRowByKey(cell.rowKey) ?? {}, recWindow) !== 'OTHER_DAY';
    out.push({
      code: cell.code,
      rowLabel: label,
      what: header(cell.code, cell.field),
      from: from === '' ? '—' : from,
      to: cell.value === null ? (portalValue === '' ? '—' : portalValue) : cell.value,
      usedByReport: policy.usedByReport && readsThisDay,
      affectsReportNotes: policy.affectsReportNotes,
      identityWarning:
        cell.value !== null && cell.value !== portalValue ? policy.identityWarning : undefined,
    });
  }

  for (const added of state.addedRows) {
    out.push({
      code: added.code,
      rowLabel: irasRowLabel(added.code, added.row),
      what: 'a row added by hand',
      // On a portal day this sentence is the point: the row is being put in
      // beside the portal's own, and the operator has to know the portal is not
      // already sending it. On a day typed by hand it is a statement about a
      // portal this outlet does not have an account on — every row of the
      // morning is added by hand, and the only question that means anything is
      // whether this one is saved yet.
      from: handTyped ? 'not on record yet' : 'the portal has no such row',
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
      // Undoing a row's corrections puts each cell back to what the row held
      // before anybody touched it — the portal's figure on a portal row, and on
      // a hand day the figure that was first saved for it, because there is no
      // portal figure underneath.
      to: handTyped ? 'back to the figures first saved' : 'back to what the portal said',
      usedByReport: true,
    });
  }

  return out;
}

/**
 * Whether this day's figures were typed in rather than collected.
 *
 * Asked of the DAY, not of the dealer. `portalCollection` answers whether the
 * pipeline may run for this outlet at all, which is a different question and the
 * wrong one here: what these sentences claim is that there are portal rows
 * underneath the operator's changes, and that is true of a collected day even at
 * a dealer whose collection is now paused, and false of a day nobody collected
 * at a dealer whose collection is running.
 *
 * A snapshot written before hand entry existed carries no `source` at all, and
 * every one of those was collected — as `IrasDataSnapshot.source` documents — so
 * a missing value reads as the portal's, and the eight collected dealers keep
 * the wording they have always had.
 */
function typedByHand(day: IrasDayEditorView): boolean {
  return day.snapshot === null || day.snapshot.source === 'MANUAL';
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
