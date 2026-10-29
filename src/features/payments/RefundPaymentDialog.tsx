import * as React from 'react';
import { Link } from 'react-router-dom';

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
import { useAutopayOverview } from '@/hooks/api/useAutopay';
import { useRefundPayment } from '@/hooks/api/usePayments';
import { istTodayYmd } from '@/lib/format';
import {
  PAYMENT_REASON_MAX,
  reasonProblem,
  refundAmount,
  refundSentence,
  refundAutopayWarning,
  refundable,
  rupeesText,
} from '@/pages/payments/format';
import { dealerCodeLabel, formatPaise } from '@dk/shared';
import type { AdminPayment } from '@dk/shared';

import { DealerReceivesBox } from './DealerReceivesBox';

/**
 * Give an outlet's money back. A super-admin's action, in two steps.
 *
 * Step one asks how much and why. The amount starts at everything that has not
 * been returned yet, and cannot be more than that — the same limit the server
 * enforces, said in rupees before a request is made. Step two says it again in
 * a sentence with the figures in it, and only its button sends anything: a
 * refund cannot be taken back, and it goes to whichever card, bank account or
 * UPI app the money came from, not to wherever an admin would like it to.
 *
 * The amount is always sent explicitly rather than left out for "the rest". If
 * another refund lands while this one is open, a request for more than is left
 * is refused, where "whatever remains" would quietly have refunded a different
 * amount from the one the confirmation read out.
 *
 * `payment` is the one being refunded; `null` is closed.
 */
export function RefundPaymentDialog({
  payment,
  onClose,
}: {
  payment: AdminPayment | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const refund = useRefundPayment();
  const overview = useAutopayOverview(payment?.dealerId);
  const amountId = React.useId();
  const reasonId = React.useId();
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [step, setStep] = React.useState<'form' | 'confirm'>('form');
  const [attempted, setAttempted] = React.useState(false);

  // Every payment opens on the whole of what is left to give back, with an empty reason.
  React.useEffect(() => {
    setAmount(payment ? rupeesText(refundable(payment)) : '');
    setReason('');
    setStep('form');
    setAttempted(false);
    // Only a different payment resets the form: the drawer refreshes the same
    // payment every so often, and that must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.id]);

  const parsed = payment ? refundAmount(amount, payment) : null;
  const reasonIssue = reasonProblem(reason);
  const tooLong = reason.trim().length > PAYMENT_REASON_MAX;
  const shownAmount = attempted && parsed && !parsed.ok ? parsed.problem : undefined;
  const shownReason = reasonIssue && (attempted || tooLong) ? reasonIssue : undefined;

  function review() {
    setAttempted(true);
    if (!parsed?.ok || reasonIssue) return;
    setStep('confirm');
  }

  async function submit() {
    if (!payment || !parsed?.ok || refund.isPending) return;
    try {
      await refund.mutateAsync({
        id: payment.id,
        amountPaise: parsed.paise,
        reason: reason.trim(),
      });
      toast.success(`Refund of ${formatPaise(parsed.paise)} started.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
      // Back to the figures: the likeliest cause is that they have moved.
      setStep('form');
    }
  }

  const confirming = step === 'confirm' && parsed?.ok === true;
  const autopayWarning = payment
    ? refundAutopayWarning(payment, overview.data, istTodayYmd())
    : null;

  return (
    <Dialog
      open={!!payment}
      onClose={refund.isPending ? () => {} : onClose}
      title={payment ? `Refund ${payment.number}` : 'Refund payment'}
      footerBelow="row"
      footer={
        confirming ? (
          <>
            <Button variant="secondary" onClick={() => setStep('form')} disabled={refund.isPending}>
              Back
            </Button>
            <Button variant="danger" onClick={() => void submit()} loading={refund.isPending}>
              {`Refund ${formatPaise(parsed.paise)}`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={review}>Review refund</Button>
          </>
        )
      }
    >
      {payment ? (
        <div className="grid gap-3">
          <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 [overflow-wrap:anywhere]">
            <p className="text-sm font-medium text-text">
              Paid {formatPaise(payment.amountPaise)} · outlet {dealerCodeLabel(payment.dealerCode)}
            </p>
            <p className="mt-0.5 text-xs text-text-subtle">
              {payment.refundedPaise > 0
                ? `${formatPaise(payment.refundedPaise)} already given back. ${formatPaise(refundable(payment))} left.`
                : payment.title}
            </p>
          </div>

          {autopayWarning ? (
            <Callout intent="warning">
              {autopayWarning}{' '}
              <Link
                to={`/dealers/${payment.dealerId}`}
                onClick={onClose}
                className="font-semibold underline"
              >
                Open the outlet
              </Link>
            </Callout>
          ) : null}

          {confirming ? (
            <>
              <Callout intent="warning">{refundSentence(payment, parsed.paise)}</Callout>
              <DealerReceivesBox
                action={{ kind: 'refund', amountPaise: parsed.paise, byHand: false }}
              />
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <p className="text-xs text-text-subtle">Reason kept with the payment</p>
                <p className="mt-0.5 select-text whitespace-pre-wrap text-sm text-text">
                  {reason.trim()}
                </p>
              </div>
            </>
          ) : (
            <form
              className="grid gap-3"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                review();
              }}
            >
              <div>
                <Label htmlFor={amountId} required>
                  Amount to give back, in rupees
                </Label>
                <Input
                  id={amountId}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  invalid={!!shownAmount}
                />
                <FieldError message={shownAmount} />
                {shownAmount ? null : (
                  <p className="mt-1 text-xs text-text-muted">
                    Up to {formatPaise(refundable(payment))} can be given back.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor={reasonId} required>
                  Why
                </Label>
                <Textarea
                  id={reasonId}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="For example: the outlet was charged twice."
                  invalid={!!shownReason}
                />
                <div className="mt-1 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <FieldError message={shownReason} />
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
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
