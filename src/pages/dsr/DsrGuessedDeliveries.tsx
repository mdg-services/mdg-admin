import { Truck } from 'lucide-react';
import * as React from 'react';

import { Button, ConfirmDialog, useToast } from '@/components/ui';
import {
  useDsrInferredReceipts,
  useRemoveInferredReceipt,
  type DsrInferredReceipt,
} from '@/hooks/api/useDsr';
import { ApiError } from '@/lib/api';
import { formatLitres, formatYmd } from '@/lib/format';

/**
 * "Deliveries the system guessed."
 *
 * When the tank gains fuel that no receipt explains, the engine books a tanker
 * for it (marked D on the sheet). Usually right — the portal missed one. Wrong
 * when the gain is a dip that was MISSING the day before and read as 0 L: 3E's
 * 18–19 Oct 2026 were collected on the night shift, which carries no stock, and
 * a 7,000 L diesel tanker that never came went into every report after it.
 *
 * There is no portal row behind a guess, so the shift data editor cannot touch
 * it. This is the one place it can be taken back. Removing it flags the reports
 * that counted it; the stale notice above then rebuilds them.
 */
export function DsrGuessedDeliveries({ dealerId }: { dealerId: string }) {
  const toast = useToast();
  const q = useDsrInferredReceipts(dealerId);
  const remove = useRemoveInferredReceipt(dealerId);
  const [pending, setPending] = React.useState<DsrInferredReceipt | null>(null);

  const receipts = q.data?.receipts ?? [];
  if (receipts.length === 0) return null;

  const confirm = () => {
    if (!pending) return;
    remove.mutate(
      { businessDate: pending.businessDate, productKey: pending.productKey },
      {
        onSuccess: (data) => {
          setPending(null);
          toast.success(
            `Removed ${formatLitres(data.litres)} of ${data.productKey} on ${formatYmd(data.businessDate)}. ` +
              (data.staleDates.length
                ? `Press "Rebuild" above to correct ${data.staleDates.length} report${data.staleDates.length === 1 ? '' : 's'}.`
                : 'No report had counted it yet.'),
          );
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Could not remove the delivery'),
      },
    );
  };

  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2.5 text-sm">
      <div className="flex items-start gap-2">
        <Truck
          width={16}
          height={16}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 text-text-muted"
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text">Deliveries the system guessed</p>
          <p className="mt-0.5 text-xs text-text-muted">
            The tank gained fuel with no tanker on record, so the report counts one. If no tanker
            came that day — for example the dip was missing the day before — remove it.
          </p>
          <ul className="mt-2 divide-y divide-border">
            {receipts.map((r) => (
              <li
                key={`${r.businessDate}-${r.productKey}`}
                className="flex flex-wrap items-center justify-between gap-2 py-1.5"
              >
                <span className="text-text">
                  <span className="font-medium">{r.productKey}</span> · {formatYmd(r.businessDate)}{' '}
                  · {formatLitres(r.litres)}
                  {r.unexplainedLitres !== null ? (
                    <span className="text-text-muted">
                      {' '}
                      (tank gained {formatLitres(Math.round(r.unexplainedLitres))})
                    </span>
                  ) : null}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full md:w-auto"
                  onClick={() => setPending(r)}
                >
                  No tanker came — remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ConfirmDialog
        open={!!pending}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
        loading={remove.isPending}
        confirmVariant="danger"
        confirmLabel="Remove delivery"
        title="Remove this guessed delivery?"
        description={
          pending ? (
            <p>
              {formatLitres(pending.litres)} of {pending.productKey} on{' '}
              {formatYmd(pending.businessDate)} will stop counting, and the system will not guess it
              again. Every report from that day on is marked out of date until you rebuild it.
            </p>
          ) : null
        }
      />
    </div>
  );
}
