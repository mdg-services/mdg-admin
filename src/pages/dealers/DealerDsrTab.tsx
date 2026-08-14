import { AlertCircle, Download, ExternalLink, FileBarChart2 } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, CardContent, EmptyState, Skeleton } from '@/components/ui';
import { useDsrLatest } from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import type { Dealer } from '@dk/shared';

import { DsrReportPanel } from '../dsr/DsrReportPanel';
import { GenerateDsrButton } from '../dsr/GenerateDsrButton';


interface Props {
  dealer: Dealer;
}

/** A 404 from the latest-report endpoint just means "nothing generated yet". */
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
 * This dealer's slice of the Daily Sales Report Vault: their latest report
 * rendered inline, a Generate/Regenerate control, and a link through to the full
 * history view. Output-first, so an admin sees the day-book immediately.
 */
export function DealerDsrTab({ dealer }: Props) {
  const navigate = useNavigate();
  const latestQ = useDsrLatest(dealer.id);
  const report = latestQ.data;

  const noReportYet =
    (latestQ.isError && isNotFound(latestQ.error)) ||
    (!latestQ.isLoading && !latestQ.isError && !report);

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
      {latestQ.isLoading ? (
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
              description="Generate this dealer's day-book and it will render here. Make sure the Daily Sales Report service is attached from the Services tab first."
              cta={
                <GenerateDsrButton
                  dealerId={dealer.id}
                  variant="primary"
                  label="Generate now"
                />
              }
            />
          </CardContent>
        </Card>
      ) : latestQ.isError || !report ? (
        <EmptyState
          icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
          title="Could not load the latest report"
          description={
            latestQ.error instanceof ApiError
              ? latestQ.error.message
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
              />
            </>
          }
        />
      )}
    </div>
  );
}
