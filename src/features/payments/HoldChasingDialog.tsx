import * as React from 'react';

import {
  Button,
  Callout,
  Dialog,
  FieldError,
  Input,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import { useHoldChasing } from '@/hooks/api/usePayments';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import {
  MORE_TIME_REASON_MAX,
  defaultMoreTimeDay,
  holdBody,
  holdChasingAction,
  holdExplainer,
  holdIsOn,
  holdProblem,
  originalDueDay,
  overSevenDaysNote,
} from '@/lib/billingRelease';
import { istTodayYmd } from '@/lib/format';
import { addDays, isDay, ymdLabel } from '@/lib/onboarding';
import { dealerCodeLabel, formatPaise, type AdminPayment } from '@dk/shared';

import { DealerReceivesBox } from './DealerReceivesBox';

/**
 * "Hold chasing until…": for a monthly bill autopay is meant to take. Until the end of
 * the day chosen, nothing chases it: no overdue alert, no WhatsApp reminder, and no
 * payment link if the debit fails or autopay ends. The dialog says plainly that
 * Razorpay's own retries of the debit go on regardless, because that is the part a
 * person would otherwise assume this stops. A link bill held for a week because the
 * owner asked for their first month back says that instead, and says nothing of
 * Razorpay, which is not retrying anything for it.
 *
 * With a hold already on, it shows the hold and offers "Lift hold…" (a second view with
 * its own "what the dealer receives", since lifting a hold early may let a link go out).
 * Same seven-day rule as "Give more time", counted from the bill's due day.
 *
 * `payment` is the bill; `null` is closed. Mounted only while open.
 */
export function HoldChasingDialog({
  payment,
  onClose,
}: {
  payment: AdminPayment | null;
  onClose: () => void;
}) {
  return payment ? <HoldForm key={payment.id} payment={payment} onClose={onClose} /> : null;
}

function HoldForm({ payment, onClose }: { payment: AdminPayment; onClose: () => void }) {
  const toast = useToast();
  const hold = useHoldChasing();
  const isSuperAdmin = useIsSuperAdmin();
  const dayId = React.useId();
  const reasonId = React.useId();
  const today = istTodayYmd();
  const held = holdIsOn(payment.chaseHeldUntil, today);
  const originalDue = originalDueDay(payment);
  const [lifting, setLifting] = React.useState(false);
  const [until, setUntil] = React.useState(() => defaultMoreTimeDay(payment.dueDate, today));
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const problem = holdProblem({ until, reason }, { originalDue, today, isSuperAdmin });
  const note = overSevenDaysNote(until, originalDue, isSuperAdmin, today);
  // Autopay's bill: Razorpay's retries go on. A link bill held for a refund ask has none.
  const explainer = holdExplainer(payment, today);
  const errorText = (err: unknown) =>
    err instanceof Error && err.message ? err.message : 'That did not go through.';

  async function set() {
    if (hold.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await hold.mutateAsync({ id: payment.id, ...holdBody(until, reason) });
      toast.success(`Chasing held until ${ymdLabel(until)}.`);
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function lift() {
    if (hold.isPending) return;
    try {
      await hold.mutateAsync({ id: payment.id, ...holdBody(null, '') });
      toast.success('The hold is lifted.');
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const bill = (
    <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 [overflow-wrap:anywhere]">
      <p className="text-sm font-medium text-text">
        {payment.number} · {formatPaise(payment.amountPaise)} · outlet{' '}
        {dealerCodeLabel(payment.dealerCode)}
      </p>
      <p className="mt-0.5 text-xs text-text-subtle">
        {payment.autopayOn
          ? `Autopay takes it on ${ymdLabel(payment.autopayOn)}.`
          : payment.waitingForAutopayApproval
            ? 'Waiting for the owner to approve autopay.'
            : payment.autopayTakes
              ? 'Autopay is meant to take this bill.'
              : 'The owner pays this bill by link.'}
      </p>
    </div>
  );

  if (lifting && held) {
    return (
      <Dialog
        open
        onClose={hold.isPending ? () => {} : onClose}
        title="Lift the hold"
        footerBelow="row"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLifting(false)} disabled={hold.isPending}>
              Back
            </Button>
            <Button onClick={() => void lift()} loading={hold.isPending}>
              Lift hold
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          {bill}
          <p className="text-sm text-text-muted">
            Chasing was held until {ymdLabel(payment.chaseHeldUntil)}. Lifting it now lets the
            overdue alert and the reminders work again from the bill&rsquo;s own day.
          </p>
          <DealerReceivesBox action={holdChasingAction(null)} />
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={hold.isPending ? () => {} : onClose}
      title="Hold chasing"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={hold.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void set()} loading={hold.isPending}>
            {held ? 'Change the hold' : 'Hold chasing'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void set();
        }}
      >
        {bill}

        {held ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2.5">
            <p className="text-sm text-text">
              Chasing is held until {ymdLabel(payment.chaseHeldUntil)}.
            </p>
            <Button size="sm" variant="secondary" onClick={() => setLifting(true)}>
              Lift hold…
            </Button>
          </div>
        ) : null}

        {explainer ? <Callout intent="info">{explainer}</Callout> : null}

        <div>
          <Label htmlFor={dayId} required>
            Hold until the end of
          </Label>
          <Input
            id={dayId}
            type="date"
            value={until}
            min={today}
            onChange={(e) => setUntil(e.target.value)}
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
            placeholder="For example: owner says the bank will take it on the 6th."
            invalid={touched && !!problem && problem !== note}
          />
        </div>

        <DealerReceivesBox action={holdChasingAction(isDay(until) ? until : addDays(today, 1))} />

        <FieldError message={touched && problem && problem !== note ? problem : undefined} />
      </form>
    </Dialog>
  );
}
