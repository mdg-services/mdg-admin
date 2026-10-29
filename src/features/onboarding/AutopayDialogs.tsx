import * as React from 'react';

import {
  Button,
  Dialog,
  FieldError,
  Input,
  Label,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { DealerReceivesBox } from '@/features/payments/DealerReceivesBox';
import {
  useAutopayFollowUp,
  useMoneyBack,
  usePayLinkInstead,
  useStopAutopay,
} from '@/hooks/api/useAutopay';
import { useOnboardingConfigQuery } from '@/hooks/api/useOnboarding';
import { useOpenBill } from '@/hooks/api/usePayments';
import { ApiError } from '@/lib/api';
import {
  AUTOPAY_FOLLOW_UP_MAX,
  AUTOPAY_STOP_NOTE_MAX,
  failedText,
  followUpNoteProblem,
  moneyBackWords,
  perMonth,
  refundDayProblem,
  stopNoteProblem,
} from '@/lib/autopay';
import {
  moneyBackAction,
  payLinkInsteadWords,
  stopAutopayAction,
  stopAutopayWords,
} from '@/lib/billingRelease';
import { istTodayYmd } from '@/lib/format';
import { istStamp } from '@/lib/intake';
import { PAYMENT_MODES, PAYMENT_MODE_LABEL } from '@/lib/onboarding';
import {
  AUTOPAY_ENDED_BY_LABELS,
  AUTOPAY_STOP_REASONS,
  AUTOPAY_STOP_REASON_LABELS,
  dealerCodeLabel,
  formatPaise,
  type AdminAutopay,
  type AutopayFirstMonth,
  type AutopayStopReason,
  type ManualPaymentMode,
  type SendSetupBillResult,
} from '@dk/shared';

import { BillResultDialog } from './BillingDialogs';

/**
 * What a refused press says. Decided by the server's error code, not its HTTP
 * status: "Razorpay is switched off" and "Razorpay did not answer" are both 503s.
 */
export function errorText(err: unknown): string {
  return err instanceof ApiError
    ? failedText(err.status, err.message, err.code)
    : failedText(undefined, err instanceof Error ? err.message : undefined);
}

/**
 * "Stop autopay": an admin stopping it on the owner's word. The note is required
 * and says who asked and how, because it is the only record of why money stopped
 * coming; the reason is optional and never blocks the stop.
 *
 * Nothing here ends the service. The paid month runs out as it would have, and the
 * next bill goes to the owner as a link. Mounted only while open, so what was
 * typed never survives into the next one.
 */
export function StopAutopayDialog({
  autopay,
  code,
  onClose,
}: {
  autopay: AdminAutopay;
  code: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const stop = useStopAutopay();
  // A bill autopay was meant to take goes out as a link once autopay stops: the preview says so.
  const openBill = useOpenBill(autopay.dealerId);
  const noteId = React.useId();
  const reasonId = React.useId();
  const [note, setNote] = React.useState('');
  const [reason, setReason] = React.useState<AutopayStopReason | ''>('');
  const [touched, setTouched] = React.useState(false);
  const problem = stopNoteProblem(note);
  // What the preview below lists, said in one sentence above it: the two must agree.
  const stopFacts = stopAutopayAction({
    bill: openBill.bill,
    firstBillWaiting: autopay.state === 'setting_up' && !!autopay.firstBillId,
    approved: autopay.approvedAt !== null,
    today: istTodayYmd(),
  });
  const stopWords = stopAutopayWords(stopFacts);

  async function submit() {
    if (stop.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await stop.mutateAsync({ id: autopay.id, note: note.trim(), ...(reason ? { reason } : {}) });
      toast.success(
        autopay.approvedAt !== null
          ? 'Autopay stopped. The next bill goes to the owner as a link.'
          : stopFacts.billWaiting
            ? 'Approval stopped. The first bill goes to the owner as a one-time payment link.'
            : 'Approval stopped.',
      );
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={stop.isPending ? () => {} : onClose}
      title="Stop autopay"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={stop.isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={stop.isPending}>
            Stop autopay
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
        <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 text-sm [overflow-wrap:anywhere]">
          <span className="font-medium text-text">{dealerCodeLabel(code)}</span>
          <span className="text-text-muted"> · {perMonth(autopay.amountPaise)}</span>
        </div>

        <p className="text-sm leading-relaxed text-text-muted">
          {stopWords}
        </p>

        <div>
          <Label htmlFor={noteId} required>
            Who asked, and how
          </Label>
          <Textarea
            id={noteId}
            rows={2}
            value={note}
            maxLength={AUTOPAY_STOP_NOTE_MAX + 50}
            onChange={(e) => setNote(e.target.value)}
            invalid={touched && problem !== null}
            placeholder="Who asked, and how — e.g. Owner on phone, 25 Oct"
          />
          <FieldError message={touched ? (problem ?? undefined) : undefined} />
        </div>

        <div>
          <Label htmlFor={reasonId} hint="Optional">
            Why, if they said
          </Label>
          <Select
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value as AutopayStopReason | '')}
          >
            <option value="">Not said</option>
            {AUTOPAY_STOP_REASONS.map((r) => (
              <option key={r} value={r}>
                {AUTOPAY_STOP_REASON_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>

        <DealerReceivesBox action={stopFacts} />
      </form>
    </Dialog>
  );
}

/**
 * "Mark call done": somebody rang the owner after an autopay stopped, and writes
 * what they heard. Saving it is what clears the "Autopay stopped" alert, so the
 * note is required: a call nobody wrote down is not a call anybody can learn from.
 * Mounted only while open.
 */
export function FollowUpDialog({
  autopay,
  code,
  onClose,
}: {
  autopay: AdminAutopay;
  code: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const followUp = useAutopayFollowUp();
  const noteId = React.useId();
  const [note, setNote] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const problem = followUpNoteProblem(note);
  const how = autopay.endedBy ? AUTOPAY_ENDED_BY_LABELS[autopay.endedBy] : 'Autopay ended';
  const when = istStamp(autopay.endedAt);
  const why = autopay.stopReason ? AUTOPAY_STOP_REASON_LABELS[autopay.stopReason] : null;

  async function submit() {
    if (followUp.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await followUp.mutateAsync({ id: autopay.id, note: note.trim() });
      toast.success('Call saved. The alert is cleared.');
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={followUp.isPending ? () => {} : onClose}
      title="Mark call done"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={followUp.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={followUp.isPending}>
            Mark call done
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
        <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 text-sm [overflow-wrap:anywhere]">
          <span className="font-medium text-text">{dealerCodeLabel(code)}</span>
          <span className="text-text-muted">
            {' · '}
            {how}
            {when ? `, ${when}` : ''}
          </span>
          {why ? <p className="mt-0.5 text-xs text-text-muted">{why}</p> : null}
          {autopay.stopNote ? (
            <p className="mt-0.5 select-text text-xs text-text-muted">{autopay.stopNote}</p>
          ) : null}
        </div>

        <div>
          <Label htmlFor={noteId} required>
            What did the owner say?
          </Label>
          <Textarea
            id={noteId}
            rows={3}
            value={note}
            maxLength={AUTOPAY_FOLLOW_UP_MAX + 50}
            onChange={(e) => setNote(e.target.value)}
            invalid={touched && problem !== null}
            placeholder="For example: switched it off to pay by hand, will pay on the 1st."
          />
          <FieldError message={touched ? (problem ?? undefined) : undefined} />
        </div>

        <p className="text-xs text-text-muted">
          This does not message the owner. Saving it clears the alert.
        </p>
      </form>
    </Dialog>
  );
}

/**
 * "Give the first month back": the money-back promise, kept in one press. Autopay
 * is stopped FIRST (so no debit follows the refund), then the first bill is
 * refunded in full and its credit note issued. If Razorpay cannot stop autopay,
 * nothing is refunded and the error says so. Super-admins only, as every refund is.
 * After it no more monthly bills are raised for the outlet and a bill already
 * raised for the next month is cancelled. The services do not stop: that is
 * archiving the outlet.
 */
export function MoneyBackDialog({
  dealerId,
  code,
  firstMonth,
  autopayRunning,
  onClose,
}: {
  dealerId: string;
  code: string;
  firstMonth: AutopayFirstMonth;
  /** The outlet's current autopay is approved and not ended: it is stopped first and the owner is told. */
  autopayRunning: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const moneyBack = useMoneyBack();
  const noteId = React.useId();
  const modeId = React.useId();
  const dayId = React.useId();
  const refId = React.useId();
  const today = istTodayYmd();
  const byHand = firstMonth.paidByHand;
  const [note, setNote] = React.useState('');
  const [mode, setMode] = React.useState<ManualPaymentMode>('bank');
  const [refundedOn, setRefundedOn] = React.useState(today);
  const [reference, setReference] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const problem = stopNoteProblem(note);
  // Not before the day the money came, not in the future: checked here so autopay
  // is never stopped for a press the server would then refuse.
  const dayProblem = byHand ? refundDayProblem(refundedOn, firstMonth.paidOn, today) : null;
  // What came is what goes back: less than the bill when tax was deducted at source.
  const amount = formatPaise(byHand ? firstMonth.paidPaise : firstMonth.amountPaise);

  async function submit() {
    if (moneyBack.isPending) return;
    setTouched(true);
    if (problem || dayProblem) return;
    try {
      await moneyBack.mutateAsync({
        dealerId,
        note: note.trim(),
        ...(byHand
          ? {
              manual: {
                mode,
                refundedOn,
                ...(reference.trim() ? { reference: reference.trim() } : {}),
              },
            }
          : {}),
      });
      toast.success(
        `${amount} is going back to the owner. Autopay is stopped and no more bills will be raised.`,
      );
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={moneyBack.isPending ? () => {} : onClose}
      title="Give the first month back"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={moneyBack.isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={moneyBack.isPending}>
            Refund {amount}
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
        <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 text-sm [overflow-wrap:anywhere]">
          <span className="font-medium text-text">{dealerCodeLabel(code)}</span>
          <span className="text-text-muted">
            {' · '}
            {firstMonth.number} · {amount}
          </span>
        </div>

        <p className="text-sm leading-relaxed text-text-muted">{moneyBackWords(amount)}</p>

        {byHand ? (
          <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-2">
            <p className="text-sm text-text md:col-span-2">
              The first month came by hand, so give the {amount} back yourself the same way, then
              say here how and when. No money is sent from here.
            </p>
            <div>
              <Label htmlFor={modeId} required>
                How it went back
              </Label>
              <Select
                id={modeId}
                value={mode}
                onChange={(e) => setMode(e.target.value as ManualPaymentMode)}
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_MODE_LABEL[m]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={dayId} required>
                Given back on
              </Label>
              <Input
                id={dayId}
                type="date"
                value={refundedOn}
                min={firstMonth.paidOn ?? undefined}
                max={today}
                onChange={(e) => setRefundedOn(e.target.value)}
              />
              <FieldError message={touched ? (dayProblem ?? undefined) : undefined} />
            </div>
            <div className="md:col-span-2">
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
        ) : null}

        <div>
          <Label htmlFor={noteId} required>
            Who asked, and why
          </Label>
          <Textarea
            id={noteId}
            rows={2}
            value={note}
            maxLength={AUTOPAY_STOP_NOTE_MAX + 50}
            onChange={(e) => setNote(e.target.value)}
            invalid={touched && problem !== null}
            placeholder="For example: owner on phone 26 Oct, not happy with the reports"
          />
          <FieldError message={touched ? (problem ?? undefined) : undefined} />
        </div>

        <DealerReceivesBox action={moneyBackAction(firstMonth, autopayRunning)} />
      </form>
    </Dialog>
  );
}

/**
 * "Send a pay link instead": the first month's autopay approval has been out and the
 * owner has not approved it (their bank may not do UPI autopay, or they would rather
 * pay once). The approval is stopped and the first bill goes out as a one-time payment
 * link: Razorpay's SMS and email, and the bill on WhatsApp.
 *
 * It says one thing: the approval link stops working and the first bill goes as a
 * link. If the server cannot stop the approval it refuses, in plain words, and the
 * toast shows that sentence. An approval that already ran out is not running any
 * more, so for that one nothing is said about stopping it.
 *
 * It needs only what the press needs (the outlet, the amount, when the approval was
 * to run out), not a live autopay: an approval that ran out unused has none.
 *
 * On success it shows the same result panel "Send bill" shows (the answer has the same
 * shape), with the new link to copy and the WhatsApp words. Mounted only while open.
 */
export function PayLinkInsteadDialog({
  dealerId,
  code,
  amountPaise,
  approvalExpiresAt,
  ranOut,
  onClose,
}: {
  dealerId: string;
  code: string;
  /** What the first bill is for, GST included. */
  amountPaise: number;
  /** When the approval link was to stop working (ISO); null when not known. */
  approvalExpiresAt: string | null;
  /** The approval has already ended or run out: nothing is said about stopping it. */
  ranOut: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const swap = usePayLinkInstead();
  const config = useOnboardingConfigQuery(true);
  const noteId = React.useId();
  const [note, setNote] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [result, setResult] = React.useState<SendSetupBillResult | null>(null);
  const trimmed = note.trim();
  // Optional, but a note that is there must be a real one (the server's own limits).
  const problem =
    trimmed.length === 0
      ? null
      : trimmed.length < 3
        ? 'Write a little more: at least 3 characters.'
        : trimmed.length > AUTOPAY_STOP_NOTE_MAX
          ? `That is ${trimmed.length} characters. Keep it to ${AUTOPAY_STOP_NOTE_MAX}.`
          : null;

  async function submit() {
    if (swap.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      const r = await swap.mutateAsync({
        dealerId,
        ...(trimmed ? { note: trimmed } : {}),
      });
      setResult(r);
      toast.success(
        ranOut ? 'The pay link is on its way.' : 'Autopay approval stopped. The pay link is on its way.',
      );
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  if (result) return <BillResultDialog result={result} outlet={result.setup} onClose={onClose} />;

  return (
    <Dialog
      open
      onClose={swap.isPending ? () => {} : onClose}
      title="Send a pay link instead"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={swap.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={swap.isPending}>
            Send the pay link
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
        <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 text-sm [overflow-wrap:anywhere]">
          <span className="font-medium text-text">{dealerCodeLabel(code)}</span>
          <span className="text-text-muted"> · first bill {formatPaise(amountPaise)}</span>
        </div>

        <p className="text-sm leading-relaxed text-text-muted">
          {payLinkInsteadWords(ranOut, approvalExpiresAt, Date.now())}
        </p>

        <div>
          <Label htmlFor={noteId} hint="Optional">
            Why
          </Label>
          <Textarea
            id={noteId}
            rows={2}
            value={note}
            maxLength={AUTOPAY_STOP_NOTE_MAX + 50}
            onChange={(e) => setNote(e.target.value)}
            invalid={touched && problem !== null}
            placeholder="For example: owner's bank does not do UPI autopay, asked for a link."
          />
          <FieldError message={touched ? (problem ?? undefined) : undefined} />
        </div>

        <DealerReceivesBox
          action={{
            kind: 'pay_link_instead',
            amountPaise,
            paymentsOn: config.data?.paymentsConfigured ?? true,
          }}
        />
      </form>
    </Dialog>
  );
}
