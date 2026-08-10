import { Download, Search, SearchX } from 'lucide-react';
import * as React from 'react';


import {
  Button,
  Input,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import { cn } from '@/lib/cn';
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

/**
 * Save a CSV from data already in the browser. The rows are all present in the
 * snapshot payload, so there is nothing to fetch — and a bare navigation to the
 * server's export route could not carry the bearer token anyway. The BOM keeps
 * Excel from mangling non-ASCII portal values.
 */
function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(
    new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking in the same tick cancels the download in Firefox and Safari, which
  // read the blob asynchronously after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download width={14} height={14} strokeWidth={1.75} />}
            onClick={() =>
              downloadCsv(
                `${filePrefix}_${dataset.code}.csv`,
                datasetToCsv(dataset, rows),
              )
            }
            disabled={rows.length === 0}
          >
            Download CSV
          </Button>
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
            <Table>
              <THead>
                <TRow>
                  {dataset.columns.map((col, i) => (
                    <TH
                      key={col.field}
                      className={cn(
                        'whitespace-nowrap',
                        i === 0 && 'sticky left-0 z-20 bg-surface-2',
                      )}
                    >
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
                          i === 0
                            ? 'sticky left-0 z-10 bg-surface font-medium'
                            : 'text-text-muted',
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

          {/* Mobile (< md): one key/value card per row. */}
          <ul className="grid gap-2 md:hidden">
            {visible.map((row, rowIndex) => (
              <li
                key={rowIndex}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <dl className="grid gap-1 text-sm">
                  {dataset.columns.map((col) => (
                    <div
                      key={col.field}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <dt className="shrink-0 text-text-muted">
                        {col.headerName}
                      </dt>
                      <dd className="min-w-0 break-words text-right font-medium tabular-nums text-text">
                        {row[col.field] || '—'}
                      </dd>
                    </div>
                  ))}
                </dl>
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
