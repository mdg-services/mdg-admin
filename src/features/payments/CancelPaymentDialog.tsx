import * as React from 'react';

import { Button, Callout, Dialog, FieldError, Label, Textarea, useToast } from '@/components/ui';
import { useCancelPayment } from '@/hooks/api/usePayments';
import { cancelPaymentAction } from '@/lib/billingRelease';
import { PAYMENT_REASON_MAX, cancelSentence, reasonProblem } from '@/pages/payments/format';
import { formatPaise, dealerCodeLabel } from '@dk/shared';
import type { AdminPayment } from '@dk/shared';

import { DealerReceivesBox } from './DealerReceivesBox';

/**
 * Withdraw a payment nobody has paid — and refuse to without a reason.
 *
 * The reason stays on the payment, with the admin's name and the time, so the
 * next person who opens it knows why it stopped. It says in words what
 * cancelling does to the link, and what happens if the outlet pays it anyway
 * (the money goes straight back and an alert is raised), so nobody cancels
 * believing a payment link is a promise that can be taken back for free.
 *
 * `payment` is the one being cancelled; `null` is closed.
 */
export function CancelPaymentDialog({
  payment,
  onClose,
}: {
  payment: AdminPayment | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const cancel = useCancelPayment();
  const reasonId = React.useId();
  const [reason, setReason] = React.useState('');
  // "Say why" waits for a press of the button; a reason that is too long is said at once.
  const [attempted, setAttempted] = React.useState(false);

  // A fresh, empty box for every payment.
  React.useEffect(() => {
    setReason('');
    setAttempted(false);
  }, [payment?.id]);

  const problem = reasonProblem(reason);
  const tooLong = reason.trim().length > PAYMENT_REASON_MAX;
  const shownProblem = problem && (attempted || tooLong) ? problem : undefined;

  async function submit() {
    if (!payment || cancel.isPending) return;
    setAttempted(true);
    if (problem) return;
    try {
      await cancel.mutateAsync({ id: payment.id, reason: reason.trim() });
      toast.success(`Payment ${payment.number} cancelled.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open={!!payment}
      onClose={cancel.isPending ? () => {} : onClose}
      title={payment ? `Cancel ${payment.number}` : 'Cancel payment'}
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={cancel.isPending}>
            Keep it
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={cancel.isPending}>
            Cancel payment
          </Button>
        </>
      }
    >
      {payment ? (
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
              {formatPaise(payment.amountPaise)} · outlet {dealerCodeLabel(payment.dealerCode)}
            </p>
            <p className="mt-0.5 text-xs text-text-subtle">{payment.title}</p>
          </div>

          <Callout intent="warning">{cancelSentence(payment)}</Callout>
          <DealerReceivesBox action={cancelPaymentAction(payment)} />

          <div>
            <Label htmlFor={reasonId} required>
              Why
            </Label>
            <Textarea
              id={reasonId}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: raised for the wrong outlet."
              invalid={!!shownProblem}
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <FieldError message={shownProblem} />
              </div>
              <span
                className={
                  tooLong
                    ? 'ml-auto shrink-0 text-xs tabular-nums text-danger'
                    : 'ml-auto shrink-0 text-xs tabular-nums text-text-subtle'
                }
              >
                {reason.trim().length.toLocaleString('en-IN')} /{' '}
                {PAYMENT_REASON_MAX.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}
