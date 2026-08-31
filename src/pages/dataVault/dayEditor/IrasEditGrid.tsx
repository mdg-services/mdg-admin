import { AlertTriangle, Plus, RotateCcw, Undo2 } from 'lucide-react';
import * as React from 'react';

import { Badge, Button, Menu, MenuItem, Table, TBody, TD, TH, THead, TRow } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import {
  IRAS_ROW_LEVEL_FIELD,
  irasFieldPolicies,
  irasFieldPolicy,
  irasRowKeys,
  irasRowLabel,
  isAddedRowKey,
  recAttributionWindow,
  recRowDayVerdict,
  validateIrasCell,
  type IrasDataCorrection,
  type IrasDataset,
  type IrasReportCode,
  type IrasRow,
  type RecRowDayVerdict,
} from '@dk/shared';

import type { PendingApi } from './usePendingChanges';

export interface EditGridProduct {
  key: string;
  labelEn: string;
  tankLabel: string;
  tankNos: number[];
  nozzleNos: number[];
  /** What IRAS calls this grade, e.g. `HS` — stamped on a hand-added row. */
  prodCodes: string[];
}

export interface IrasEditGridProps {
  code: IrasReportCode;
  dataset: IrasDataset | undefined;
  /** Committed corrections for the whole day; this grid picks out its own. */
  corrections: IrasDataCorrection[];
  pending: PendingApi;
  products: EditGridProduct[];
  /** Nozzle number → yesterday's meter reading, for the backwards-meter check. */
  previousTotReadings: Record<string, string>;
  /**
   * When this day's shift closed, ISO-8601 — used to stamp a hand-added
   * delivery on a day that has no collection window of its own.
   *
   * A day opened by hand carries `datasets: []`, so there IS no window, and the
   * seed below used to fall back to no stamp at all: every tanker anybody has
   * ever typed into a hand-entered day is undated, and the "no decant date"
   * badge is only drawn on portal rows, so nothing on the screen says so.
   */
  shiftAnchorAt?: string;
  /** Reveal the columns no calculation reads. */
  showAllColumns: boolean;
  readOnly: boolean;
}

/** One of the portal's columns, as this grid needs it. */
interface ColumnDef {
  field: string;
  headerName: string;
}

/**
 * Which of the two shapes a piece of the grid is being drawn in.
 *
 * `'grid'` is the spreadsheet at `≥ md`; `'card'` is the phone's stacked form.
 * It is a prop rather than a media query because BOTH trees are in the document
 * and CSS picks the one that shows — so every part has to know which of the two
 * it is, and neither may reach into the other with a `md:` class.
 */
type CellShape = 'grid' | 'card';

/**
 * One row of the report, in whichever shape is being drawn.
 *
 * The three kinds of row — a portal row, a hand-added row from an earlier
 * commit, and one added in this session — used to have their markup written out
 * three times inside the table body. Adding a second shape would have made that
 * six. So each row is reduced to two render functions, and the table and the
 * card list are then two thin loops over the same list.
 */
interface GridRowModel {
  key: string;
  /** Tint and strike for the whole row / card. */
  toneClassName?: string;
  /** Applied to every value cell — the strike-through on an excluded row. */
  valueClassName?: string;
  /** The row's identity: label, product, badges, and its actions menu. */
  gutter: (shape: CellShape) => React.ReactNode;
  cell: (col: ColumnDef, shape: CellShape) => React.ReactNode;
}

/**
 * One report's rows, editable like a spreadsheet — and, on a phone, like a form.
 *
 * Interaction model, and why it is not quite Excel's: a single click opens the
 * cell's editor, rather than selecting it and waiting for a second click or a
 * keystroke. The operator here corrects a few figures a week and is not a
 * spreadsheet power user, so a mode they can be in without knowing it — selected
 * but not editing — costs more than it buys. Tab, Enter and the arrow keys still
 * commit and move, so a row of figures can be typed without touching the mouse.
 *
 * WHY THERE ARE TWO SHAPES
 * ------------------------
 * A table cannot work below `md` at any column count. The row-identity gutter
 * alone is `w-48` (192px) of a 296px card, and every data cell is `min-w-[7rem]`
 * plus `px-3`, i.e. ≥136px — so even the default six-column receipts view is
 * about 1,008px inside 296px, and "show all portal columns" is ~4,500px. `main`
 * is `overflow-x-hidden`, so that width is not scrolled, it is CUT OFF. And the
 * identity column scrolls away with everything else, which is exactly the
 * context that makes a correction safe.
 *
 * So below md each row becomes a card: the gutter is its heading and the row's
 * fields stack under it, label over input, at the full width of the card. The
 * editors themselves are the same `Cell` and `NewRowCell` in both shapes, so the
 * pending-change machinery, validation, hints and identity warnings all come
 * along and cannot drift apart.
 *
 * Every column comes from the portal's own metadata, so a report the pipeline
 * learns to collect tomorrow renders here with no code change. What each column
 * MEANS comes from the shared field policy, which the engine's own test pins
 * against the parser — the grid never decides for itself whether a cell matters.
 */
export function IrasEditGrid({
  code,
  dataset,
  corrections,
  pending,
  products,
  previousTotReadings,
  shiftAnchorAt,
  showAllColumns,
  readOnly,
}: IrasEditGridProps) {
  // Which shape to BUILD, not just which to show. Both shapes carry live `Cell`
  // editors and their validation, and the note above measures the table at
  // ~1,008px for six columns and ~4,500px for the full portal set — all of it
  // constructed and then hidden on a phone. The `md:hidden` / `hidden md:block`
  // classes stay as the backstop, so nothing can show twice.
  const isMd = useMediaQuery('(min-width: 768px)');
  // Memoised, not just defaulted: `?? []` is a fresh array every render, so every
  // memo below it would recompute on each keystroke in a cell.
  const portalRows = React.useMemo(() => dataset?.rows ?? [], [dataset]);
  // The day a delivery counts on comes from the same shared rule the engine
  // uses, so this grid can never say a row matters that the report skips.
  const window = dataset?.window;
  const { keys } = React.useMemo(() => irasRowKeys(code, portalRows), [code, portalRows]);

  const mine = React.useMemo(() => corrections.filter((c) => c.code === code), [corrections, code]);
  const committedAdded = React.useMemo(
    () => mine.filter((c) => c.kind === 'ADDED_ROW' && c.row),
    [mine],
  );
  const pendingAdded = pending.state.addedRows.filter((a) => a.code === code);

  /** Columns to show: the portal's own, in its order, filtered by the policy. */
  const columns = React.useMemo<ColumnDef[]>(() => {
    const declared = dataset?.columns ?? [];
    const fromPolicy = irasFieldPolicies(code).map((f) => ({
      field: f.field,
      headerName: f.field,
    }));
    const fromRows = [
      ...new Set([
        ...portalRows.flatMap((r) => Object.keys(r)),
        ...committedAdded.flatMap((c) => Object.keys(c.row ?? {})),
        ...pendingAdded.flatMap((a) => Object.keys(a.row)),
      ]),
    ].map((field) => ({ field, headerName: field }));
    // Prefer the portal's headers. Where there is no dataset at all — a day this
    // outlet's portal never reported, because it has no portal — fall back to the
    // POLICY TABLE rather than to the keys the rows happen to carry: on a day
    // being typed from nothing those keys are only whatever the seed put there,
    // so water dip, invoice quantity and the product code would have no cell to
    // type into, and the report cannot tell a tank's grade without the last one.
    // Where a dataset exists but declared no columns, the row keys are still the
    // right answer — that is a portal day with sparse metadata.
    const base = declared.length > 0 ? declared : !dataset ? fromPolicy : fromRows;
    return base.filter((c) => showAllColumns || irasFieldPolicy(code, c.field).usedByReport);
  }, [dataset, portalRows, committedAdded, pendingAdded, showAllColumns, code]);

  /**
   * The nozzle and tank numbers this day already has a row for — portal rows,
   * saved hand rows and unsaved ones alike. The "add row" seed steps past them,
   * so adding five stock rows does not pre-fill the same tank five times.
   */
  const taken = React.useMemo(() => {
    const gather = (field: string): Set<string> =>
      new Set(
        [
          ...portalRows.map((r) => String(r[field] ?? '').trim()),
          ...committedAdded.map((c) => String(c.row?.[field] ?? '').trim()),
          ...pendingAdded.map((a) => String(a.row[field] ?? '').trim()),
        ].filter(Boolean),
      );
    return { NOZZLE_NO: gather('NOZZLE_NO'), TANK_NO: gather('TANK_NO') };
  }, [portalRows, committedAdded, pendingAdded]);

  /** Which product, if any, reads this row's figures. */
  const productFor = React.useCallback(
    (row: IrasRow): EditGridProduct | undefined => {
      if (code === 'TOT') {
        const nozzle = Number(row.NOZZLE_NO);
        return products.find((p) => p.nozzleNos.includes(nozzle));
      }
      const tank = Number(row.TANK_NO);
      return products.find((p) => p.tankNos.includes(tank));
    },
    [code, products],
  );

  const committedCell = React.useCallback(
    (rowKey: string, field: string) =>
      mine.find((c) => c.rowKey === rowKey && c.field === field && c.kind === 'FIELD'),
    [mine],
  );

  const excludedByCommit = React.useCallback(
    (rowKey: string) =>
      mine.some(
        (c) => c.rowKey === rowKey && c.kind === 'EXCLUDED_ROW' && c.field === IRAS_ROW_LEVEL_FIELD,
      ),
    [mine],
  );

  const totalRows = portalRows.length + committedAdded.length + pendingAdded.length;
  if (totalRows === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-muted md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-2">
        <span>The portal returned no rows for this report.</span>
        {readOnly ? null : (
          <AddRowButtons
            code={code}
            products={products}
            pending={pending}
            window={window}
            shiftAnchorAt={shiftAnchorAt}
            taken={taken}
          />
        )}
      </div>
    );
  }

  const rowModels: GridRowModel[] = [
    ...portalRows.map((row, index): GridRowModel => {
      const rowKey = keys[index]!;
      const excluded =
        (excludedByCommit(rowKey) && !pending.isRestorePending({ code, rowKey })) ||
        pending.isExcludePending({ code, rowKey });
      const product = productFor(row);
      return {
        key: rowKey,
        toneClassName: excluded ? 'opacity-60' : undefined,
        valueClassName: excluded ? 'line-through' : undefined,
        gutter: (shape) => (
          <RowGutter
            shape={shape}
            label={irasRowLabel(code, row)}
            product={product}
            excluded={excluded}
            corrections={mine.filter((c) => c.rowKey === rowKey).length}
            readOnly={readOnly}
            onExclude={() => pending.toggleExclude({ code, rowKey })}
            onRestore={() => pending.toggleRestore({ code, rowKey })}
            onRevertRow={() => pending.revertRow({ code, rowKey })}
            canRestore={excludedByCommit(rowKey)}
            dayVerdict={code === 'REC' ? recRowDayVerdict(row, window) : undefined}
          />
        ),
        cell: (col, shape) => (
          <Cell
            shape={shape}
            code={code}
            rowKey={rowKey}
            field={col.field}
            portalValue={row[col.field] ?? ''}
            committed={committedCell(rowKey, col.field)}
            pending={pending}
            readOnly={readOnly || excluded}
            previousReading={
              code === 'TOT' && col.field === 'TOT_READING'
                ? previousTotReadings[String(row.NOZZLE_NO ?? '').trim()]
                : undefined
            }
          />
        ),
      };
    }),

    // Rows added by hand on an earlier commit.
    ...committedAdded.map((c): GridRowModel => {
      const dropping = pending.state.deleteAdded.some(
        (t) => t.code === code && t.rowKey === c.rowKey,
      );
      return {
        key: c.rowKey,
        toneClassName: cn('bg-info-soft', dropping && 'line-through opacity-60'),
        gutter: (shape) => (
          <HandRowGutter
            shape={shape}
            label={c.rowLabel}
            badge={<Badge intent="info">Added by hand</Badge>}
            product={productFor(c.row ?? {})}
            readOnly={readOnly}
            actionLabel={dropping ? 'Keep this row' : 'Delete this row'}
            onAction={() => pending.deleteCommittedAddedRow({ code, rowKey: c.rowKey })}
          />
        ),
        cell: (col, shape) => (
          <Cell
            shape={shape}
            code={code}
            rowKey={c.rowKey}
            field={col.field}
            portalValue={c.row?.[col.field] ?? ''}
            committed={undefined}
            pending={pending}
            readOnly={readOnly || dropping}
            // The backwards-meter check used to be passed only to portal rows,
            // which meant it was dead on the one outlet where every meter row is
            // typed by hand, every morning — the single most valuable check in
            // this editor, silent on the only day that needs it.
            previousReading={
              code === 'TOT' && col.field === 'TOT_READING'
                ? previousTotReadings[String(c.row?.NOZZLE_NO ?? '').trim()]
                : undefined
            }
            handRow
          />
        ),
      };
    }),

    // Rows added in this session, not yet applied.
    ...pendingAdded.map((a): GridRowModel => ({
      key: a.localId,
      toneClassName: 'bg-info-soft',
      gutter: (shape) => (
        <HandRowGutter
          shape={shape}
          label={irasRowLabel(code, a.row)}
          badge={<Badge intent="info">New row</Badge>}
          product={productFor(a.row)}
          readOnly={false}
          actionLabel="Remove"
          onAction={() => pending.dropAddedRow(a.localId)}
        />
      ),
      cell: (col, shape) => (
        <NewRowCell
          shape={shape}
          code={code}
          field={col.field}
          value={a.row[col.field] ?? ''}
          onChange={(v) => pending.editAddedRow(a.localId, col.field, v)}
          previousReading={
            code === 'TOT' && col.field === 'TOT_READING'
              ? previousTotReadings[String(a.row.NOZZLE_NO ?? '').trim()]
              : undefined
          }
        />
      ),
    })),
  ];

  return (
    <div className="flex flex-col gap-2">
      {/* Phone (< md): one card per row, the identity as its heading and the
          fields stacked under it. See the note on this component for why a
          table has no working size here. */}
      {isMd ? null : (
        <ul className="grid gap-3 md:hidden">
          {rowModels.map((r) => (
            <li
              key={r.key}
              className={cn(
                'rounded-md border border-border bg-surface p-2.5 md:p-3',
                r.toneClassName,
              )}
            >
              {r.gutter('card')}
              <dl className="mt-3 grid gap-3">
                {columns.map((col) => (
                  <div key={col.field} className="min-w-0">
                    <dt className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                      <span className="break-all">{col.headerName}</span>
                      <FieldPolicyMark code={code} field={col.field} shape="card" />
                    </dt>
                    <dd className={cn('min-w-0', r.valueClassName)}>{r.cell(col, 'card')}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}

      {/* Desktop (≥ md): the spreadsheet, unchanged. It scrolls inside its own
          box — never the page body. */}
      {isMd ? (
        <div className="hidden overflow-x-auto rounded-md border border-border md:block">
          <Table>
            <THead>
              <TRow>
                <TH className="w-48 whitespace-nowrap">Row</TH>
                {columns.map((col) => (
                  <TH key={col.field} className="whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      {col.headerName}
                      <FieldPolicyMark code={code} field={col.field} shape="grid" />
                    </span>
                  </TH>
                ))}
              </TRow>
            </THead>
            <TBody>
              {rowModels.map((r) => (
                <TRow key={r.key} className={r.toneClassName}>
                  <TD className="align-top">{r.gutter('grid')}</TD>
                  {columns.map((col) => (
                    <TD key={col.field} className={cn('align-top', r.valueClassName)}>
                      {r.cell(col, 'grid')}
                    </TD>
                  ))}
                </TRow>
              ))}
            </TBody>
          </Table>
        </div>
      ) : null}

      {readOnly ? null : (
        <div className="flex justify-start">
          <AddRowButtons
            code={code}
            products={products}
            pending={pending}
            window={window}
            shiftAnchorAt={shiftAnchorAt}
            taken={taken}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The keyboard a phone should open for this cell.
 *
 * `undefined` — the ordinary text keyboard — for everything that is not a plain
 * number, which is most of the identity and info columns: a PRODCODE is `HS`, an
 * invoice number carries letters, and a decant stamp is `dd-mm-yyyy`. A numeric
 * pad on any of those is a field the operator cannot finish typing into, which
 * is worse than three extra taps on a meter reading.
 */
function keyboardFor(policy: ReturnType<typeof irasFieldPolicy>): 'decimal' | undefined {
  return policy.kind === 'number' && (policy.min ?? 0) >= 0 ? 'decimal' : undefined;
}

/* ─────────────────────────── what a column means ────────────────────────── */

/**
 * Whether the report reads this column, said in the shape the surface allows.
 *
 * In the grid it is the dot and the two grey words that have always been in the
 * header, tooltip and all. On a phone `title` never fires — the shell swallows
 * the long-press callout — so the same three states are spelled out as visible
 * text instead. Colour and a 6px dot are not an encoding channel a finger can
 * read.
 */
function FieldPolicyMark({
  code,
  field,
  shape,
}: {
  code: IrasReportCode;
  field: string;
  shape: CellShape;
}) {
  const policy = irasFieldPolicy(code, field);

  if (shape === 'card') {
    if (policy.usedByReport) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-brand">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
          Used by the report
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-text-subtle">
        {policy.affectsReportNotes ? 'Report notes only' : 'Not used by the report'}
      </span>
    );
  }

  if (policy.usedByReport) {
    return (
      <span
        title="Used by the report."
        aria-label="Used by the report"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
      />
    );
  }
  if (policy.affectsReportNotes) {
    return (
      <span
        title="No figure on the report is calculated from this, but it decides the notes printed at the bottom of the report."
        className="text-[10px] font-normal uppercase tracking-wide text-text-subtle"
      >
        notes only
      </span>
    );
  }
  return (
    <span
      title="No figure on the report is calculated from this."
      className="text-[10px] font-normal uppercase tracking-wide text-text-subtle"
    >
      not used
    </span>
  );
}

/* ──────────────────────────────── one cell ──────────────────────────────── */

function Cell({
  code,
  rowKey,
  field,
  portalValue,
  committed,
  pending,
  readOnly: readOnlyProp,
  previousReading,
  handRow = false,
  shape,
}: {
  code: IrasReportCode;
  rowKey: string;
  field: string;
  portalValue: string;
  committed: IrasDataCorrection | undefined;
  pending: PendingApi;
  readOnly: boolean;
  previousReading?: string;
  /**
   * Whether this row exists only because somebody typed it.
   *
   * It widens the meter check from "below yesterday's" to "below or equal to
   * yesterday's". A portal row keeps the narrower test: an unchanged reading
   * there is what the portal said and there is nothing for the operator to type,
   * so the wider one would put a new advisory line on the eight collected
   * dealers' correction screens, which is a change and not a fix.
   */
  handRow?: boolean;
  shape: CellShape;
}) {
  const policy = irasFieldPolicy(code, field);
  // A locked field is not editable by anyone — see `IrasFieldPolicy.locked`. The
  // server refuses it too; this only stops an operator typing into a cell that
  // was going to be rejected, which is a worse way to learn the same thing.
  const readOnly = readOnlyProp || policy.locked === true;
  const pendingCell = pending.pendingCell(code, rowKey, field);
  const card = shape === 'card';

  // What is in force right now: a pending edit, else a committed correction, else
  // the portal's own value. A pending `null` is an explicit revert.
  const inForce =
    pendingCell !== undefined
      ? (pendingCell.value ?? portalValue)
      : (committed?.value ?? portalValue);

  const isPending = pendingCell !== undefined;
  const isCorrected = !isPending && committed !== undefined;
  const portalMoved =
    committed !== undefined && (committed.portalValue ?? '') !== portalValue;

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(inForce);

  const problem = editing ? validateIrasCell(code, field, draft) : null;
  const comparable =
    editing &&
    previousReading !== undefined &&
    draft.trim() !== '' &&
    Number.isFinite(Number(draft));
  const backwards = comparable && Number(draft) < Number(previousReading);
  const unchanged = comparable && handRow && Number(draft) === Number(previousReading);

  function open() {
    if (readOnly) return;
    setDraft(inForce);
    setEditing(true);
  }

  function commitDraft() {
    setEditing(false);
    const next = draft.trim();
    if (next === inForce.trim()) return;
    // Typing the portal's own figure back is a revert, not a correction — the
    // server treats it the same way, so the two never disagree about what the
    // day's correction count means.
    //
    // Except on a hand-added row, where there IS no portal figure to hand the
    // cell back to. `null` there means "revert", and the server's added-row
    // branch writes an EMPTY STRING rather than restoring anything — so retyping
    // a tank's own stock figure used to record that tank as holding nothing.
    pending.setCell(
      code,
      rowKey,
      field,
      !isAddedRowKey(rowKey) && next === portalValue.trim() ? null : next,
    );
  }

  if (editing) {
    return (
      <div className={card ? undefined : 'min-w-[7rem]'}>
        <input
          autoFocus
          value={draft}
          inputMode={keyboardFor(policy)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              // Let Tab move focus naturally once the value is recorded.
              commitDraft();
              if (e.key === 'Enter') e.preventDefault();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
              setDraft(inForce);
            }
          }}
          aria-label={`${field} for ${rowKey}`}
          aria-invalid={problem ? true : undefined}
          className={cn(
            // `text-base` below md: a 14px field is under iOS's 16px floor, so
            // focusing it zooms the viewport — and pinch-zoom is disabled
            // app-wide, so there is no way back out of that zoom.
            'w-full rounded border bg-surface tabular-nums text-text outline-none text-base md:text-sm',
            card ? 'min-h-11 px-2 py-2' : 'min-w-[7rem] px-1.5 py-1',
            problem ? 'border-danger' : 'border-brand',
          )}
        />
        <CellNotes
          policy={policy}
          problem={problem}
          backwards={backwards}
          unchanged={unchanged}
          previousReading={previousReading}
          value={draft}
        />
      </div>
    );
  }

  const shown = inForce === '' ? '—' : inForce;

  // The revert affordances are SIBLINGS of the value button, not children of it.
  // An interactive element inside a button is invalid — the parser hoists it out
  // of place, which is exactly what broke the add-row controls — and it forced
  // every one of them to stopPropagation just to avoid opening the editor.
  return (
    <div className={cn('group', card ? null : 'min-w-[7rem]')}>
      <button
        type="button"
        disabled={readOnly}
        onClick={open}
        title={
          isCorrected || isPending
            ? `The portal says ${portalValue || '—'}${
                portalMoved ? ' (it changed after this was corrected)' : ''
              }`
            : policy.locked
              ? 'This cannot be changed. The report adds a product’s tanks together, so moving a stock row onto a tank that already has one would count that tank’s fuel twice. To correct it, exclude this row and add the right one.'
              : policy.usedByReport
                ? 'Used by the report.'
                : policy.affectsReportNotes
                  ? 'No figure is calculated from this, but it decides the report’s layout notes.'
                  : 'No figure on the report is calculated from this.'
        }
        className={cn(
          'block w-full rounded text-left tabular-nums',
          // In the card the value IS the tap target that opens the editor, so
          // it carries the 44px floor and a border that says it is a field —
          // dashed when the policy locks it, so a cell that cannot be typed
          // into does not look like one that can.
          card ? 'min-h-11 border px-2 py-2 text-base' : 'px-1.5 py-1 text-sm',
          card && (readOnly ? 'border-dashed border-border' : 'border-border'),
          readOnly ? 'cursor-default' : 'hover:bg-surface-2',
          isPending && 'bg-info-soft font-semibold text-text',
          isCorrected && 'font-semibold text-text',
          !isPending &&
            !isCorrected &&
            (policy.usedByReport ? 'text-text' : 'text-text-subtle italic'),
          policy.identityWarning && (isPending || isCorrected) && 'ring-1 ring-danger',
        )}
      >
        <span className="flex items-center gap-1">
          {shown}
          {isCorrected ? (
            <span
              aria-hidden
              className={cn(
                'inline-block h-0 w-0 border-l-[5px] border-t-[5px] border-l-transparent',
                portalMoved ? 'border-t-warning' : 'border-t-brand',
              )}
            />
          ) : null}
        </span>
        {(isPending || isCorrected) && portalValue !== inForce ? (
          <span className="block text-[11px] font-normal text-text-subtle line-through">
            {portalValue || '—'}
          </span>
        ) : null}
      </button>
      {/*
        Two rungs back out of a correction. In the grid they stay the hover-
        revealed links they have always been. In the card they are real buttons,
        always on screen: touch has no hover, and `focus-visible` fires only on
        keyboard focus, so on a phone the ONLY per-cell revert was invisible and
        the row menu's whole-row undo was the only way back — which throws away
        the corrections on that row an operator wanted to keep.
      */}
      {isCorrected && !readOnly ? (
        card ? (
          // Wrapped rather than given `justify-start px-0`: `cn` is plain clsx,
          // so those would land beside `Button`'s own `justify-center px-3` and
          // lose on stylesheet order. A natural-width button in a block is
          // already left-aligned.
          <div className="mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-brand"
              onClick={() => pending.setCell(code, rowKey, field, null)}
            >
              Use the portal’s value
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => pending.setCell(code, rowKey, field, null)}
            className="mt-0.5 block px-1.5 text-left text-[11px] font-semibold text-brand underline opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
          >
            Use the portal’s value
          </button>
        )
      ) : null}
      {isPending ? (
        card ? (
          <div className="mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-brand"
              onClick={() => pending.clearCell(code, rowKey, field)}
            >
              Undo this edit
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => pending.clearCell(code, rowKey, field)}
            className="mt-0.5 block px-1.5 text-left text-[11px] font-semibold text-brand underline"
          >
            Undo this edit
          </button>
        )
      ) : null}
    </div>
  );
}

/** A cell on a row that only exists as a pending addition — always editable. */
function NewRowCell({
  code,
  field,
  value,
  onChange,
  previousReading,
  shape,
}: {
  code: IrasReportCode;
  field: string;
  value: string;
  onChange: (v: string) => void;
  /** Yesterday's reading for this nozzle. See `Cell.handRow`: a row being added
   *  by hand is a hand row, so the check is "below or equal to yesterday's". */
  previousReading?: string;
  shape: CellShape;
}) {
  const problem = validateIrasCell(code, field, value);
  const policy = irasFieldPolicy(code, field);
  const card = shape === 'card';
  const comparable =
    previousReading !== undefined && value.trim() !== '' && Number.isFinite(Number(value));
  const backwards = comparable && Number(value) < Number(previousReading);
  const unchanged = comparable && Number(value) === Number(previousReading);
  return (
    <div className={card ? undefined : 'min-w-[7rem]'}>
      <input
        value={value}
        inputMode={keyboardFor(policy)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={policy.usedByReport ? 'required' : ''}
        aria-label={`${field} on the new row`}
        aria-invalid={problem ? true : undefined}
        className={cn(
          // 16px below md, for the same focus-zoom reason as the editor above.
          'w-full rounded border bg-surface tabular-nums text-text outline-none text-base md:text-sm',
          card ? 'min-h-11 px-2 py-2' : 'min-w-[7rem] px-1.5 py-1',
          problem ? 'border-danger' : 'border-border focus:border-brand',
        )}
      />
      {/*
        The same guidance the grid gives when editing an existing cell. It was
        missing here, which is the worst place to omit it: adding a delivery the
        outlet forgot is exactly when someone needs to be told that the decant
        date decides which day the litres count on.
      */}
      <CellNotes
        policy={policy}
        problem={problem}
        backwards={backwards}
        unchanged={unchanged}
        previousReading={previousReading}
        value={value}
      />
    </div>
  );
}

/**
 * Everything a field says about itself once there is something in it: the
 * validation message, the backwards-meter check, what a blank does, the policy's
 * own hint and its identity warning.
 *
 * Written once because it now has to read the same in both shapes, and because
 * the new-row cell had already drifted from the in-place editor by two of the
 * five lines the last time they were maintained separately.
 */
function CellNotes({
  policy,
  problem,
  backwards,
  unchanged = false,
  previousReading,
  value,
}: {
  policy: ReturnType<typeof irasFieldPolicy>;
  problem: string | null;
  backwards: boolean;
  /** Exactly yesterday's reading, on a row somebody is typing. */
  unchanged?: boolean;
  previousReading?: string;
  value: string;
}) {
  return (
    <>
      {problem ? <p className="mt-1 max-w-[16rem] text-[11px] text-danger">{problem}</p> : null}
      {!problem && backwards && previousReading !== undefined ? (
        <p className="mt-1 max-w-[16rem] text-[11px] text-warning">
          Meters do not run backwards — yesterday this nozzle read{' '}
          {Number(previousReading).toLocaleString('en-IN')}.
        </p>
      ) : null}
      {/*
        A totaliser is a lifetime odometer, so a reading that has not moved
        reports zero litres sold on that nozzle AND drops its 5 litre test draw,
        because the engine charges testing only to a nozzle that moved. Nothing
        in this editor said so before.
      */}
      {!problem && !backwards && unchanged ? (
        <p className="mt-1 max-w-[16rem] text-[11px] text-warning">
          Same as yesterday. This reports zero litres sold on this nozzle, and it also drops that
          nozzle’s 5 litre test draw.
        </p>
      ) : null}
      {!problem && !backwards && value.trim() === '' && policy.dropsRowWhenBlank ? (
        <p className="mt-1 max-w-[16rem] text-[11px] text-warning">
          Leaving this empty removes the whole row from the report.
        </p>
      ) : null}
      {!problem && !backwards && value.trim() === '' && policy.blankReadsAsZero ? (
        <p className="mt-1 max-w-[16rem] text-[11px] text-warning">
          An empty value counts as zero — the row stays in the report.
        </p>
      ) : null}
      {policy.hint ? (
        <p className="mt-1 max-w-[16rem] text-[11px] text-text-subtle">{policy.hint}</p>
      ) : null}
      {policy.identityWarning ? (
        <p className="mt-1 max-w-[18rem] text-[11px] text-danger">{policy.identityWarning}</p>
      ) : null}
    </>
  );
}

/* ──────────────────────────────── row gutter ─────────────────────────────── */

function ProductTag({ product }: { product: EditGridProduct | undefined }) {
  if (!product) {
    return (
      <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-warning">
        <AlertTriangle width={11} height={11} strokeWidth={2} />
        No product reads this row
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap text-[11px] text-text-subtle">→ {product.labelEn}</span>
  );
}

function RowGutter({
  label,
  product,
  excluded,
  corrections,
  readOnly,
  canRestore,
  onExclude,
  onRestore,
  onRevertRow,
  dayVerdict,
  shape,
}: {
  label: string;
  product: EditGridProduct | undefined;
  excluded: boolean;
  /** For a receipt row: whether THIS day's report is the one that counts it. */
  dayVerdict?: RecRowDayVerdict;
  corrections: number;
  readOnly: boolean;
  canRestore: boolean;
  onExclude: () => void;
  onRestore: () => void;
  onRevertRow: () => void;
  shape: CellShape;
}) {
  return (
    <div className="flex flex-col gap-1">
      {/* The label and the menu sit side by side rather than inline in one line
          of text: the trigger is a 36px tap target, so letting it flow inside the
          label pushed the product line onto a wrap. */}
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            'min-w-0 break-words font-medium text-text',
            shape === 'card' ? 'text-sm' : 'text-xs',
          )}
        >
          {label}
        </span>
        {readOnly ? null : (
          // No `trigger` prop: Menu renders its OWN button, and passing a button
          // into it nests one inside the other. The HTML parser then hoists the
          // inner one out of its container, which is how these ended up laid out
          // over the sidebar. `align="start"` keeps the popover inside the grid.
          //
          // Item labels are terse because `MenuItem` truncates inside a fixed
          // 240px panel — the row identity lives in the menu's own title instead
          // of being repeated in every label.
          <Menu label={`Actions for ${label}`} align="start" title={label}>
            {canRestore ? (
              <MenuItem onSelect={onRestore} icon={<Undo2 width={14} height={14} />}>
                Put back in report
              </MenuItem>
            ) : (
              <MenuItem onSelect={onExclude} icon={<RotateCcw width={14} height={14} />}>
                {excluded ? 'Keep in report' : 'Leave out of report'}
              </MenuItem>
            )}
            {corrections > 0 ? (
              <MenuItem onSelect={onRevertRow} icon={<Undo2 width={14} height={14} />}>
                Undo {corrections} correction{corrections === 1 ? '' : 's'}
              </MenuItem>
            ) : null}
          </Menu>
        )}
      </div>
      <ProductTag product={product} />
      {/*
        A delivery is counted on the day it was DECANTED, and the portal answers
        on when it was entered — so a row can sit on this day's screen and be
        read by another day's report. Saying so here is the point: correcting a
        row the report will not read is exactly the fault this whole area keeps
        producing.
      */}
      {dayVerdict === 'OTHER_DAY' ? (
        <Badge intent="warning">Counts on the day it was decanted</Badge>
      ) : null}
      {dayVerdict === 'UNDATED' ? (
        <Badge intent="warning">No decant date — counted on this day</Badge>
      ) : null}
      {corrections > 0 ? (
        <span className="text-[11px] text-brand">
          {corrections} correction{corrections === 1 ? '' : 's'}
        </span>
      ) : null}
      {excluded ? <Badge intent="warning">Left out</Badge> : null}
    </div>
  );
}

/**
 * The gutter for a row that exists only because somebody typed it — one saved on
 * an earlier commit, or one added in this session.
 *
 * Its one action (drop the row, or keep it after all) is a bare underlined link
 * in the grid, exactly as it was, and a real 44px button in the card: on a
 * hand-added delivery that link is the only way to drop a tanker that is being
 * counted twice, and a 16px underline is not a target a thumb can find.
 */
function HandRowGutter({
  label,
  badge,
  product,
  readOnly,
  actionLabel,
  onAction,
  shape,
}: {
  label: string;
  badge: React.ReactNode;
  product: EditGridProduct | undefined;
  readOnly: boolean;
  actionLabel: string;
  onAction: () => void;
  shape: CellShape;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={cn(
          'min-w-0 break-words font-medium text-text',
          shape === 'card' ? 'text-sm' : 'text-xs',
        )}
      >
        {label}
      </span>
      {badge}
      <ProductTag product={product} />
      {readOnly ? null : shape === 'card' ? (
        <Button variant="ghost" size="sm" className="text-brand" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : (
        <button
          type="button"
          className="text-left text-xs font-semibold text-brand underline"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ──────────────────────────────── add a row ─────────────────────────────── */

/**
 * When a hand-added tanker was decanted, stamped INSIDE the day it belongs to.
 *
 * One hour before the shift closed is unambiguously this day's, and without a
 * stamp the row carries no date at all — `recRowDayVerdict` then reads it as
 * `UNDATED` and counts it on whichever day is being generated.
 *
 * The window comes from the collection, and a day opened by hand has no
 * collection: `datasets` is empty by design, so `window` is undefined and every
 * tanker anybody has typed into a hand-entered day has gone in undated, with
 * nothing on screen saying so — the "no decant date" badge is only drawn on
 * portal rows. The shift's own anchor is the same instant the window would have
 * ended at, so it produces the identical stamp on the one kind of day that needs
 * the fallback.
 *
 * Exported so the shift sheet's own delivery card stamps a tanker exactly the
 * way the full grid does; two implementations of this would be two answers to
 * "which day do these litres count on".
 */
export function decantSeedFields(
  window: { from: string; to: string } | undefined,
  shiftAnchorAt: string | undefined,
): IrasRow {
  const attribution = recAttributionWindow(window);
  const anchor = attribution?.to ?? (shiftAnchorAt ? new Date(shiftAnchorAt) : null);
  if (!anchor || !Number.isFinite(anchor.getTime())) return {};
  // Read back in IST because the portal writes its stamps in IST, and a `Date`
  // read on a machine in another zone would name the wrong calendar day.
  const ist = new Date(anchor.getTime() - 60 * 60_000 + 5.5 * 60 * 60_000);
  const two = (n: number): string => String(n).padStart(2, '0');
  return {
    DECANT_END_DATE: `${two(ist.getUTCDate())}-${two(ist.getUTCMonth() + 1)}-${ist.getUTCFullYear()}`,
    DECANT_END_TIME: `${two(ist.getUTCHours())}:${two(ist.getUTCMinutes())}:00`,
  };
}

/**
 * Add a row the portal never sent.
 *
 * This is the commonest correction of all — a tanker decanted and nobody entered
 * it at the outlet — so it is a first-class button rather than something hidden in
 * a menu. The new row is pre-filled with the identity fields the report needs to
 * attribute it to a product, because a row missing those is invisible to the
 * report and the operator has no way to know that.
 *
 * One button PER PRODUCT rather than one button opening a product picker. A
 * dealer has two or three products, so the choice fits on the row, and naming the
 * product on the button is what makes the pre-filled tank number defensible — the
 * operator picked HIGH SPEED DIESEL, so tank 2 is not a mystery default.
 *
 * Below md the buttons go full width and drop the noun — `Button` carries
 * `whitespace-nowrap`, so "Add a delivery for HIGH SPEED DIESEL" cannot wrap and
 * would run off a 296px card and be clipped by `main`'s `overflow-x-hidden`.
 */
function AddRowButtons({
  code,
  products,
  pending,
  window,
  shiftAnchorAt,
  taken,
}: {
  code: IrasReportCode;
  products: EditGridProduct[];
  pending: PendingApi;
  /** The day's collection window, for stamping a hand-added delivery. */
  window?: { from: string; to: string };
  /** When this day's shift closed — the fallback when there is no window. */
  shiftAnchorAt?: string;
  /** Which nozzle / tank numbers this day already has a row for. */
  taken: { NOZZLE_NO: Set<string>; TANK_NO: Set<string> };
}) {
  const label = code === 'TOT' ? 'nozzle reading' : code === 'STK' ? 'tank stock row' : 'delivery';

  /**
   * The next nozzle/tank of this product that no row on the day claims yet.
   *
   * Always seeding `[0]` is how a whole day gets typed against one tank: the
   * operator adds five stock rows and every one arrives pre-filled with the same
   * tank number. Two rows for one tank double that product's stock, so the seed
   * has to move on by itself.
   */
  function nextUnused(values: number[] | undefined, field: 'NOZZLE_NO' | 'TANK_NO'): string {
    const used = taken[field];
    const free = (values ?? []).find((v) => !used.has(String(v)));
    return String(free ?? values?.[0] ?? '');
  }

  function seed(product: EditGridProduct | undefined): IrasRow {
    // PRODCODE on every seed: on a day typed from nothing it is the only thing
    // that tells the report which grade a tank holds, and without it the layout
    // discovery finds no products at all.
    const prodCode = product?.prodCodes[0] ?? '';
    if (code === 'TOT') {
      return {
        NOZZLE_NO: nextUnused(product?.nozzleNos, 'NOZZLE_NO'),
        TOT_READING: '',
        TANK_NO: String(product?.tankNos[0] ?? ''),
        PRODCODE: prodCode,
      };
    }
    if (code === 'STK') {
      return {
        TANK_NO: nextUnused(product?.tankNos, 'TANK_NO'),
        NET_QTY: '',
        PRODUCT_DIP: '',
        WATER_DIP: '',
        PRODCODE: prodCode,
      };
    }
    return {
      TANK_NO: String(product?.tankNos[0] ?? ''),
      NET_QTY_DECANTED: '',
      // The invoiced quantity is what seven of the eight dealers' reports count,
      // so it needs a cell of its own rather than only appearing behind "show
      // all columns".
      INVOICE_QUANTITY: '',
      INVOICE_NUMBER: '',
      PRODCODE: prodCode,
      ...decantSeedFields(window, shiftAnchorAt),
    };
  }

  if (products.length <= 1) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="w-full md:w-auto"
        leftIcon={<Plus width={14} height={14} strokeWidth={2} />}
        onClick={() => pending.addRow(code, seed(products[0]))}
      >
        Add a {label}
      </Button>
    );
  }

  return (
    <div className="grid w-full gap-2 md:flex md:w-auto md:flex-wrap md:items-center">
      {products.map((p) => (
        <Button
          key={p.key}
          variant="secondary"
          size="sm"
          className="w-full md:w-auto"
          leftIcon={<Plus width={14} height={14} strokeWidth={2} />}
          onClick={() => pending.addRow(code, seed(p))}
        >
          <span className="md:hidden">Add · {p.labelEn}</span>
          <span className="hidden md:inline">
            Add a {label} for {p.labelEn}
          </span>
        </Button>
      ))}
    </div>
  );
}
