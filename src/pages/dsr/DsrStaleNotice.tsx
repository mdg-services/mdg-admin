import { History, RefreshCw } from 'lucide-react';

import { Button, HowThisWorks, useToast } from '@/components/ui';
import {
  useDsrStaleReports,
  useRegenerateStaleDsr,
  type DsrReportView,
} from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatYmd } from '@/lib/format';

import { useDsrRunWatcher } from './useDsrRunWatcher';

/**
 * "This report no longer matches its inputs."
 *
 * Two things flag a report, and both move the same figure — the stock-vs-sales
 * variation, which accumulates from the last physical inspection:
 *
 *   - a receipt entered or corrected for this day or an earlier one, which
 *     changes every report after it; and
 *   - the outlet being RE-INSPECTED, which replaces the window itself. That one
 *     flags automatically the night the new inspection is captured, so a report
 *     can be out of date without anybody here having touched it.
 *
 * The figures on screen are still the ones that were shared with the dealer,
 * which is why the report stays readable and this sits above it rather than
 * replacing it. `reason` says which of the two it was.
 *
 * The rebuild is one click but never automatic — regenerating can drive a portal
 * collection, so it stays a decision an admin makes.
 */
export function DsrStaleNotice({ report }: { report: DsrReportView }) {
  const toast = useToast();
  const staleQ = useDsrStaleReports(report.dealerId, !!report.stale);
  const regenerate = useRegenerateStaleDsr(report.dealerId);
  const run = useDsrRunWatcher(
    report.dealerId,
    'Reports rebuilt — anything still out of date is listed again below.',
  );

  if (!report.stale) return null;

  const others = (staleQ.data?.reports ?? []).filter(
    (r) => r.businessDate !== report.businessDate,
  );
  const busy = regenerate.isPending || run.busy;

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-md border border-warning bg-warning-soft px-3 py-2.5 text-sm text-warning">
      <History width={16} height={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <p className="font-medium">This report is out of date</p>
          <HowThisWorks
            surface="admin-dsr-stale-notice"
            label="Out-of-date reports"
            variant="icon"
          />
        </div>
        <p className="mt-0.5">{report.stale.reason}</p>
        {/* No `opacity-90`. This is amber text on an amber ground already, and
            the list it carries — which OTHER days this correction invalidated —
            is the whole "what else needs regenerating" answer. Dimming the one
            actionable line on the notice by a further 10% is how it goes
            unread in sunlight. */}
        <p className="mt-0.5 text-xs">Flagged {formatDateTime(report.stale.at)}</p>
        {others.length > 0 ? (
          // Its own line rather than appended after a `·`: at 360px the two ran
          // together into four wrapped lines with the dates buried mid-sentence.
          <p className="mt-0.5 text-xs">
            {others.length} other report{others.length === 1 ? '' : 's'} affected:{' '}
            {others
              .slice(0, 4)
              .map((r) => formatYmd(r.businessDate))
              .join(', ')}
            {others.length > 4 ? '…' : ''}
          </p>
        ) : null}
      </div>
      <Button
        className="w-full md:w-auto"
        size="sm"
        loading={busy}
        leftIcon={<RefreshCw width={14} height={14} strokeWidth={1.75} />}
        onClick={() =>
          regenerate.mutate(undefined, {
            onSuccess: (data) => {
              run.watch(data.runId);
              toast.success(
                `Rebuilding from ${formatYmd(data.businessDate)} — this updates when it lands.`,
              );
            },
            onError: (err) =>
              toast.error(
                err instanceof ApiError
                  ? err.message
                  : 'Could not start the rebuild',
              ),
          })
        }
      >
        {busy ? 'Rebuilding…' : 'Regenerate'}
      </Button>
    </div>
  );
}
