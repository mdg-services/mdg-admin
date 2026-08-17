import { AlertCircle, Download, ExternalLink, FileBarChart2 } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Label,
  Select,
  Skeleton,
} from '@/components/ui';
import { useDsrLatest, useDsrReport, useDsrReports } from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Dealer } from '@dk/shared';

import { DsrReportPanel, dsrDateLabel } from '../dsr/DsrReportPanel';
import { EditShiftDataButton } from '../dsr/EditShiftDataButton';
import { GenerateDsrButton, GenerateDsrForDate } from '../dsr/GenerateDsrButton';


interface Props {
  dealer: Dealer;
}

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
 * This dealer's slice of the Daily Sales Report Vault: a business-date selector
 * over their whole history, the selected day's report rendered inline, and a
 * Generate/Regenerate control. Each generated day is its own report (day +
 * day-before), so the selector is how an admin steps back through previous days
 * without leaving the dealer page.
 */
export function DealerDsrTab({ dealer }: Props) {
  const navigate = useNavigate();

  const reportsQ = useDsrReports(dealer.id);
  const reports = React.useMemo(
    () => reportsQ.data?.reports ?? [],
    [reportsQ.data],
  );

  // `null` = follow the latest; an id pins a specific past day. Reset when the
  // tab is reused across dealers so B never shows A's pinned day.
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  // A specific day just generated (back-date or regenerate) whose report we want
  // to show once its row appears in the refreshed list.
  const [pendingDate, setPendingDate] = React.useState<string | null>(null);
  const watched = React.useRef(dealer.id);
  if (watched.current !== dealer.id) {
    watched.current = dealer.id;
    if (pinnedId !== null) setPinnedId(null);
    if (pendingDate !== null) setPendingDate(null);
  }

  // Exactly one of these is enabled: a pinned report by id, or the dealer's
  // latest when nothing is pinned.
  const latestQ = useDsrLatest(pinnedId ? undefined : dealer.id);
  const byIdQ = useDsrReport(pinnedId ?? undefined);
  const reportQ = pinnedId ? byIdQ : latestQ;
  const report = reportQ.data;

  const noReportYet =
    (reportQ.isError && isNotFound(reportQ.error)) ||
    (!reportQ.isLoading && !reportQ.isError && !report && reports.length === 0);

  function selectReport(id: string) {
    // Picking the newest is the same as "follow latest" — keep the pin empty so
    // a fresh Regenerate is what shows.
    setPinnedId(id === reports[0]?.id ? null : id);
  }

  // Show a just-generated SPECIFIC day as soon as its report lands — a back-date
  // is not the newest report, so following "latest" would hide it.
  React.useEffect(() => {
    if (!pendingDate) return;
    const hit = reports.find((r) => r.businessDate === pendingDate);
    if (!hit) return;
    setPendingDate(null);
    setPinnedId(hit.id === reports[0]?.id ? null : hit.id);
  }, [pendingDate, reports]);

  const openFull = (
    <Button
      variant="ghost"
      size="sm"
      rightIcon={<ExternalLink width={14} height={14} strokeWidth={1.75} />}
      onClick={() => navigate(`/dsr/dealers/${dealer.id}`)}
    >
      Open full view
    </Button>
  );

  return (
    <div className="grid gap-4">
      {/* Business-date selector — the way back through previous days — plus a
          date picker to originate a brand-new back-dated report. */}
      {reports.length > 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-3">
            <div>
              <Label htmlFor={`dsr-date-${dealer.id}`}>Business date</Label>
              <Select
                id={`dsr-date-${dealer.id}`}
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
            <GenerateDsrForDate
              dealerId={dealer.id}
              onGenerated={setPendingDate}
            />
            <EditShiftDataButton
              dealerId={dealer.id}
              businessDate={report?.businessDate}
            />
            {report ? (
              <p className="ml-auto text-xs text-text-subtle">
                Generated {formatDateTime(report.generatedAt)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {reportQ.isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-[60vh] w-full" />
        </div>
      ) : noReportYet ? (
        <Card>
          <CardContent className="p-4">
            <EmptyState
              icon={
                <FileBarChart2 width={28} height={28} strokeWidth={1.75} />
              }
              title="No Daily Sales Report yet"
              description="Generate the latest available day-book, or pick a past date to back-fill one. Make sure the Daily Sales Report service is attached from the Services tab first."
              cta={
                <div className="grid justify-items-center gap-3">
                  <GenerateDsrButton
                    dealerId={dealer.id}
                    variant="primary"
                    label="Generate now"
                    onQueued={() => setPinnedId(null)}
                  />
                  <GenerateDsrForDate
                    dealerId={dealer.id}
                    onGenerated={setPendingDate}
                  />
                  <EditShiftDataButton dealerId={dealer.id} />
                </div>
              }
            />
          </CardContent>
        </Card>
      ) : reportQ.isError || !report ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Could not load the report"
          description={
            reportQ.error instanceof ApiError
              ? reportQ.error.message
              : 'Please try again.'
          }
        />
      ) : (
        <DsrReportPanel
          report={report}
          actions={
            <>
              {openFull}
              <Button
                variant="secondary"
                size="sm"
                leftIcon={
                  <Download width={14} height={14} strokeWidth={1.75} />
                }
                disabled={!report.xlsxUrl}
                onClick={() =>
                  report.xlsxUrl && triggerDownload(report.xlsxUrl)
                }
              >
                Download Excel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={
                  <Download width={14} height={14} strokeWidth={1.75} />
                }
                disabled={!report.jsonUrl}
                onClick={() =>
                  report.jsonUrl && triggerDownload(report.jsonUrl)
                }
              >
                Download JSON
              </Button>
              <GenerateDsrButton
                dealerId={dealer.id}
                businessDate={report.businessDate}
                label="Regenerate"
                onQueued={() => setPendingDate(report.businessDate)}
              />
            </>
          }
        />
      )}
    </div>
  );
}
