import { History, RefreshCw } from 'lucide-react';

import { Button, useToast } from '@/components/ui';
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
 * Shown when a receipt was entered or corrected for this day or an earlier one:
 * the stock-vs-sales variation accumulates receipts since the last inspection,
 * so a correction to any past day changes every report after it. The figures on
 * screen are still the ones that were shared with the dealer, which is why the
 * report stays readable and this sits above it rather than replacing it.
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
        <p className="font-medium">This report is out of date</p>
        <p className="mt-0.5">{report.stale.reason}</p>
        <p className="mt-0.5 text-xs opacity-90">
          Flagged {formatDateTime(report.stale.at)}
          {others.length > 0
            ? ` · ${others.length} other report${others.length === 1 ? '' : 's'} affected (${others
                .slice(0, 4)
                .map((r) => formatYmd(r.businessDate))
                .join(', ')}${others.length > 4 ? '…' : ''})`
            : ''}
        </p>
      </div>
      <Button
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
