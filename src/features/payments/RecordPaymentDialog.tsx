import * as React from 'react';

import {
  Button,
  Callout,
  Dialog,
  FieldError,
  Input,
  Label,
  Select,
  useToast,
} from '@/components/ui';
import { useAutopayOverview } from '@/hooks/api/useAutopay';
import { useRecordManualPayment, useRecordSetupPayment } from '@/hooks/api/useBilling';
import { FIRST_BILL_AUTOPAY_RECORD_WORDS, firstBillAutopayWaiting } from '@/lib/autopay';
import { manualProblem, shortfallNote } from '@/lib/billing';
import { istTodayYmd } from '@/lib/format';
import {
  PAYMENT_MODES,
  PAYMENT_MODE_LABEL,
  amountProblem,
  formatPaise,
  isDay,
  paiseToRupeesText,
  paymentBody,
  ymdLabel,
} from '@/lib/onboarding';
import {
  dealerCodeLabel,
  type AdminPayment,
  type OutletSetupAdmin,
  type SetupPaymentMode,
} from '@dk/shared';

/**
 * "Record payment received": money that came outside Razorpay (UPI to the company
 * account, a bank transfer, cash, a cheque) recorded by an admin against a bill
 * (ADR 0022 §12). One dialog for both places it is reached from: a payment's drawer
 * on the Payments page, and an outlet's Setup card, where it is the outlet's bill.
 *
 * The same shape as the other forms: a rule that says no (`lib/billing.ts`
 * `manualProblem`, the server's own rules) disables the button and, once touched,
 * says why in words; a failure comes back as a toast with the form left open. A
 * short payment (tax deducted at source) is allowed and said out loud; more than
 * the bill is refused. The dealer gets their receipt and the GST invoice, as for a
 * Razorpay payment.
 */

const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : 'That did not go through.';

/**
 * What the form records money against: a payment on the Payments page, or an
 * outlet's setup (its bill). The setup's own bill is a payment row too; the setup
 * route is only used for one that has no payment id yet.
 */
export type RecordTarget =
  | { kind: 'payment'; payment: AdminPayment }
  | { kind: 'setup'; outlet: OutletSetupAdmin };

export function RecordPaymentDialog({
  target,
  onClose,
}: {
  target: RecordTarget | null;
  onClose: () => void;
}) {
  if (!target) return null;
  const key = target.kind === 'payment' ? target.payment.id : target.outlet.dealerId;
  return <RecordPaymentForm key={key} target={target} onClose={onClose} />;
}

function RecordPaymentForm({ target, onClose }: { target: RecordTarget; onClose: () => void }) {
  const toast = useToast();
  const recordById = useRecordManualPayment();
  const recordBySetup = useRecordSetupPayment();
  const dealerId = target.kind === 'payment' ? target.payment.dealerId : target.outlet.dealerId;
  const autopay = useAutopayOverview(dealerId);
  const amountId = React.useId();
  const dayId = React.useId();
  const modeId = React.useId();
  const refId = React.useId();

  const paymentId = target.kind === 'payment' ? target.payment.id : target.outlet.payment.paymentId;
  const billed =
    target.kind === 'payment' ? target.payment.amountPaise : target.outlet.payment.amountPaise;
  const dueLabel = target.kind === 'payment' ? target.payment.dueDate : target.outlet.payment.dueOn;
  const [amount, setAmount] = React.useState(() => paiseToRupeesText(billed));
  const [paidOn, setPaidOn] = React.useState(() => istTodayYmd());
  const [mode, setMode] = React.useState<SetupPaymentMode>('upi');
  const [reference, setReference] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const today = istTodayYmd();
  const pending = recordById.isPending || recordBySetup.isPending;

  const draft = { amountText: amount, paidOn, mode, reference };
  const problem = manualProblem(draft, billed, today);
  const amountBad = touched && amountProblem(amount) !== null;
  const dayBad = touched && (!isDay(paidOn) || paidOn > today);
  const short = shortfallNote(billed, amount);
  const who =
    target.kind === 'payment'
      ? { code: target.payment.dealerCode, ownerName: null }
      : { code: target.outlet.code, ownerName: target.outlet.ownerName };

  async function submit() {
    if (pending) return;
    setTouched(true);
    if (problem) return;
    const body = paymentBody(draft);
    try {
      if (paymentId) await recordById.mutateAsync({ id: paymentId, body });
      else if (target.kind === 'setup')
        await recordBySetup.mutateAsync({ dealerId: target.outlet.dealerId, body });
      toast.success(
        `Payment recorded: ${formatPaise(body.amountPaise)}. The GST invoice and the dealer’s receipt follow.`,
      );
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title="Record payment received"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={pending}>
            Record payment
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
            {dealerCodeLabel(who.code)}
            {who.ownerName ? (
              <span className="font-normal text-text-muted"> · {who.ownerName}</span>
            ) : null}
          </p>
        </div>
        {billed ? (
          <p className="text-xs text-text-muted">
            Billed {formatPaise(billed)}
            {dueLabel ? `, due ${ymdLabel(dueLabel)}` : ''}.
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor={amountId} required hint="₹, what reached the bank">
              Amount
            </Label>
            <Input
              id={amountId}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              invalid={amountBad}
            />
          </div>
          <div>
            <Label htmlFor={dayId} required>
              Paid on
            </Label>
            <Input
              id={dayId}
              type="date"
              value={paidOn}
              max={today}
              onChange={(e) => setPaidOn(e.target.value)}
              invalid={dayBad}
            />
          </div>
          <div>
            <Label htmlFor={modeId} required>
              How
            </Label>
            <Select
              id={modeId}
              value={mode}
              onChange={(e) => setMode(e.target.value as SetupPaymentMode)}
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_MODE_LABEL[m]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={refId} hint="Optional">
              Reference
            </Label>
            <Input
              id={refId}
              autoComplete="off"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UTR or cheque number"
            />
          </div>
        </div>
        {firstBillAutopayWaiting(autopay.data?.current, paymentId) ? (
          <Callout intent="warning">{FIRST_BILL_AUTOPAY_RECORD_WORDS}</Callout>
        ) : null}
        {short ? <Callout intent="info">{short}</Callout> : null}
        <FieldError message={touched ? (problem ?? undefined) : undefined} />
        <p className="text-xs text-text-muted">
          Every payment recorded is logged with who recorded it. The dealer gets their receipt and
          the GST invoice, as for a Razorpay payment.
        </p>
      </form>
    </Dialog>
  );
}
