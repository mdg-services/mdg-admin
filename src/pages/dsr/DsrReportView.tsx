import { AlertCircle, Download, FileBarChart2 } from 'lucide-react';
import * as React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { DsrReportPanel, dsrDateLabel } from './DsrReportPanel';
import { GenerateDsrButton } from './GenerateDsrButton';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Label,
  Select,
  Skeleton,
} from '@/components/ui';
import {
  useDsrLatest,
  useDsrReport,
  useDsrReports,
} from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

/** A 404 from the report endpoints just means "nothing generated yet". */
function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/** Kick off a signed-URL download without leaving a blank tab behind. */
function triggerDownload(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * One dealer's Daily Sales Report, output-first: the rendered HTML report is the
 * hero, the stock-variation cards restate the headline, and a date selector steps
 * across their history. The selected report id lives in the URL, so any day is a
 * shareable link.
 */
export function DsrReportView() {
  const { dealerId } = useParams<{ dealerId: string }>();
  const [search, setSearch] = useSearchParams();
  const reportParam = search.get('report');

  const reportsQ = useDsrReports(dealerId);
  const reports = reportsQ.data?.reports ?? [];

  // Exactly one of these is enabled: a specific report by id, or the dealer's
  // latest when no report is pinned in the URL.
  const byIdQ = useDsrReport(reportParam ?? undefined);
  const latestQ = useDsrLatest(reportParam ? undefined : dealerId);
  const reportQ = reportParam ? byIdQ : latestQ;

  const report = reportQ.data;
  const dealerName =
    report?.dealerName ?? reports.find((r) => r.dealerName)?.dealerName ?? null;

  function selectReport(id: string) {
    const next = new URLSearchParams(search);
    // Selecting the newest report is the same as "no pin" — keep the URL clean.
    if (id === reports[0]?.id) next.delete('report');
    else next.set('report', id);
    setSearch(next, { replace: true });
  }

  const noReportYet =
    (reportQ.isError && isNotFound(reportQ.error)) ||
    (!reportQ.isLoading && !reportQ.isError && !report && reports.length === 0);

  const actions =
    report && !noReportYet ? (
      <>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Download width={14} height={14} strokeWidth={1.75} />}
          disabled={!report.jsonUrl}
          onClick={() => report.jsonUrl && triggerDownload(report.jsonUrl)}
        >
          Download JSON
        </Button>
        <GenerateDsrButton
          dealerId={report.dealerId}
          businessDate={report.businessDate}
          label="Regenerate"
          onQueued={() => {
            // Snap back to "latest" so the freshly generated report is what
            // shows once the run lands.
            const next = new URLSearchParams(search);
            next.delete('report');
            setSearch(next, { replace: true });
          }}
        />
      </>
    ) : null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Daily Sales Report', to: '/dsr' },
          { label: dealerName ?? 'Dealer' },
        ]}
        title={dealerName ?? 'Daily Sales Report'}
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

      {/* Toolbar: pick a business date. */}
      {reports.length > 0 ? (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-end justify-between gap-3 p-3">
            <div>
              <Label htmlFor="dsr-date">Business date</Label>
              <Select
                id="dsr-date"
                value={report?.id ?? reports[0]?.id ?? ''}
                onChange={(e) => selectReport(e.target.value)}
                className="w-full sm:w-72"
              >
                {reports.map((r, i) => (
                  <option key={r.id} value={r.id}>
                    {dsrDateLabel(r.businessDate)}
                    {i === 0 ? ' · latest' : ''}
                  </option>
                ))}
              </Select>
            </div>
            {report ? (
              <p className="text-xs text-text-subtle">
                Generated {formatDateTime(report.generatedAt)}
              </p>
            ) : null}
          </CardContent>
        </Card>
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
          description="Generate this dealer's Daily Sales Report and it will render here."
          cta={
            dealerId ? (
              <GenerateDsrButton
                dealerId={dealerId}
                variant="primary"
                label="Generate now"
              />
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
