import { AlertTriangle, MoreVertical, Plus, RotateCcw, Undo2 } from 'lucide-react';
import * as React from 'react';

import { Badge, Button, Menu, MenuItem, Table, TBody, TD, TH, THead, TRow } from '@/components/ui';
import { cn } from '@/lib/cn';
import type {
  IrasDataCorrection,
  IrasDataset,
  IrasReportCode,
  IrasRow,
} from '@dk/shared';
import {
  IRAS_ROW_LEVEL_FIELD,
  irasFieldPolicy,
  irasRowKeys,
  irasRowLabel,
  validateIrasCell,
} from '@dk/shared';

import type { PendingApi } from './usePendingChanges';

export interface EditGridProduct {
  key: string;
  labelEn: string;
  tankLabel: string;
  tankNos: number[];
  nozzleNos: number[];
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
  /** Reveal the columns no calculation reads. */
  showAllColumns: boolean;
  readOnly: boolean;
}

/**
 * One report's rows, editable like a spreadsheet.
 *
 * Interaction model, and why it is not quite Excel's: a single click opens the
 * cell's editor, rather than selecting it and waiting for a second click or a
 * keystroke. The operator here corrects a few figures a week and is not a
 * spreadsheet power user, so a mode they can be in without knowing it — selected
 * but not editing — costs more than it buys. Tab, Enter and the arrow keys still
 * commit and move, so a row of figures can be typed without touching the mouse.
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
  showAllColumns,
  readOnly,
}: IrasEditGridProps) {
  // Memoised, not just defaulted: `?? []` is a fresh array every render, so every
  // memo below it would recompute on each keystroke in a cell.
  const portalRows = React.useMemo(() => dataset?.rows ?? [], [dataset]);
  const { keys } = React.useMemo(() => irasRowKeys(code, portalRows), [code, portalRows]);

  const mine = React.useMemo(() => corrections.filter((c) => c.code === code), [corrections, code]);
  const committedAdded = React.useMemo(
    () => mine.filter((c) => c.kind === 'ADDED_ROW' && c.row),
    [mine],
  );
  const pendingAdded = pending.state.addedRows.filter((a) => a.code === code);

  /** Columns to show: the portal's own, in its order, filtered by the policy. */
  const columns = React.useMemo(() => {
    const declared = dataset?.columns ?? [];
    const fromRows = [
      ...new Set([
        ...portalRows.flatMap((r) => Object.keys(r)),
        ...committedAdded.flatMap((c) => Object.keys(c.row ?? {})),
        ...pendingAdded.flatMap((a) => Object.keys(a.row)),
      ]),
    ].map((field) => ({ field, headerName: field }));
    // Prefer the portal's headers; fall back to the raw field names for a day
    // whose dataset was built entirely by hand and has no column metadata.
    const base = declared.length > 0 ? declared : fromRows;
    return base.filter((c) => showAllColumns || irasFieldPolicy(code, c.field).usedByReport);
  }, [dataset, portalRows, committedAdded, pendingAdded, showAllColumns, code]);

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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-muted">
        <span>The portal returned no rows for this report.</span>
        {readOnly ? null : <AddRowButton code={code} products={products} pending={pending} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* The grid scrolls inside its own box — never the page body. */}
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <THead>
            <TRow>
              <TH className="w-[8.5rem] whitespace-nowrap">Row</TH>
              {columns.map((col) => {
                const policy = irasFieldPolicy(code, col.field);
                return (
                  <TH key={col.field} className="whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      {col.headerName}
                      {policy.usedByReport ? (
                        <span
                          title="Used by the report."
                          aria-label="Used by the report"
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                        />
                      ) : (
                        <span
                          title="Stored, but no calculation reads this. Editing it will not change any report."
                          className="text-[10px] font-normal uppercase tracking-wide text-text-subtle"
                        >
                          not used
                        </span>
                      )}
                    </span>
                  </TH>
                );
              })}
            </TRow>
          </THead>
          <TBody>
            {portalRows.map((row, index) => {
              const rowKey = keys[index]!;
              const excluded =
                (excludedByCommit(rowKey) && !pending.isRestorePending({ code, rowKey })) ||
                pending.isExcludePending({ code, rowKey });
              const product = productFor(row);
              return (
                <TRow key={rowKey} className={cn(excluded && 'opacity-60')}>
                  <TD className="align-top">
                    <RowGutter
                      label={irasRowLabel(code, row)}
                      product={product}
                      excluded={excluded}
                      corrections={mine.filter((c) => c.rowKey === rowKey).length}
                      readOnly={readOnly}
                      onExclude={() => pending.toggleExclude({ code, rowKey })}
                      onRestore={() => pending.toggleRestore({ code, rowKey })}
                      onRevertRow={() => pending.revertRow({ code, rowKey })}
                      canRestore={excludedByCommit(rowKey)}
                    />
                  </TD>
                  {columns.map((col) => (
                    <TD key={col.field} className={cn('align-top', excluded && 'line-through')}>
                      <Cell
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
                        productLabel={product?.labelEn}
                      />
                    </TD>
                  ))}
                </TRow>
              );
            })}

            {/* Rows added by hand on an earlier commit. */}
            {committedAdded.map((c) => {
              const dropping = pending.state.deleteAdded.some(
                (t) => t.code === code && t.rowKey === c.rowKey,
              );
              return (
                <TRow
                  key={c.rowKey}
                  className={cn('bg-info-soft', dropping && 'line-through opacity-60')}
                >
                  <TD className="align-top">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-text">{c.rowLabel}</span>
                      <Badge intent="info">Added by hand</Badge>
                      <ProductTag product={productFor(c.row ?? {})} />
                      {readOnly ? null : (
                        <button
                          type="button"
                          className="text-left text-xs font-semibold text-brand underline"
                          onClick={() => pending.deleteCommittedAddedRow({ code, rowKey: c.rowKey })}
                        >
                          {dropping ? 'Keep this row' : 'Delete this row'}
                        </button>
                      )}
                    </div>
                  </TD>
                  {columns.map((col) => (
                    <TD key={col.field} className="align-top">
                      <Cell
                        code={code}
                        rowKey={c.rowKey}
                        field={col.field}
                        portalValue={c.row?.[col.field] ?? ''}
                        committed={undefined}
                        pending={pending}
                        readOnly={readOnly || dropping}
                        productLabel={productFor(c.row ?? {})?.labelEn}
                      />
                    </TD>
                  ))}
                </TRow>
              );
            })}

            {/* Rows added in this session, not yet applied. */}
            {pendingAdded.map((a) => (
              <TRow key={a.localId} className="bg-info-soft">
                <TD className="align-top">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-text">
                      {irasRowLabel(code, a.row)}
                    </span>
                    <Badge intent="info">New row</Badge>
                    <ProductTag product={productFor(a.row)} />
                    <button
                      type="button"
                      className="text-left text-xs font-semibold text-brand underline"
                      onClick={() => pending.dropAddedRow(a.localId)}
                    >
                      Remove
                    </button>
                  </div>
                </TD>
                {columns.map((col) => (
                  <TD key={col.field} className="align-top">
                    <NewRowCell
                      code={code}
                      field={col.field}
                      value={a.row[col.field] ?? ''}
                      onChange={(v) => pending.editAddedRow(a.localId, col.field, v)}
                    />
                  </TD>
                ))}
              </TRow>
            ))}
          </TBody>
        </Table>
      </div>

      {readOnly ? null : (
        <div className="flex justify-start">
          <AddRowButton code={code} products={products} pending={pending} />
        </div>
      )}
    </div>
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
  readOnly,
  previousReading,
  productLabel,
}: {
  code: IrasReportCode;
  rowKey: string;
  field: string;
  portalValue: string;
  committed: IrasDataCorrection | undefined;
  pending: PendingApi;
  readOnly: boolean;
  previousReading?: string;
  productLabel?: string;
}) {
  const policy = irasFieldPolicy(code, field);
  const pendingCell = pending.pendingCell(code, rowKey, field);

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
  const backwards =
    editing &&
    previousReading !== undefined &&
    draft.trim() !== '' &&
    Number.isFinite(Number(draft)) &&
    Number(draft) < Number(previousReading);

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
    pending.setCell(code, rowKey, field, next === portalValue.trim() ? null : next);
  }

  if (editing) {
    return (
      <div className="min-w-[7rem]">
        <input
          autoFocus
          value={draft}
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
            'w-full min-w-[7rem] rounded border bg-surface px-1.5 py-1 text-sm tabular-nums text-text outline-none',
            problem ? 'border-danger' : 'border-brand',
          )}
        />
        {problem ? <p className="mt-1 max-w-[16rem] text-[11px] text-danger">{problem}</p> : null}
        {!problem && backwards ? (
          <p className="mt-1 max-w-[16rem] text-[11px] text-warning">
            Meters do not run backwards — yesterday this nozzle read{' '}
            {Number(previousReading).toLocaleString('en-IN')}.
          </p>
        ) : null}
        {!problem && !backwards && draft.trim() === '' && policy.dropsRowWhenBlank ? (
          <p className="mt-1 max-w-[16rem] text-[11px] text-warning">
            Leaving this empty removes the whole row from the report.
          </p>
        ) : null}
        {!problem && !backwards && draft.trim() === '' && policy.blankReadsAsZero ? (
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
      </div>
    );
  }

  const shown = inForce === '' ? '—' : inForce;

  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={open}
      onFocus={() => undefined}
      title={
        isCorrected || isPending
          ? `The portal says ${portalValue || '—'}${
              portalMoved ? ' (it changed after this was corrected)' : ''
            }`
          : policy.usedByReport
            ? 'Used by the report.'
            : 'Stored, but no calculation reads this.'
      }
      className={cn(
        'group relative min-w-[7rem] rounded px-1.5 py-1 text-left text-sm tabular-nums',
        readOnly ? 'cursor-default' : 'hover:bg-surface-2',
        isPending && 'bg-info-soft font-semibold text-text',
        isCorrected && 'font-semibold text-text',
        !isPending && !isCorrected && (policy.usedByReport ? 'text-text' : 'text-text-subtle italic'),
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
      {isCorrected && !readOnly ? (
        <span
          role="link"
          tabIndex={0}
          className="mt-0.5 block text-[11px] font-semibold text-brand underline opacity-0 transition group-hover:opacity-100 focus:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            pending.setCell(code, rowKey, field, null);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            e.stopPropagation();
            pending.setCell(code, rowKey, field, null);
          }}
        >
          Use the portal’s value
        </span>
      ) : null}
      {isPending ? (
        <span
          role="link"
          tabIndex={0}
          className="mt-0.5 block text-[11px] font-semibold text-brand underline"
          onClick={(e) => {
            e.stopPropagation();
            pending.clearCell(code, rowKey, field);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            e.stopPropagation();
            pending.clearCell(code, rowKey, field);
          }}
        >
          Undo this edit
        </span>
      ) : null}
      {productLabel === undefined && policy.usedByReport ? (
        <span className="mt-0.5 block text-[11px] text-warning">Not read by any product</span>
      ) : null}
    </button>
  );
}

/** A cell on a row that only exists as a pending addition — always editable. */
function NewRowCell({
  code,
  field,
  value,
  onChange,
}: {
  code: IrasReportCode;
  field: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const problem = validateIrasCell(code, field, value);
  const policy = irasFieldPolicy(code, field);
  return (
    <div className="min-w-[7rem]">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={policy.usedByReport ? 'required' : ''}
        aria-label={`${field} on the new row`}
        aria-invalid={problem ? true : undefined}
        className={cn(
          'w-full min-w-[7rem] rounded border bg-surface px-1.5 py-1 text-sm tabular-nums text-text outline-none',
          problem ? 'border-danger' : 'border-border focus:border-brand',
        )}
      />
      {problem ? <p className="mt-1 text-[11px] text-danger">{problem}</p> : null}
    </div>
  );
}

/* ──────────────────────────────── row gutter ─────────────────────────────── */

function ProductTag({ product }: { product: EditGridProduct | undefined }) {
  if (!product) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-warning">
        <AlertTriangle width={11} height={11} strokeWidth={2} />
        No product reads this row
      </span>
    );
  }
  return <span className="text-[11px] text-text-subtle">→ {product.labelEn}</span>;
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
}: {
  label: string;
  product: EditGridProduct | undefined;
  excluded: boolean;
  corrections: number;
  readOnly: boolean;
  canRestore: boolean;
  onExclude: () => void;
  onRestore: () => void;
  onRevertRow: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs font-medium text-text">
        {label}
        {readOnly ? null : (
          <Menu
            trigger={
              <button
                type="button"
                aria-label={`Actions for ${label}`}
                className="rounded p-0.5 text-text-subtle hover:bg-surface-2 hover:text-text"
              >
                <MoreVertical width={13} height={13} strokeWidth={2} />
              </button>
            }
          >
            {canRestore ? (
              <MenuItem onSelect={onRestore} icon={<Undo2 width={14} height={14} />}>
                Put this row back in the report
              </MenuItem>
            ) : (
              <MenuItem onSelect={onExclude} icon={<RotateCcw width={14} height={14} />}>
                {excluded ? 'Keep this row' : 'Leave this row out of the report'}
              </MenuItem>
            )}
            {corrections > 0 ? (
              <MenuItem onSelect={onRevertRow} icon={<Undo2 width={14} height={14} />}>
                Undo every correction on this row
              </MenuItem>
            ) : null}
          </Menu>
        )}
      </span>
      <ProductTag product={product} />
      {corrections > 0 ? (
        <span className="text-[11px] text-brand">
          {corrections} correction{corrections === 1 ? '' : 's'}
        </span>
      ) : null}
      {excluded ? <Badge intent="warning">Left out</Badge> : null}
    </div>
  );
}

/* ──────────────────────────────── add a row ─────────────────────────────── */

/**
 * Add a row the portal never sent.
 *
 * This is the commonest correction of all — a tanker decanted and nobody entered
 * it at the outlet — so it is a first-class button rather than something hidden in
 * a menu. The new row is pre-filled with the identity fields the report needs to
 * attribute it to a product, because a row missing those is invisible to the
 * report and the operator has no way to know that.
 */
function AddRowButton({
  code,
  products,
  pending,
}: {
  code: IrasReportCode;
  products: EditGridProduct[];
  pending: PendingApi;
}) {
  const label = code === 'TOT' ? 'nozzle reading' : code === 'STK' ? 'tank stock row' : 'delivery';

  function seed(product: EditGridProduct | undefined): IrasRow {
    if (code === 'TOT') {
      return {
        NOZZLE_NO: String(product?.nozzleNos[0] ?? ''),
        TOT_READING: '',
        TANK_NO: String(product?.tankNos[0] ?? ''),
      };
    }
    if (code === 'STK') {
      return { TANK_NO: String(product?.tankNos[0] ?? ''), NET_QTY: '', PRODUCT_DIP: '' };
    }
    return { TANK_NO: String(product?.tankNos[0] ?? ''), NET_QTY_DECANTED: '', INVOICE_NUMBER: '' };
  }

  if (products.length <= 1) {
    return (
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<Plus width={14} height={14} strokeWidth={2} />}
        onClick={() => pending.addRow(code, seed(products[0]))}
      >
        Add a {label}
      </Button>
    );
  }

  return (
    <Menu
      trigger={
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus width={14} height={14} strokeWidth={2} />}
        >
          Add a {label}
        </Button>
      }
    >
      {products.map((p) => (
        <MenuItem key={p.key} onSelect={() => pending.addRow(code, seed(p))}>
          For {p.labelEn} ({p.tankLabel})
        </MenuItem>
      ))}
    </Menu>
  );
}
