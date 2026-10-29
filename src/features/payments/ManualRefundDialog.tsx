import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  Button,
  Callout,
  Dialog,
  FieldError,
  Input,
  Label,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { useAutopayOverview } from '@/hooks/api/useAutopay';
import { useRecordManualRefund } from '@/hooks/api/usePayments';
import { istTodayYmd } from '@/lib/format';
import { PAYMENT_MODES, PAYMENT_MODE_LABEL } from '@/lib/onboarding';
import {
  PAYMENT_REASON_MAX,
  type ManualRefundDraft,
  manualRefundBody,
  manualRefundProblem,
  manualRefundSentence,
  manualRefundable,
  refundAutopayWarning,
  rupeesText,
} from '@/pages/payments/format';
import { dealerCodeLabel, formatPaise } from '@dk/shared';
import type { AdminPayment, ManualPaymentMode } from '@dk/shared';

import { DealerReceivesBox } from './DealerReceivesBox';

/**
 * "Record a refund made by hand": the way back for money that came by hand (bank,
 * UPI, cash, cheque). Razorpay never held it, so it cannot refund it; the money is
 * given back the way it came, outside this app, and this writes that down. The
 * server then counts the payment as refunded by that much and issues the GST credit
 * note, so the invoice does not stand for a month that was returned.
 *
 * A super-admin's action, as every refund is. NOTHING IS SENT from here: the words
 * say so. The amount starts at all that can still be written down. A rule that says
 * no (`pages/payments/format.ts` `manualRefundProblem`) says why in words once the
 * form has been tried; a failure comes back as a toast with the form left open.
 *
 * `payment` is the one being refunded; `null` is closed. Mounted only while open,
 * keyed on the payment, so a refresh underneath never wipes what is being typed.
 */
export function ManualRefundDialog({
  payment,
  onClose,
}: {
  payment: AdminPayment | null;
  onClose: () => void;
}) {
  if (!payment) return null;
  return <ManualRefundForm key={payment.id} payment={payment} onClose={onClose} />;
}

function ManualRefundForm({ payment, onClose }: { payment: AdminPayment; onClose: () => void }) {
  const toast = useToast();
  const record = useRecordManualRefund();
  const overview = useAutopayOverview(payment.dealerId);
  const amountId = React.useId();
  const dayId = React.useId();
  const modeId = React.useId();
  const refId = React.useId();
  const reasonId = React.useId();
  const today = istTodayYmd();
  const [draft, setDraft] = React.useState<ManualRefundDraft>(() => ({
    amountText: rupeesText(manualRefundable(payment)),
    refundedOn: today,
    // Money goes back the way it came.
    mode: payment.manual?.mode ?? 'bank',
    reference: '',
    reason: '',
  }));
  const [attempted, setAttempted] = React.useState(false);
  const problem = manualRefundProblem(draft, payment, today);
  const autopayWarning = refundAutopayWarning(payment, overview.data, today);
  const set = <K extends keyof ManualRefundDraft>(key: K, value: ManualRefundDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const reasonLength = draft.reason.trim().length;

  async function submit() {
    if (record.isPending) return;
    setAttempted(true);
    if (problem) return;
    try {
      const body = manualRefundBody(draft);
      await record.mutateAsync({ id: payment.id, ...body });
      toast.success(
        `Refund of ${formatPaise(body.amountPaise)} recorded. The GST credit note follows.`,
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open
      onClose={record.isPending ? () => {} : onClose}
      title="Record a refund made by hand"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={record.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={record.isPending}>
            Record refund
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
            {payment.number} · outlet {dealerCodeLabel(payment.dealerCode)}
          </p>
          <p className="mt-0.5 text-xs text-text-subtle">
            {payment.refundedPaise > 0
              ? `${formatPaise(payment.refundedPaise)} already given back. Up to ${formatPaise(manualRefundable(payment))} can be recorded.`
              : `Came in by hand. Up to ${formatPaise(manualRefundable(payment))} can be recorded.`}
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

        <Callout intent="info">
          Use this after you have given the money back yourself, the way it came: bank transfer,
          UPI, cash or cheque. No money is sent from here. The payment then counts as refunded, and
          the GST credit note follows.
        </Callout>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor={amountId} required hint="₹, what you gave back">
              Amount
            </Label>
            <Input
              id={amountId}
              inputMode="decimal"
              autoComplete="off"
              value={draft.amountText}
              onChange={(e) => set('amountText', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={dayId} required>
              Given back on
            </Label>
            <Input
              id={dayId}
              type="date"
              value={draft.refundedOn}
              min={payment.manual?.paidOn}
              max={today}
              onChange={(e) => set('refundedOn', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={modeId} required>
              How
            </Label>
            <Select
              id={modeId}
              value={draft.mode}
              onChange={(e) => set('mode', e.target.value as ManualPaymentMode)}
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
              value={draft.reference}
              onChange={(e) => set('reference', e.target.value)}
              placeholder="UTR or cheque number"
            />
          </div>
        </div>

        <div>
          <Label htmlFor={reasonId} required>
            Why
          </Label>
          <Textarea
            id={reasonId}
            rows={3}
            value={draft.reason}
            onChange={(e) => set('reason', e.target.value)}
            placeholder="For example: owner asked for the first month back on 26 Oct."
          />
          <p
            className={
              reasonLength > PAYMENT_REASON_MAX
                ? 'mt-1 text-right text-xs tabular-nums text-danger'
                : 'mt-1 text-right text-xs tabular-nums text-text-subtle'
            }
          >
            {reasonLength.toLocaleString('en-IN')} / {PAYMENT_REASON_MAX.toLocaleString('en-IN')}
          </p>
        </div>

        <FieldError message={attempted ? (problem ?? undefined) : undefined} />
        {!problem ? (
          <>
            <p className="text-xs text-text-muted">
              {manualRefundSentence(payment, manualRefundBody(draft).amountPaise)}
            </p>
            <DealerReceivesBox
              action={{
                kind: 'refund',
                amountPaise: manualRefundBody(draft).amountPaise,
                byHand: true,
              }}
            />
          </>
        ) : null}
      </form>
    </Dialog>
  );
}
