import * as React from 'react';

import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  FieldError,
  Input,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import { useGiveMoreTime } from '@/hooks/api/usePayments';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import {
  MORE_TIME_REASON_MAX,
  defaultMoreTimeDay,
  moreTimeAction,
  moreTimeBody,
  moreTimeProblem,
  originalDueDay,
  overSevenDaysNote,
} from '@/lib/billingRelease';
import { istTodayYmd } from '@/lib/format';
import { addDays, ymdLabel } from '@/lib/onboarding';
import { dealerCodeLabel, formatPaise, type AdminPayment } from '@dk/shared';

import { DealerReceivesBox } from './DealerReceivesBox';

/**
 * "Give more time": move an open bill's pay-by day for an owner who asked for it.
 * The bill's reminders and its overdue alert move with it. Nothing is sent to the
 * owner unless "Tell the dealer" is ticked, which sends one app notification with the
 * new day and no link (Google Play: nothing in the app says how to pay).
 *
 * Any admin may move the day up to 7 days past the day the bill was FIRST due, however
 * many times it has been moved; further is a super-admin's. The dialog says so before
 * the press, because the server refuses it. The reason is kept with the bill, with the
 * admin's name, and the drawer lists every move.
 *
 * Offered only on a due monthly-service bill that autopay does not take (`canGiveMoreTime`). `payment`
 * is the bill; `null` is closed. Mounted only while open, so what was typed never
 * survives into the next one.
 */
export function GiveMoreTimeDialog({
  payment,
  onClose,
}: {
  payment: AdminPayment | null;
  onClose: () => void;
}) {
  return payment ? <MoreTimeForm key={payment.id} payment={payment} onClose={onClose} /> : null;
}

function MoreTimeForm({ payment, onClose }: { payment: AdminPayment; onClose: () => void }) {
  const toast = useToast();
  const give = useGiveMoreTime();
  const isSuperAdmin = useIsSuperAdmin();
  const dayId = React.useId();
  const reasonId = React.useId();
  const today = istTodayYmd();
  const currentDue = payment.dueDate ?? today;
  const originalDue = originalDueDay(payment);
  const [dueOn, setDueOn] = React.useState(() => defaultMoreTimeDay(payment.dueDate, today));
  const [reason, setReason] = React.useState('');
  const [tellDealer, setTellDealer] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  const problem = moreTimeProblem(
    { dueOn, reason },
    { currentDue, originalDue, today, isSuperAdmin },
  );
  // The seven-day note has its own box above the field; the field does not say it twice.
  const note = overSevenDaysNote(dueOn, originalDue, isSuperAdmin, today);
  const earliest = addDays(currentDue, 1) < today ? today : addDays(currentDue, 1);

  async function submit() {
    if (give.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await give.mutateAsync({ id: payment.id, ...moreTimeBody({ dueOn, reason, tellDealer }) });
      toast.success(
        `${payment.number} is now due on ${ymdLabel(dueOn)}.${tellDealer ? ' The owner was told.' : ''}`,
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open
      onClose={give.isPending ? () => {} : onClose}
      title="Give more time"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={give.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={give.isPending}>
            Move the day
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 [overflow-wrap:anywhere]">
          <p className="text-sm font-medium text-text">
            {payment.number} · {formatPaise(payment.amountPaise)} · outlet{' '}
            {dealerCodeLabel(payment.dealerCode)}
          </p>
          <p className="mt-0.5 text-xs text-text-subtle">
            Due {ymdLabel(currentDue)}
            {originalDue && originalDue !== currentDue
              ? `, first due ${ymdLabel(originalDue)}`
              : ''}
            .
          </p>
        </div>

        <div>
          <Label htmlFor={dayId} required>
            Pay by
          </Label>
          <Input
            id={dayId}
            type="date"
            value={dueOn}
            min={earliest}
            onChange={(e) => setDueOn(e.target.value)}
            invalid={touched && !!problem && problem !== note}
          />
        </div>
        {note ? <Callout intent="warning">{note}</Callout> : null}

        <div>
          <Label htmlFor={reasonId} required>
            Why
          </Label>
          <Textarea
            id={reasonId}
            rows={2}
            value={reason}
            maxLength={MORE_TIME_REASON_MAX + 50}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: owner asked on the phone, will pay on Friday."
            invalid={touched && !!problem && problem !== note}
          />
        </div>

        <Checkbox
          checked={tellDealer}
          onChange={(e) => setTellDealer(e.target.checked)}
          label="Tell the dealer"
          hint="Sends one notification in the app with the new day. Left off, nothing is sent."
          align="start"
        />

        <DealerReceivesBox action={moreTimeAction(tellDealer, dueOn)} />

        <FieldError message={touched && problem && problem !== note ? problem : undefined} />
      </form>
    </Dialog>
  );
}
