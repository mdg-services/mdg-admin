import * as React from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';

import { MobileCardList, type MobileCard, type MobileCardKv } from './MobileCardList';
import { Skeleton } from './Skeleton';
import { Table, TBody, TD, TH, THead, TRow } from './Table';

/** Where a column lands on the phone card. */
export type DataColumnSlot =
  | 'primary'
  | 'primaryRight'
  | 'secondary'
  | 'meta'
  | 'kv'
  | 'hidden';

export interface DataColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Default `'kv'` — an unassigned column becomes a label/value row on the
   *  card rather than disappearing. The first column is the card's title
   *  unless some other column claims `'primary'`. */
  mobile?: DataColumnSlot;
  /** Short label for the card's kv row; falls back to `header`. */
  mobileLabel?: React.ReactNode;
  align?: 'left' | 'right';
  /** Right-aligned, tabular figures, never wraps. */
  numeric?: boolean;
  /** Desktop-only width hint, e.g. `'9.5rem'`. Ignored below md. */
  width?: string;
  /** One line with an ellipsis at md+. Pair it with `width`: a table cell has
   *  no width of its own to truncate against, so the `max-w-0` that makes the
   *  ellipsis appear also lets the column shrink to its share of the row. */
  truncate?: boolean;
  thClassName?: string;
  tdClassName?: string;
}

export interface DataListProps<T> {
  rows: readonly T[];
  columns: readonly DataColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Per-row overflow menu — the last table column at md+, the top right of the
   *  card below it. Pass a `<Menu>`; the cell stops the click from reaching the
   *  row. */
  rowActions?: (row: T) => React.ReactNode;
  /** Footer buttons on the phone card. Not rendered when `onRowClick` is set —
   *  a tappable card is one button and buttons never nest. */
  cardActions?: (row: T) => React.ReactNode;
  /** Shown instead of the list when there are no rows. */
  empty?: React.ReactNode;
  loading?: boolean;
  skeletonRows?: number;
  freezeFirstColumn?: boolean;
  stickyHeader?: boolean;
  maxHeight?: string;
  minWidth?: string;
  /** Force one shape. `'auto'` (default) is a table at md+ and cards below it;
   *  `'cards'` is the honest answer inside a drawer or a narrow tab column,
   *  which is narrow at every viewport width. */
  shape?: 'auto' | 'table' | 'cards';
  /** Classes for the list container — the table's scroll wrapper, or the card
   *  stack's `<ul>`. */
  className?: string;
}

const DEFAULT_SKELETON_ROWS = 3;

/**
 * One column definition, two shapes: a `<Table>` at md+ and a card stack below.
 *
 * Twenty-two screens currently hand-write both trees for the same rows, and
 * they have drifted — several phone card stacks silently drop a column the
 * desktop table shows (the warning count, the "Reconciles" verdict, the
 * recency date), which is not a layout difference but a different report. Both
 * trees also mount at every width, because `hidden md:block` only *hides* one:
 * a 1,000-row history builds ~2,000 subtrees on a low-end WebView.
 *
 * Here the breakpoint is decided once in JS and exactly one branch mounts, the
 * desktop branch emits `Table`/`THead`/`TRow`/`TD` verbatim so a migrated table
 * is unchanged at md+, and the card is *derived* from the columns — so a new
 * table cannot ship without a phone form.
 *
 * Mandatory for new tables. Existing, correct `Table` + `MobileCardList` pairs
 * are fine as they are; this is not a 27-file migration.
 *
 * @example
 * <DataList
 *   rows={admins}
 *   rowKey={(a) => a.id}
 *   onRowClick={(a) => open(a.id)}
 *   columns={[
 *     { id: 'name', header: 'Name', cell: (a) => a.name, mobile: 'primary' },
 *     { id: 'role', header: 'Role', cell: (a) => <Badge>{a.role}</Badge>, mobile: 'primaryRight' },
 *     { id: 'email', header: 'Email', cell: (a) => a.email, mobile: 'secondary' },
 *     { id: 'points', header: 'Points', cell: (a) => a.points, numeric: true },
 *     { id: 'seen', header: 'Last seen', cell: (a) => fmt(a.seenAt), mobile: 'meta' },
 *   ]}
 *   rowActions={(a) => (
 *     <Menu label={`Actions for ${a.name}`}>
 *       <MenuItem onSelect={() => suspend(a)}>Suspend</MenuItem>
 *     </Menu>
 *   )}
 *   empty={<EmptyState title="No teammates yet" />}
 * />
 */
export function DataList<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowActions,
  cardActions,
  empty,
  loading = false,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  freezeFirstColumn,
  stickyHeader,
  maxHeight,
  minWidth,
  shape = 'auto',
  className,
}: DataListProps<T>) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const asTable = shape === 'table' || (shape === 'auto' && isMd);

  if (!loading && rows.length === 0) {
    return <>{empty ?? <DefaultEmpty />}</>;
  }

  return asTable ? (
    <TableShape
      rows={rows}
      columns={columns}
      rowKey={rowKey}
      onRowClick={onRowClick}
      rowActions={rowActions}
      loading={loading}
      skeletonRows={skeletonRows}
      freezeFirstColumn={freezeFirstColumn}
      stickyHeader={stickyHeader}
      maxHeight={maxHeight}
      minWidth={minWidth}
      className={className}
    />
  ) : (
    <CardShape
      rows={rows}
      columns={columns}
      rowKey={rowKey}
      onRowClick={onRowClick}
      rowActions={rowActions}
      cardActions={cardActions}
      loading={loading}
      skeletonRows={skeletonRows}
      className={className}
    />
  );
}

function DefaultEmpty() {
  return (
    <p className="px-3 py-6 text-center text-sm text-text-muted">
      Nothing to show.
    </p>
  );
}

/** Alignment and wrapping for one column, shared by the header and the cell. */
function alignClass<T>(col: DataColumn<T>): string | false {
  if (col.numeric) return 'whitespace-nowrap text-right tabular-nums';
  return col.align === 'right' && 'text-right';
}

function TableShape<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowActions,
  loading,
  skeletonRows,
  freezeFirstColumn,
  stickyHeader,
  maxHeight,
  minWidth,
  className,
}: Pick<
  DataListProps<T>,
  | 'rows'
  | 'columns'
  | 'rowKey'
  | 'onRowClick'
  | 'rowActions'
  | 'freezeFirstColumn'
  | 'stickyHeader'
  | 'maxHeight'
  | 'minWidth'
  | 'className'
> & { loading: boolean; skeletonRows: number }) {
  return (
    <Table
      freezeFirstColumn={freezeFirstColumn}
      stickyHeader={stickyHeader}
      maxHeight={maxHeight}
      minWidth={minWidth}
      wrapperClassName={className}
    >
      <THead>
        <TRow>
          {columns.map((col) => (
            <TH
              key={col.id}
              className={cn(alignClass(col), col.thClassName)}
              style={col.width ? { width: col.width } : undefined}
            >
              {col.header}
            </TH>
          ))}
          {rowActions ? (
            <TH className="w-px">
              <span className="sr-only">Actions</span>
            </TH>
          ) : null}
        </TRow>
      </THead>
      <TBody>
        {loading
          ? Array.from({ length: skeletonRows }, (_, i) => (
              <TRow key={`skeleton-${i}`}>
                {columns.map((col) => (
                  <TD key={col.id}>
                    <Skeleton className="h-4 w-full" />
                  </TD>
                ))}
                {rowActions ? (
                  <TD>
                    <Skeleton className="h-4 w-4" />
                  </TD>
                ) : null}
              </TRow>
            ))
          : rows.map((row) => (
              <TRow
                key={rowKey(row)}
                clickable={Boolean(onRowClick)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <TD
                    key={col.id}
                    className={cn(
                      alignClass(col),
                      col.truncate && 'max-w-0 truncate',
                      col.tdClassName,
                    )}
                  >
                    {col.cell(row)}
                  </TD>
                ))}
                {rowActions ? (
                  // The menu lives inside a clickable row, so its own clicks
                  // must not also open the row behind it.
                  <TD
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {rowActions(row)}
                  </TD>
                ) : null}
              </TRow>
            ))}
      </TBody>
    </Table>
  );
}

function CardShape<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowActions,
  cardActions,
  loading,
  skeletonRows,
  className,
}: Pick<
  DataListProps<T>,
  | 'rows'
  | 'columns'
  | 'rowKey'
  | 'onRowClick'
  | 'rowActions'
  | 'cardActions'
  | 'className'
> & { loading: boolean; skeletonRows: number }) {
  if (loading) {
    return (
      <ul className={cn('grid gap-2', className)}>
        {Array.from({ length: skeletonRows }, (_, i) => (
          <li
            key={`skeleton-${i}`}
            className="rounded-lg border border-border bg-surface p-3"
          >
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </li>
        ))}
      </ul>
    );
  }

  const hasExplicitPrimary = columns.some((c) => c.mobile === 'primary');
  const slotOf = (col: DataColumn<T>, index: number): DataColumnSlot =>
    col.mobile ?? (index === 0 && !hasExplicitPrimary ? 'primary' : 'kv');

  const inSlot = (slot: DataColumnSlot) =>
    columns.filter((col, i) => slotOf(col, i) === slot);

  const primaryCols = inSlot('primary');
  const rightCols = inSlot('primaryRight');
  const secondaryCols = inSlot('secondary');
  const metaCols = inSlot('meta');
  const kvCols = inSlot('kv');

  const cards: MobileCard[] = rows.map((row) => {
    const actionsNode = rowActions?.(row);
    // A card with an overflow menu cannot also be one big button — buttons do
    // not nest — so the title becomes the tap target instead and the menu sits
    // beside it. Whole-card tap is kept whenever there is no menu, which is the
    // common case.
    const titleIsTarget = Boolean(onRowClick) && actionsNode != null;

    const primaryContent = <SlotCells cols={primaryCols} row={row} />;
    const kv: MobileCardKv[] = kvCols.map((col) => ({
      label: col.mobileLabel ?? col.header,
      value: col.cell(row),
      numeric: col.numeric,
    }));

    return {
      key: rowKey(row),
      onClick:
        onRowClick && !titleIsTarget ? () => onRowClick(row) : undefined,
      primary:
        titleIsTarget && onRowClick ? (
          <button
            type="button"
            onClick={() => onRowClick(row)}
            className="flex min-h-11 w-full items-center text-left"
          >
            {primaryContent}
          </button>
        ) : (
          primaryContent
        ),
      primaryRight:
        rightCols.length > 0 || actionsNode != null ? (
          <>
            <SlotCells cols={rightCols} row={row} justify="end" />
            {actionsNode}
          </>
        ) : undefined,
      primaryRightWidth:
        rightCols.length > 1 || (rightCols.length > 0 && actionsNode != null)
          ? 'clamp'
          : 'auto',
      secondary:
        secondaryCols.length > 0 ? (
          <SlotCells cols={secondaryCols} row={row} />
        ) : undefined,
      meta: metaCols.length > 0 ? <SlotCells cols={metaCols} row={row} /> : undefined,
      kv: kv.length > 0 ? kv : undefined,
      actions: onRowClick ? undefined : cardActions?.(row),
    };
  });

  return (
    <MobileCardList
      cards={cards}
      className={className}
      // The branch is already chosen in JS; leaving `md:hidden` on would blank
      // the stack for a caller that asked for `shape="cards"` on a desktop.
      visibility="all"
    />
  );
}

/** The cells of one card slot, wrapping rather than clipping. */
function SlotCells<T>({
  cols,
  row,
  justify,
}: {
  cols: readonly DataColumn<T>[];
  row: T;
  justify?: 'end';
}) {
  if (cols.length === 0) return null;
  return (
    <span
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1',
        justify === 'end' && 'justify-end',
      )}
    >
      {cols.map((col) => (
        <span key={col.id} className="min-w-0 break-words">
          {col.cell(row)}
        </span>
      ))}
    </span>
  );
}
