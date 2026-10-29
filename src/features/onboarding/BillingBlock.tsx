import * as React from 'react';

import { Button } from '@/components/ui';
import { GiveMoreTimeDialog } from '@/features/payments/GiveMoreTimeDialog';
import { HoldChasingDialog } from '@/features/payments/HoldChasingDialog';
import { useAutopayOverview } from '@/hooks/api/useAutopay';
import { useOpenBill, usePaymentsConfigQuery } from '@/hooks/api/usePayments';
import {
  billingStatusLine,
  canGiveMoreTime,
  canHoldChasing,
  sendHistoryLine,
} from '@/lib/billingRelease';
import { istTodayYmd } from '@/lib/format';
import type { OutletSetupAdmin } from '@dk/shared';

/**
 * Where an outlet's billing stands, on its Setup card: one plain line (what is paid,
 * what is open, what autopay will do, whether chasing is held), what the system has
 * sent the owner about the open bill, and the two things an admin can do about that
 * bill when the owner asks: "Give more time…" for a bill the owner pays by link, and
 * "Hold chasing…" for a bill autopay is meant to take.
 *
 * It reads three things the page already has or shares by cache: the setup, the
 * outlet's autopay overview, and the outlet's open bill (`useOpenBill`). The line is
 * `billingStatusLine`; which button shows is `canGiveMoreTime` / `canHoldChasing`.
 * While Razorpay is switched off the payments routes answer 503, so the open bill is
 * not asked for and the line falls back to what the setup itself says.
 */
export function BillingBlock({ setup }: { setup: OutletSetupAdmin }) {
  const config = usePaymentsConfigQuery().data;
  const autopay = useAutopayOverview(setup.dealerId);
  const { bill } = useOpenBill(setup.dealerId, !!config?.configured);
  const [dialog, setDialog] = React.useState<'time' | 'hold' | null>(null);
  const now = Date.now();

  const line = billingStatusLine({
    today: istTodayYmd(),
    first: {
      state: setup.payment.state,
      number: setup.payment.paymentNumber,
      amountPaise: setup.payment.amountPaise,
      dueOn: setup.payment.dueOn,
    },
    open: bill,
    paidThrough: setup.subscription.paidThrough,
    nextBillOn: setup.subscription.nextBillOn,
    overdue: setup.subscription.overdue,
    billingHold: setup.subscription.billingHold,
    autopay: autopay.data?.current ?? null,
    now,
  });

  return (
    <div className="grid gap-1.5" aria-label="Billing status">
      <p className="select-text text-sm font-medium text-text [overflow-wrap:anywhere]">{line}</p>
      {bill?.sends ? (
        <p className="text-xs text-text-muted">{sendHistoryLine(bill.sends, now)}</p>
      ) : null}
      {bill && (canGiveMoreTime(bill) || canHoldChasing(bill)) ? (
        <div className="flex flex-wrap gap-2">
          {canGiveMoreTime(bill) ? (
            <Button size="sm" variant="secondary" onClick={() => setDialog('time')}>
              Give more time…
            </Button>
          ) : null}
          {canHoldChasing(bill) ? (
            <Button size="sm" variant="secondary" onClick={() => setDialog('hold')}>
              Hold chasing…
            </Button>
          ) : null}
        </div>
      ) : null}
      <GiveMoreTimeDialog
        payment={dialog === 'time' ? bill : null}
        onClose={() => setDialog(null)}
      />
      <HoldChasingDialog
        payment={dialog === 'hold' ? bill : null}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
