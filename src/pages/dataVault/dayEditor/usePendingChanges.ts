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

/**
 * Which row one cell of a multi-cell write lands on.
 *
 * A row this change set is adding has no server identity yet, so it can only be
 * named by the `localId` this hook minted for it; a row the server holds is
 * named by the pair every correction uses. One union rather than two methods,
 * so a caller writing a mixed day still makes exactly one call and gets exactly
 * one undo frame.
 */
export type PendingCellTarget = { localId: string } | RowTarget;

export interface PendingState {
  cells: Record<CellId, PendingCell>;
  addedRows: PendingAddedRow[];
  exclude: RowTarget[];
  restore: RowTarget[];
  deleteAdded: RowTarget[];
  revertRows: RowTarget[];
  revertDay: boolean;
  /**
   * A screen's own notes about this change set, which the server never sees.
   *
   * It exists for exactly one thing today: the shift sheet has to remember which
   * figures IT put in the row (the water dip it carried forward from yesterday)
   * and which ones a person typed, so the field can say which it is. That answer
   * cannot live in the sheet's own `useState`, because `undo` restores a whole
   * `PendingState` snapshot — a map held outside this object would survive the
   * undo unchanged, and a carried water dip the operator had just undone would
   * come back reading as one a person had confirmed.
   *
   * Deliberately opaque and deliberately inert: `toChanges` builds the commit
   * body field by field and never spreads this object, and `pendingCount` counts
   * the six change lists and not this one. So nothing here can reach the wire,
   * and nothing here can make the footer claim there is unsaved work when there
   * is none.
   */
  meta: Record<string, unknown>;
}

export const EMPTY_PENDING: PendingState = {
  cells: {},
  addedRows: [],
  exclude: [],
  restore: [],
  deleteAdded: [],
  revertRows: [],
  revertDay: false,
  meta: {},
};

/**
 * How many distinct changes are waiting — what the footer counts.
 *
 * `meta` is not one of them, on purpose: it is a screen's private note about the
 * change set, so counting it would make the unload guard and the sticky bar both
 * claim there is unsaved work on a day where nothing has been typed.
 */
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

/**
 * The commit body, minus the revision token and the reason.
 *
 * Written out field by field rather than spread from the state, which is what
 * keeps `meta` off the wire: a screen may put anything it likes in there and
 * this function still sends only the six lists the API accepts.
 */
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

/** `meta` merged shallowly, so one screen's key cannot clobber another's. */
function withMeta(
  prev: PendingState,
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return meta ? { ...prev.meta, ...meta } : prev.meta;
}

/** Extras every value-setting call accepts. */
export interface PendingEditOptions {
  /**
   * Merge into {@link PendingState.meta} as part of the SAME undoable step.
   *
   * One step, not two, because the note and the value it describes have to move
   * together: the shift sheet marks a carried water dip as no longer carried in
   * the same breath as the keystroke that changed it, and a separate write would
   * mean one press of Undo put the value back while leaving it labelled as the
   * operator's own.
   */
  meta?: Record<string, unknown>;
  /**
   * Fold this edit into the previous one when it targets the same cell, so undo
   * means "put that nozzle's reading back" rather than "remove one digit".
   *
   * On by default for {@link PendingApi.editAddedRow}, which is called on every
   * keystroke: without it 50 characters of typing evicts every structural change
   * underneath it from a 50-deep stack. Off by default for
   * {@link PendingApi.setCell}, which the full grid calls once per finished edit
   * — folding there would quietly merge two deliberate corrections to one cell
   * into a single undo step.
   */
  coalesce?: boolean;
}

export interface PendingApi {
  state: PendingState;
  count: number;
  /** Set a cell, or pass null to revert it to the portal's figure. */
  setCell: (
    code: IrasReportCode,
    rowKey: string,
    field: string,
    value: string | null,
    options?: PendingEditOptions,
  ) => void;
  /** Drop a pending edit on one cell, leaving whatever was committed in place. */
  clearCell: (code: IrasReportCode, rowKey: string, field: string) => void;
  pendingCell: (code: IrasReportCode, rowKey: string, field: string) => PendingCell | undefined;
  addRow: (code: IrasReportCode, row: IrasRow) => void;
  /**
   * Lay several rows down in ONE undoable step, and optionally stamp `meta` and
   * clear whatever was pending first.
   *
   * The shift sheet builds a whole morning's eight rows the moment the day
   * opens. Added one at a time they would be eight undo entries, so a single
   * Cmd+Z would take away one nozzle of six and leave a day that cannot be
   * saved; `replace` is what lets "Discard all" put the day back to the shape it
   * opened in rather than emptying the screen with no way back.
   */
  addRows: (
    rows: ReadonlyArray<{ code: IrasReportCode; row: IrasRow }>,
    options?: { meta?: Record<string, unknown>; replace?: boolean },
  ) => void;
  editAddedRow: (
    localId: string,
    field: string,
    value: string,
    options?: PendingEditOptions,
  ) => void;
  /**
   * Write several cells across several rows in ONE undoable step.
   *
   * `meta` is merged ONE KEY DEEP, and the shift sheet's carried map and read
   * map are each a single key holding a whole `planKey → fields` map. N
   * sequential calls each computing their map from the same render snapshot
   * would leave only the LAST one's map standing — five boxes holding the slip's
   * figures while still painted dashed, still uncounted by the day's readout,
   * and still blocking the save. Compute both maps once, write once.
   *
   * It is also one history frame on purpose: Undo takes a whole slip back in one
   * press rather than one nozzle at a time off a fifty-deep stack, where six
   * readings would evict the structural changes underneath them.
   *
   * Two kinds of target, because a hand-typed day has two kinds of row. A row
   * this change set is adding is addressed by its `localId` and is edited in
   * place, exactly as {@link PendingApi.editAddedRow} does it. A row the server
   * is already holding — a day saved at 07:00 and reopened at 09:00 — is
   * addressed by `code` + `rowKey` and becomes an ordinary pending cell, exactly
   * as {@link PendingApi.setCell} would. Without the second kind, filling a
   * re-opened morning from a slip would silently drop every figure whose row was
   * already saved, having just told the operator it was filling them in.
   */
  setCells: (
    edits: ReadonlyArray<PendingCellTarget & { field: string; value: string }>,
    options?: { meta?: Record<string, unknown> },
  ) => void;
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
  /**
   * Which cell the last change touched, when that change asked to be folded.
   *
   * Anything else — a row added, a row removed, an undo, a different cell —
   * leaves this `undefined`, which is what closes the run: the next keystroke
   * then starts a fresh undo entry.
   */
  const foldingInto = React.useRef<string | undefined>(undefined);

  /**
   * A different dealer-day is a different change set. Keyed reset rather than a
   * remount so the grid's scroll position and column toggle survive a refetch.
   *
   * Done DURING the render rather than in an effect, which is the supported
   * pattern for adjusting state when a prop changes and matters here: effects
   * run children first, so a child that lays a day's rows out on mount would
   * have laid them into the OUTGOING day's set and then had them wiped by this
   * reset a moment later. Setting during render makes React discard this render
   * and start again with the empty set before any child sees it.
   */
  const lastKey = React.useRef(resetKey);
  if (lastKey.current !== resetKey) {
    lastKey.current = resetKey;
    foldingInto.current = undefined;
    setState(EMPTY_PENDING);
    setHistory([]);
  }

  const commit = React.useCallback(
    (next: (prev: PendingState) => PendingState, foldKey?: string) => {
      // Decided out here rather than inside the updater: the updater has to stay
      // a pure function of `prev`, and React runs it twice in development.
      const folding = foldKey !== undefined && foldKey === foldingInto.current;
      foldingInto.current = foldKey;
      setState((prev) => {
        if (!folding) setHistory((h) => [...h.slice(-(UNDO_DEPTH - 1)), prev]);
        return next(prev);
      });
    },
    [],
  );

  const api = React.useMemo<PendingApi>(
    () => ({
      state,
      count: pendingCount(state),

      setCell: (code, rowKey, field, value, options) =>
        commit(
          (prev) => ({
            ...prev,
            cells: {
              ...prev.cells,
              [cellId(code, rowKey, field)]: { code, rowKey, field, value },
            },
            meta: withMeta(prev, options?.meta),
          }),
          options?.coalesce ? `cell:${cellId(code, rowKey, field)}` : undefined,
        ),

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

      addRows: (rows, options) =>
        commit((prev) => {
          const base = options?.replace ? EMPTY_PENDING : prev;
          return {
            ...base,
            addedRows: [
              ...base.addedRows,
              ...rows.map((r) => ({
                localId: `local-${nextLocalId.current++}`,
                code: r.code,
                row: r.row,
              })),
            ],
            // Off `base`, not `prev`: `replace` means "put the day back to how it
            // opened", and the notes about a change set that no longer exists
            // would otherwise outlive it.
            meta: options?.meta ? { ...base.meta, ...options.meta } : base.meta,
          };
        }),

      editAddedRow: (localId, field, value, options) =>
        commit(
          (prev) => ({
            ...prev,
            addedRows: prev.addedRows.map((a) =>
              a.localId === localId ? { ...a, row: { ...a.row, [field]: value } } : a,
            ),
            meta: withMeta(prev, options?.meta),
          }),
          options?.coalesce === false ? undefined : `added:${localId}|${field}`,
        ),

      setCells: (edits, options) =>
        commit((prev) => {
          // Gathered per row first, so two figures on one row are one object
          // spread rather than two passes over `addedRows`.
          const byLocalId = new Map<string, Record<string, string>>();
          const cells = { ...prev.cells };
          for (const edit of edits) {
            if ('localId' in edit) {
              const found = byLocalId.get(edit.localId) ?? {};
              found[edit.field] = edit.value;
              byLocalId.set(edit.localId, found);
            } else {
              cells[cellId(edit.code, edit.rowKey, edit.field)] = {
                code: edit.code,
                rowKey: edit.rowKey,
                field: edit.field,
                value: edit.value,
              };
            }
          }
          return {
            ...prev,
            cells,
            addedRows:
              byLocalId.size === 0
                ? prev.addedRows
                : prev.addedRows.map((a) => {
                    const fields = byLocalId.get(a.localId);
                    return fields ? { ...a, row: { ...a.row, ...fields } } : a;
                  }),
            meta: withMeta(prev, options?.meta),
          };
        }),

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

      undo: () => {
        // Close any run of folded keystrokes, so the next one starts its own
        // entry rather than folding into the entry just restored.
        foldingInto.current = undefined;
        setHistory((h) => {
          if (h.length === 0) return h;
          setState(h[h.length - 1]!);
          return h.slice(0, -1);
        });
      },
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
