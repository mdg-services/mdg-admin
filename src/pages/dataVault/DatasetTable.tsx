import { Search, SearchX } from 'lucide-react';
import * as React from 'react';


import {
  Button,
  DownloadButton,
  Input,
  KeyValueList,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import type { KeyValueItem } from '@/components/ui';
import { cn } from '@/lib/cn';
import { irasFieldPolicy } from '@dk/shared';
import type { IrasDataset } from '@dk/shared';

/** Rows rendered before the "Show all" escape hatch kicks in. */
const INITIAL_ROWS = 50;

export interface DatasetTableProps {
  dataset: IrasDataset;
  /** Used to name the downloaded file, e.g. `PUMP01_2026-07-23`. */
  filePrefix: string;
  className?: string;
}

/**
 * One CSV cell: neutralise spreadsheet formulas, then RFC-4180 quote.
 *
 * A leading `=`, `+`, `-` or `@` makes Excel/Sheets evaluate the cell as a
 * FORMULA on open, and quoting does not prevent it. These values come from a
 * third-party portal, so they are untrusted; a leading apostrophe forces text
 * and is not displayed. Mirrors csvCell in the backend export route.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Serialise a dataset exactly as it is displayed — the portal's own headers, in
 * the portal's own column order.
 */
function datasetToCsv(dataset: IrasDataset, rows: readonly Record<string, string>[]): string {
  const header = dataset.columns.map((c) => csvCell(c.headerName)).join(',');
  const body = rows.map((row) =>
    dataset.columns.map((c) => csvCell(row[c.field] ?? '')).join(','),
  );
  return [header, ...body].join('\r\n');
}

/** The MIME type the export is offered as. The BOM keeps Excel from mangling
 *  non-ASCII portal values. */
const CSV_TYPE = 'text/csv;charset=utf-8;';

/** How many of this report's columns a calculation reads — the card's opening set. */
function usedByReportCount(dataset: IrasDataset): number {
  const n = dataset.columns.filter(
    (c) => irasFieldPolicy(dataset.code, c.field).usedByReport,
  ).length;
  // At least one: with none marked, `KeyValueList` would fall back to the first
  // `collapseAfter` items and a zero would render an empty card.
  return Math.max(n, 1);
}

/** One portal row as key/value items, the report's own columns marked primary. */
function rowItems(dataset: IrasDataset, row: Record<string, string>): KeyValueItem[] {
  return dataset.columns.map((col) => ({
    key: col.field,
    label: col.headerName,
    value: row[col.field] || '—',
    numeric: true,
    primary: irasFieldPolicy(dataset.code, col.field).usedByReport,
  }));
}

/**
 * The generic IRAS report table.
 *
 * Every column comes from `dataset.columns`, so a report the pipeline learns to
 * collect tomorrow renders here today with no code change. Wide reports scroll
 * horizontally inside their own container (never the page body) with the first
 * column pinned; below `md` the same rows become key/value cards, because a
 * 20-column table is unusable on a phone.
 */
export function DatasetTable({ dataset, filePrefix, className }: DatasetTableProps) {
  const [query, setQuery] = React.useState('');
  const [limit, setLimit] = React.useState(INITIAL_ROWS);

  const needle = query.trim().toLowerCase();
  const rows = React.useMemo(() => {
    if (!needle) return dataset.rows;
    return dataset.rows.filter((row) =>
      dataset.columns.some((c) =>
        (row[c.field] ?? '').toLowerCase().includes(needle),
      ),
    );
  }, [dataset.rows, dataset.columns, needle]);

  // A new search starts from the top of the list again.
  React.useEffect(() => {
    setLimit(INITIAL_ROWS);
  }, [needle]);

  const visible = rows.slice(0, limit);
  const hidden = rows.length - visible.length;
  const filtered = needle.length > 0;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            width={15}
            height={15}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filter ${dataset.code} rows`}
            aria-label={`Filter ${dataset.label} rows`}
            className="pl-9"
          />
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-xs tabular-nums text-text-subtle">
            {filtered
              ? `${rows.length} of ${dataset.rows.length} rows`
              : `${dataset.rows.length} rows`}
          </span>
          {/*
            The rows are all in the snapshot payload already, so the file is
            built here rather than fetched — a bare navigation to the server's
            export route could not carry the bearer token. That means it exists
            only as a blob, and a `blob:` URL cannot reach Android's download
            manager: inside the shell this is a download that CANNOT succeed.
            `DownloadButton` is what makes that honest — it says so in a toast
            instead of being a tap that does nothing and reports nothing. The
            real fix is a signed export URL on the backend.
          */}
          <DownloadButton
            variant="secondary"
            size="sm"
            label="Download CSV"
            filename={`${filePrefix}_${dataset.code}.csv`}
            contentType={CSV_TYPE}
            blob={() =>
              new Blob(['\ufeff', datasetToCsv(dataset, rows)], { type: CSV_TYPE })
            }
            disabled={rows.length === 0}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-6 text-sm text-text-muted">
          <SearchX width={16} height={16} strokeWidth={1.75} />
          {filtered
            ? `No ${dataset.code} row matches “${query.trim()}”.`
            : 'The portal returned no rows for this report.'}
        </div>
      ) : (
        <>
          {/* Desktop (≥ md): the portal's own grid, scrolled inside its own box
              with the first column pinned so a wide report stays readable. */}
          <div className="hidden overflow-hidden rounded-md border border-border md:block">
            {/* `freezeFirstColumn` replaces the four hand-written sticky classes
                this file used to carry — same rules, one place, and the header's
                corner cell now beats the body's frozen cells on both axes. */}
            <Table freezeFirstColumn>
              <THead>
                <TRow>
                  {dataset.columns.map((col) => (
                    <TH key={col.field} className="whitespace-nowrap">
                      {col.headerName}
                    </TH>
                  ))}
                </TRow>
              </THead>
              <TBody>
                {visible.map((row, rowIndex) => (
                  <TRow key={rowIndex}>
                    {dataset.columns.map((col, i) => (
                      <TD
                        key={col.field}
                        className={cn(
                          'whitespace-nowrap tabular-nums',
                          i === 0 ? 'font-medium' : 'text-text-muted',
                        )}
                      >
                        {row[col.field] || '—'}
                      </TD>
                    ))}
                  </TRow>
                ))}
              </TBody>
            </Table>
          </div>

          {/*
            Mobile (< md): one key/value card per row, opening on the columns the
            report actually reads. A portal report carries its full column set —
            up to 36 — so rendering every one of them made a single TOT row a
            ~36-line card and a 13-row report ~470 lines of key/value inside a
            95dvh sheet, with no way to narrow it. The same `usedByReport`
            predicate the day editor uses decides what opens; `Show all N fields`
            is there when the answer is not in the short list.
          */}
          <ul className="grid gap-2 md:hidden">
            {visible.map((row, rowIndex) => (
              <li
                key={rowIndex}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <KeyValueList
                  items={rowItems(dataset, row)}
                  collapseAfter={usedByReportCount(dataset)}
                />
              </li>
            ))}
          </ul>

          {hidden > 0 ? (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLimit(rows.length)}
              >
                Show {hidden} more row{hidden === 1 ? '' : 's'}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
