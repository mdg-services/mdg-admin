import * as React from 'react';

import { Badge, Button, Callout, Skeleton } from '@/components/ui';
import { useBillingActivity } from '@/hooks/api/useBilling';
import {
  ACTIVITY_KIND_INTENT,
  ACTIVITY_KIND_LABEL,
  ACTIVITY_PAGE,
  activityPage,
  activityWho,
  newestActivityFirst,
  showMoreLabel,
} from '@/lib/billingRelease2';
import { istStamp } from '@/lib/intake';

/**
 * An outlet's billing history, in plain words, on its Setup card: every bill raised,
 * link or message sent, payment, day moved, hold, autopay step, refund, and the day
 * billing ended or started again. Newest first, twenty lines at a time. Each line is
 * its time, what happened, and who did it ("Owner or automatic" when nobody on the
 * team did).
 *
 * The server writes the sentences (`GET /admin/payments/dealers/:id/activity`); this
 * only lays them out. On a phone a line is a small stack (label and time above, the
 * sentence below, who last), so nothing scrolls sideways. It is shown whether or not
 * Razorpay's keys are on: the history route reads our own records and works without them.
 */
export function BillingHistory({ dealerId }: { dealerId: string }) {
  const q = useBillingActivity(dealerId);
  const [shown, setShown] = React.useState(ACTIVITY_PAGE);
  const items = React.useMemo(() => newestActivityFirst(q.data ?? []), [q.data]);
  const page = activityPage(items, shown);

  return (
    <section aria-label="Billing history" className="grid gap-2 border-t border-border pt-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-text-subtle">
        Billing history
      </h3>
      {q.isPending ? (
        <div className="grid gap-2" aria-busy="true">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : q.isError && !q.data ? (
        <Callout intent="warning" onRetry={() => void q.refetch()}>
          The billing history could not be loaded.
          {q.error instanceof Error && q.error.message ? ` ${q.error.message}` : ''}
        </Callout>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing yet. The first bill starts the history.</p>
      ) : (
        <>
          <ol className="grid gap-2.5">
            {page.lines.map((l, i) => (
              <li
                key={`${l.at}-${l.paymentId ?? ''}-${i}`}
                className="grid min-w-0 gap-0.5 text-sm [overflow-wrap:anywhere]"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Badge intent={ACTIVITY_KIND_INTENT[l.kind]}>{ACTIVITY_KIND_LABEL[l.kind]}</Badge>
                  <span className="text-xs tabular-nums text-text-subtle">
                    {istStamp(l.at) || '-'}
                  </span>
                </span>
                <span className="select-text text-text">{l.words}</span>
                <span className="text-xs text-text-muted">{activityWho(l.byName)}</span>
              </li>
            ))}
          </ol>
          {page.left > 0 ? (
            <div>
              <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + ACTIVITY_PAGE)}>
                {showMoreLabel(page.left)}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
