import {
  AlertCircle,
  ClipboardCheck,
  DownloadCloud,
  FileText,
  Files,
  Layers,
} from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Drawer,
  EmptyState,
  MobileCardList,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  useToast,
} from '@/components/ui';
import {
  useCollectInspection,
  useInspectionSummary,
} from '@/hooks/api/useInspectionReports';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { StatTile, StatTileRow, StatTileSkeletons } from '@/pages/dataVault/StatTile';
import {
  INSPECTION_REPORT_KIND_LABELS,
  type InspectionColumn,
  type InspectionReportDetail,
  type InspectionReportItem,
  type InspectionReportSection,
  type InspectionReportSummary,
} from '@dk/shared';

import type { DealerVaultPaneProps } from './types';

/**
 * The columns to render for the latest reports. Prefer the portal's own headers;
 * if a capture recorded rows but no column metadata, derive columns from the
 * union of cell keys (first-seen order) so nothing the portal showed is hidden.
 */
function effectiveColumns(summary: InspectionReportSummary): InspectionColumn[] {
  if (summary.columns.length > 0) return summary.columns;
  const seen = new Map<string, InspectionColumn>();
  for (const item of summary.latest) {
    for (const field of Object.keys(item.cells)) {
      if (!seen.has(field)) seen.set(field, { field, headerName: field });
    }
  }
  return [...seen.values()];
}

/** A short label for one report row, for the mobile card heading. */
function itemHeading(item: InspectionReportItem, index: number): string {
  return item.dateLabel || item.ref || `Report ${index + 1}`;
}

/**
 * A dealer's Inspection Reports: the latest few reports captured from e-Mitra and
 * how many more the portal holds ("N more inspection reports"). Mirrors the
 * cross-dealer Vault datasets — a digest tile row, then the data — scoped to one
 * dealer, with a "Capture now" button that reuses the normal run machinery.
 */
export function DealerInspectionPane({ dealer }: DealerVaultPaneProps) {
  const toast = useToast();
  const summaryQ = useInspectionSummary(dealer.id);
  const collect = useCollectInspection(dealer.id);
  // The full report opened from a row (declared up here — hooks run before the
  // loading/empty early-returns below).
  const [openReport, setOpenReport] = React.useState<{
    heading: string;
    detail: InspectionReportDetail;
  } | null>(null);

  function runCapture() {
    collect.mutate(undefined, {
      onSuccess: () =>
        toast.success(
          'Capture queued — the portal takes about a minute. This section refreshes when it lands.',
        ),
      onError: (err) =>
        toast.error(
          err instanceof ApiError ? err.message : 'Could not start the capture',
        ),
    });
  }

  const captureButton = (
    <Button
      variant="secondary"
      size="sm"
      loading={collect.isPending}
      leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
      onClick={runCapture}
    >
      Capture now
    </Button>
  );

  if (summaryQ.isLoading) {
    return (
      <div className="grid gap-4">
        <StatTileSkeletons count={3} />
        <Card>
          <CardContent className="grid gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (summaryQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load inspection reports"
        description={
          summaryQ.error instanceof ApiError ? summaryQ.error.message : 'Please try again.'
        }
        cta={captureButton}
      />
    );
  }

  const summary = summaryQ.data!;
  const kindLabel = INSPECTION_REPORT_KIND_LABELS[summary.kind] ?? 'Inspection';
  const columns = effectiveColumns(summary);
  // The portal's own "VIEW REPORT" column held a dead "VIEW" label; we render a
  // real action instead, so drop it from the data columns.
  const dataColumns = columns.filter(
    (c) => !/view/i.test(c.headerName) && !/view/i.test(c.field),
  );

  /** The "View report" control for a row, or a dash when no report was captured. */
  function reportAction(item: InspectionReportItem, i: number): React.ReactNode {
    const detail = item.report;
    if (!detail || detail.sections.length === 0) {
      return <span className="text-text-subtle">—</span>;
    }
    return (
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<FileText width={14} height={14} strokeWidth={1.75} />}
        onClick={() => setOpenReport({ heading: itemHeading(item, i), detail })}
      >
        View report
      </Button>
    );
  }
  const neverCaptured = !summary.capturedAt;
  const failed = summary.status === 'FAILED' || !!summary.failureReason;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text">Inspection Reports</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            {kindLabel} · Last captured{' '}
            {summary.capturedAt ? formatDateTime(summary.capturedAt) : 'never'}
          </p>
        </div>
        {captureButton}
      </div>

      {failed ? (
        <Card className="border-danger/40 bg-danger-soft/40">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle
              width={18}
              height={18}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-danger"
            />
            <div>
              <p className="text-sm font-semibold text-text">
                The latest capture did not complete
              </p>
              <p className="text-sm text-text-muted">
                {summary.failureReason ??
                  'The portal could not be read. Any previously captured reports are kept below.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {neverCaptured && summary.total === 0 && summary.latest.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <EmptyState
              icon={<ClipboardCheck width={28} height={28} strokeWidth={1.75} />}
              title="No inspection reports captured yet"
              description="Once the Inspection Reports service runs for this dealer, the latest reports on their outlet appear here."
              cta={captureButton}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <StatTileRow>
            <StatTile
              label="Total reports"
              value={summary.total}
              tone="neutral"
              icon={<Files width={16} height={16} strokeWidth={1.75} />}
              hint="On the portal for this outlet"
            />
            <StatTile
              label="Showing latest"
              value={summary.latest.length}
              tone="neutral"
              icon={<ClipboardCheck width={16} height={16} strokeWidth={1.75} />}
              hint="Captured into the vault"
            />
            <StatTile
              label="More on portal"
              value={summary.moreCount}
              tone="warning"
              icon={<Layers width={16} height={16} strokeWidth={1.75} />}
              hint={
                summary.moreCount > 0
                  ? 'Beyond the ones shown'
                  : 'All captured reports shown'
              }
            />
          </StatTileRow>

          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                <div>
                  <p className="text-base font-semibold text-text">
                    Latest inspection reports
                  </p>
                  <p className="text-sm text-text-muted">
                    The most recent reports captured from the e-Mitra portal.
                  </p>
                </div>
                {summary.total > 0 ? (
                  <Badge intent="neutral" className="tabular-nums">
                    {summary.latest.length} of {summary.total.toLocaleString('en-IN')}
                  </Badge>
                ) : null}
              </div>

              {summary.latest.length === 0 ? (
                <EmptyState
                  icon={<ClipboardCheck width={28} height={28} strokeWidth={1.75} />}
                  title="No reports on the portal"
                  description="The last capture found no inspection reports for this outlet."
                />
              ) : (
                <>
                  {/* Desktop table (≥ md). Columns come straight from the portal;
                      the pane's `min-w-0` track keeps a wide table scrolling inside
                      the card rather than sideways across the page. */}
                  <div className="hidden md:block">
                    <Table>
                      <THead>
                        <TRow>
                          {dataColumns.map((c) => (
                            <TH key={c.field}>{c.headerName}</TH>
                          ))}
                          <TH className="text-right">Report</TH>
                        </TRow>
                      </THead>
                      <TBody>
                        {summary.latest.map((item, i) => (
                          <TRow key={item.ref ?? i}>
                            {dataColumns.map((c) => (
                              <TD key={c.field} className="whitespace-nowrap">
                                {item.cells[c.field] || '—'}
                              </TD>
                            ))}
                            <TD className="whitespace-nowrap text-right">
                              {reportAction(item, i)}
                            </TD>
                          </TRow>
                        ))}
                      </TBody>
                    </Table>
                  </div>

                  {/* Mobile card-stack (< md). Tapping a card opens its report. */}
                  <MobileCardList
                    className="p-3"
                    cards={summary.latest.map((item, i) => {
                      const detail =
                        item.report && item.report.sections.length > 0
                          ? item.report
                          : null;
                      return {
                        key: item.ref ?? String(i),
                        onClick: detail
                          ? () =>
                              setOpenReport({ heading: itemHeading(item, i), detail })
                          : undefined,
                        primary: (
                          <span className="block truncate font-medium text-text">
                            {itemHeading(item, i)}
                          </span>
                        ),
                        primaryRight: detail ? (
                          <span className="whitespace-nowrap text-xs font-medium text-brand">
                            View report ›
                          </span>
                        ) : undefined,
                        secondary: item.ref ? (
                          <span className="font-mono text-xs">{item.ref}</span>
                        ) : undefined,
                        meta: (
                          <span className="flex flex-col gap-0.5">
                            {dataColumns.map((c) =>
                              item.cells[c.field] ? (
                                <span key={c.field}>
                                  <span className="text-text-subtle">{c.headerName}: </span>
                                  {item.cells[c.field]}
                                </span>
                              ) : null,
                            )}
                          </span>
                        ),
                      };
                    })}
                  />
                </>
              )}

              {summary.moreCount > 0 ? (
                <div className="flex items-center gap-2 border-t border-border p-4 text-sm text-text-muted">
                  <Layers
                    width={16}
                    height={16}
                    strokeWidth={1.75}
                    className="shrink-0 text-text-subtle"
                  />
                  <span>
                    There{' '}
                    {summary.moreCount === 1
                      ? 'is 1 more inspection report'
                      : `are ${summary.moreCount.toLocaleString('en-IN')} more inspection reports`}{' '}
                    on the portal beyond the ones shown here.
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}

      <Drawer
        open={!!openReport}
        onClose={() => setOpenReport(null)}
        width="lg"
        title="Retail Outlet Inspection & Analysis Report"
        description={openReport ? `Inspection ${openReport.heading}` : undefined}
        footer={
          <Button variant="ghost" onClick={() => setOpenReport(null)}>
            Close
          </Button>
        }
      >
        {openReport ? <ReportView detail={openReport.detail} /> : null}
      </Drawer>
    </div>
  );
}

/** Renders a captured report's parsed sections as stacked tables (Form SL.5(R)). */
function ReportView({ detail }: { detail: InspectionReportDetail }) {
  if (detail.sections.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        This report was captured but could not be parsed into sections.
      </p>
    );
  }
  return (
    <div className="grid gap-4">
      {detail.sections.map((section, i) => (
        <ReportSection key={i} section={section} />
      ))}
    </div>
  );
}

/** One report section — a generic bordered table of the portal's own cells. */
function ReportSection({ section }: { section: InspectionReportSection }) {
  if (section.rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {section.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`border border-border px-2.5 py-1.5 align-top ${
                    row.length === 1
                      ? 'bg-surface-2 font-semibold text-text'
                      : 'text-text'
                  }`}
                >
                  {cell || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
