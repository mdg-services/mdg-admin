import { AlertCircle, FileBarChart2, IndianRupee } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';


import { PageHeader } from '@/components/layout/PageHeader';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import {
  useDsrLatest,
  useDsrReport,
  useDsrReports,
} from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import { dealerCodeLabel } from '@dk/shared';

import { DsrReportPanel } from './DsrReportPanel';
import { DsrDateToolbar, DsrReportActions } from './DsrToolbar';
import { EditShiftDataButton } from './EditShiftDataButton';
import { GenerateDsrButton, GenerateDsrForDate } from './GenerateDsrButton';

/** A 404 from the report endpoints just means "nothing generated yet". */
function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/**
 * One dealer's Daily Sales Report, output-first: the rendered HTML report is the
 * hero, the stock-variation cards restate the headline, and a date selector steps
 * across their history. The selected report id lives in the URL, so any day is a
 * shareable link.
 */
export function DsrReportView() {
  const { dealerId } = useParams<{ dealerId: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const reportParam = search.get('report');

  const reportsQ = useDsrReports(dealerId);
  const reports = React.useMemo(
    () => reportsQ.data?.reports ?? [],
    [reportsQ.data],
  );

  // Exactly one of these is enabled: a specific report by id, or the dealer's
  // latest when no report is pinned in the URL.
  const byIdQ = useDsrReport(reportParam ?? undefined);
  const latestQ = useDsrLatest(reportParam ? undefined : dealerId);
  const reportQ = reportParam ? byIdQ : latestQ;

  const report = reportQ.data;
  // The outlet code identifies the dealer; there is no name to fall back to.
  const outletCode =
    report?.outletCode ?? reports.find((r) => r.outletCode)?.outletCode ?? null;

  function selectReport(id: string) {
    const next = new URLSearchParams(search);
    // Selecting the newest report is the same as "no pin" — keep the URL clean.
    if (id === reports[0]?.id) next.delete('report');
    else next.set('report', id);
    setSearch(next, { replace: true });
  }

  // Snap back to "latest" so a freshly generated report is what shows once its
  // run lands. Correct for "Generate now" (which targets today = the latest).
  function clearReportPin() {
    const next = new URLSearchParams(search);
    next.delete('report');
    setSearch(next, { replace: true });
  }

  // A date whose report we want to show as soon as it exists — set when an admin
  // generates a SPECIFIC day (a back-date or a regenerate). Because a back-date
  // is not the newest report, snapping to "latest" would hide it; instead we wait
  // for its row to appear in the refreshed list and select it.
  const [pendingDate, setPendingDate] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!pendingDate) return;
    const hit = reports.find((r) => r.businessDate === pendingDate);
    if (!hit) return;
    setPendingDate(null);
    const next = new URLSearchParams(search);
    if (hit.id === reports[0]?.id) next.delete('report');
    else next.set('report', hit.id);
    setSearch(next, { replace: true });
  }, [pendingDate, reports, search, setSearch]);

  const noReportYet =
    (reportQ.isError && isNotFound(reportQ.error)) ||
    (!reportQ.isLoading && !reportQ.isError && !report && reports.length === 0);

  const actions =
    report && !noReportYet ? (
      <DsrReportActions report={report} onRegenerated={setPendingDate} />
    ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Daily Sales Report', to: '/dsr' },
          { label: dealerCodeLabel(outletCode) },
        ]}
        actions={
          dealerId ? (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<IndianRupee width={14} height={14} strokeWidth={1.75} />}
              onClick={() => navigate(`/dsr/dealers/${dealerId}/pnl`)}
            >
              Fuel P&amp;L
            </Button>
          ) : undefined
        }
        title={`Daily Sales Report · ${dealerCodeLabel(outletCode)}`}
        subtitle={
          report
            ? [
                report.outletCode ? `Outlet ${report.outletCode}` : null,
                report.roCode ? `RO ${report.roCode}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || undefined
            : undefined
        }
      />

      {/* Toolbar: pick a past business date, or back-fill a new one. */}
      {reports.length > 0 && dealerId ? (
        <DsrDateToolbar
          className="mb-4"
          dealerId={dealerId}
          reports={reports}
          selectedId={report?.id ?? reports[0]?.id ?? ''}
          onSelect={selectReport}
          businessDate={report?.businessDate}
          generatedAt={report?.generatedAt}
          onGenerated={setPendingDate}
        />
      ) : null}

      {reportQ.isLoading ? (
        <div className="grid gap-4">
          <Skeleton className="h-[60vh] w-full" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      ) : noReportYet ? (
        <EmptyState
          icon={<FileBarChart2 width={28} height={28} strokeWidth={1.75} />}
          title="No report generated yet"
          description="Generate the latest available day, or pick a past date to back-fill one."
          cta={
            dealerId ? (
              // Full-width below md: `justify-items-center` sizes each item to
              // its content, so a `w-full` control inside it would resolve
              // against its own width and stay narrow.
              <div className="grid w-full gap-3 md:w-auto md:justify-items-center">
                <GenerateDsrButton
                  dealerId={dealerId}
                  variant="primary"
                  label="Generate now"
                  className="w-full md:w-auto"
                  onQueued={clearReportPin}
                />
                <GenerateDsrForDate
                  dealerId={dealerId}
                  onGenerated={setPendingDate}
                />
                <EditShiftDataButton
                  dealerId={dealerId}
                  className="w-full md:w-auto"
                />
              </div>
            ) : undefined
          }
        />
      ) : reportQ.isError || !report ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Could not load this report"
          description={
            reportQ.error instanceof ApiError
              ? reportQ.error.message
              : 'Please try again.'
          }
        />
      ) : (
        <DsrReportPanel report={report} actions={actions} />
      )}
    </div>
  );
}
