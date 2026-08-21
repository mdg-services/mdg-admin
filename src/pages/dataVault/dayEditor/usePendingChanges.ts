import * as React from 'react';

import type { IrasPendingChanges } from '@/hooks/api/useIrasEdits';
import type { IrasReportCode, IrasRow } from '@dk/shared';

/**
 * The uncommitted change set — everything the operator has typed but not applied.
 *
 * Held in one immutable object rather than several pieces of state so that undo is
 * a stack of snapshots (cheap, and correct across every kind of change including
 * added and excluded rows) and so "how many changes are pending" has exactly one
 * answer. The sticky footer's count is treated as the single source of truth for
 * whether there is unapplied work, so it must not be derivable two ways.
 */

/** `${code}|${rowKey}|${field}` — the identity of one cell. */
export type CellId = string;

export function cellId(code: IrasReportCode, rowKey: string, field: string): CellId {
  return `${code}|${rowKey}|${field}`;
}

export interface PendingCell {
  code: IrasReportCode;
  rowKey: string;
  field: string;
  /** The new value, or null to hand the cell back to the portal's figure. */
  value: string | null;
}

export interface PendingAddedRow {
  /** Client-side id; the server mints the real row key on commit. */
  localId: string;
  code: IrasReportCode;
  row: IrasRow;
}

export interface RowTarget {
  code: IrasReportCode;
  rowKey: string;
}

export interface PendingState {
  cells: Record<CellId, PendingCell>;
  addedRows: PendingAddedRow[];
  exclude: RowTarget[];
  restore: RowTarget[];
  deleteAdded: RowTarget[];
  revertRows: RowTarget[];
  revertDay: boolean;
}

export const EMPTY_PENDING: PendingState = {
  cells: {},
  addedRows: [],
  exclude: [],
  restore: [],
  deleteAdded: [],
  revertRows: [],
  revertDay: false,
};

/** How many distinct changes are waiting — what the footer counts. */
export function pendingCount(s: PendingState): number {
  if (s.revertDay) return 1;
  return (
    Object.keys(s.cells).length +
    s.addedRows.length +
    s.exclude.length +
    s.restore.length +
    s.deleteAdded.length +
    s.revertRows.length
  );
}

export function hasPending(s: PendingState): boolean {
  return pendingCount(s) > 0;
}

/** The commit body, minus the revision token and the reason. */
export function toChanges(s: PendingState): IrasPendingChanges {
  if (s.revertDay) return { revertDay: true };
  return {
    edits: Object.values(s.cells).map((c) => ({
      code: c.code,
      rowKey: c.rowKey,
      field: c.field,
      value: c.value,
    })),
    addedRows: s.addedRows.map((a) => ({ code: a.code, row: a.row })),
    excludeRowKeys: s.exclude,
    restoreRowKeys: s.restore,
    deleteAddedRowKeys: s.deleteAdded,
    revertRowKeys: s.revertRows,
  };
}

function sameTarget(a: RowTarget, b: RowTarget): boolean {
  return a.code === b.code && a.rowKey === b.rowKey;
}

function without(list: RowTarget[], t: RowTarget): RowTarget[] {
  return list.filter((x) => !sameTarget(x, t));
}

function toggled(list: RowTarget[], t: RowTarget): RowTarget[] {
  return list.some((x) => sameTarget(x, t)) ? without(list, t) : [...list, t];
}

const UNDO_DEPTH = 50;

export interface PendingApi {
  state: PendingState;
  count: number;
  /** Set a cell, or pass null to revert it to the portal's figure. */
  setCell: (code: IrasReportCode, rowKey: string, field: string, value: string | null) => void;
  /** Drop a pending edit on one cell, leaving whatever was committed in place. */
  clearCell: (code: IrasReportCode, rowKey: string, field: string) => void;
  pendingCell: (code: IrasReportCode, rowKey: string, field: string) => PendingCell | undefined;
  addRow: (code: IrasReportCode, row: IrasRow) => void;
  editAddedRow: (localId: string, field: string, value: string) => void;
  dropAddedRow: (localId: string) => void;
  toggleExclude: (t: RowTarget) => void;
  toggleRestore: (t: RowTarget) => void;
  deleteCommittedAddedRow: (t: RowTarget) => void;
  revertRow: (t: RowTarget) => void;
  setRevertDay: (on: boolean) => void;
  isExcludePending: (t: RowTarget) => boolean;
  isRestorePending: (t: RowTarget) => boolean;
  isRowRevertPending: (t: RowTarget) => boolean;
  discardAll: () => void;
  undo: () => void;
  canUndo: boolean;
}

/**
 * `usePendingChanges` — the editor's uncommitted state, with undo.
 *
 * Undo matters more here than in most forms: the operator is retyping figures
 * that decide whether a dealer's sales get suspended, and the commonest mistake
 * is typing into the cell below the one they meant. One keystroke to put it back
 * is the difference between a correction and a second correction.
 */
export function usePendingChanges(resetKey: string): PendingApi {
  /**
   * A never-reused id for each hand-added row.
   *
   * It used to be the array's own length, which is not an identity: add A, add
   * B, remove A, add C — and C is handed B's id. Both `editAddedRow` and
   * `dropAddedRow` match on it, so one keystroke would edit two rows and one
   * Remove would delete two, and React would see duplicate keys. A monotonic
   * counter (rather than a random uuid) keeps the ids stable and readable.
   */
  const nextLocalId = React.useRef(0);
  const [state, setState] = React.useState<PendingState>(EMPTY_PENDING);
  const [history, setHistory] = React.useState<PendingState[]>([]);

  // A different dealer-day is a different change set. Keyed reset rather than a
  // remount so the grid's scroll position and column toggle survive a refetch.
  React.useEffect(() => {
    setState(EMPTY_PENDING);
    setHistory([]);
  }, [resetKey]);

  const commit = React.useCallback((next: (prev: PendingState) => PendingState) => {
    setState((prev) => {
      setHistory((h) => [...h.slice(-(UNDO_DEPTH - 1)), prev]);
      return next(prev);
    });
  }, []);

  const api = React.useMemo<PendingApi>(
    () => ({
      state,
      count: pendingCount(state),

      setCell: (code, rowKey, field, value) =>
        commit((prev) => ({
          ...prev,
          cells: {
            ...prev.cells,
            [cellId(code, rowKey, field)]: { code, rowKey, field, value },
          },
        })),

      clearCell: (code, rowKey, field) =>
        commit((prev) => {
          const next = { ...prev.cells };
          delete next[cellId(code, rowKey, field)];
          return { ...prev, cells: next };
        }),

      pendingCell: (code, rowKey, field) => state.cells[cellId(code, rowKey, field)],

      addRow: (code, row) =>
        commit((prev) => ({
          ...prev,
          addedRows: [
            ...prev.addedRows,
            // Index-based rather than random: this id only has to be unique
            // within the pending set, and a stable one keeps React keys steady.
            { localId: `local-${nextLocalId.current++}`, code, row },
          ],
        })),

      editAddedRow: (localId, field, value) =>
        commit((prev) => ({
          ...prev,
          addedRows: prev.addedRows.map((a) =>
            a.localId === localId ? { ...a, row: { ...a.row, [field]: value } } : a,
          ),
        })),

      dropAddedRow: (localId) =>
        commit((prev) => ({
          ...prev,
          addedRows: prev.addedRows.filter((a) => a.localId !== localId),
        })),

      toggleExclude: (t) => commit((prev) => ({ ...prev, exclude: toggled(prev.exclude, t) })),
      toggleRestore: (t) => commit((prev) => ({ ...prev, restore: toggled(prev.restore, t) })),

      deleteCommittedAddedRow: (t) =>
        commit((prev) => ({ ...prev, deleteAdded: toggled(prev.deleteAdded, t) })),

      revertRow: (t) =>
        commit((prev) => ({
          ...prev,
          revertRows: toggled(prev.revertRows, t),
          // A row-wide revert supersedes any pending cell edits on that row —
          // sending both would make the write order decide the result.
          cells: Object.fromEntries(
            Object.entries(prev.cells).filter(
              ([, c]) => !(c.code === t.code && c.rowKey === t.rowKey),
            ),
          ),
        })),

      // Reverting the whole day supersedes every other pending change, so it
      // replaces the set rather than joining it.
      setRevertDay: (on) =>
        commit(() => (on ? { ...EMPTY_PENDING, revertDay: true } : EMPTY_PENDING)),

      isExcludePending: (t) => state.exclude.some((x) => sameTarget(x, t)),
      isRestorePending: (t) => state.restore.some((x) => sameTarget(x, t)),
      isRowRevertPending: (t) => state.revertRows.some((x) => sameTarget(x, t)),

      discardAll: () =>
        commit(() => EMPTY_PENDING),

      undo: () =>
        setHistory((h) => {
          if (h.length === 0) return h;
          setState(h[h.length - 1]!);
          return h.slice(0, -1);
        }),
      canUndo: history.length > 0,
    }),
    [state, history, commit],
  );

  return api;
}

/**
 * Warn before the browser discards unapplied work.
 *
 * A tab close or a reload is the one navigation React Router cannot intercept,
 * and it is the one that loses the most: a half-finished day of corrections with
 * no trace anywhere. The in-app equivalent is the sticky footer, which is always
 * on screen while anything is pending.
 */
export function useUnloadGuard(active: boolean): void {
  React.useEffect(() => {
    if (!active) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Browsers ignore custom text now, but returning a value is still what
      // triggers the prompt.
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}
