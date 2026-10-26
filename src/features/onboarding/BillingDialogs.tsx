import { Check, Copy, MessageCircle } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  Button,
  Callout,
  Copyable,
  Dialog,
  FieldError,
  Input,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import { useAutopayOverview } from '@/hooks/api/useAutopay';
import { usePauseBilling, useSendBill } from '@/hooks/api/useBilling';
import { useOnboardingConfigQuery } from '@/hooks/api/useOnboarding';
import { FIRST_BILL_AUTOPAY_RESEND_WORDS, firstBillAutopayWaiting } from '@/lib/autopay';
import { billOutcome, waLinkWithText, type BillOutcome } from '@/lib/billing';
import { copyText } from '@/lib/clipboard';
import { istTodayYmd } from '@/lib/format';
import {
  amountProblem,
  billBody,
  billProblem,
  chosenMessageLang,
  defaultDueOn,
  formatPaise,
  isDay,
  messageLangLabel,
  paiseToRupeesText,
  ymdLabel,
} from '@/lib/onboarding';
import {
  dealerCodeLabel,
  type OutletSetupAdmin,
  type SendSetupBillResult,
  type SetupMessageLang,
} from '@dk/shared';

import { MessageLangField } from './MessageLangField';

/**
 * The two forms billing adds to an outlet's Setup card (onboarding v2 phases 3
 * and 9): Send bill and Pause for non-payment. (Record payment received is
 * `features/payments/RecordPaymentDialog`, shared with the Payments page.)
 *
 * Same shape as `SetupDialogs`: `outlet` (or `target`) is what the form is about,
 * `null` is closed, and each export mounts the real form only while one is open,
 * keyed on what it is about, so the board refreshing underneath never resets what
 * the person is typing. A rule that says no (`lib/onboarding.ts`, `lib/billing.ts`)
 * disables the button and, once the person has touched the form, says why in
 * words; a failure comes back from the server as a toast with the form left open.
 *
 * NOTHING HERE ASKS THE DEALER FOR MONEY INSIDE THE APP. The bill is raised as a
 * payment and goes out on Razorpay's SMS and on WhatsApp — outside the app (ADR 0022
 * §1) — and the dealer's app shows what is due, read-only.
 */

const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : 'That did not go through.';

/** The line that says which outlet a form is for. */
function ForOutlet({ outlet }: { outlet: Pick<OutletSetupAdmin, 'code' | 'ownerName'> }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 [overflow-wrap:anywhere]">
      <p className="text-sm font-medium text-text">
        {dealerCodeLabel(outlet.code)}
        {outlet.ownerName ? (
          <span className="font-normal text-text-muted"> · {outlet.ownerName}</span>
        ) : null}
      </p>
    </div>
  );
}

// ── Send bill ───────────────────────────────────────────────────────────────

export function SendBillDialog({
  outlet,
  onClose,
}: {
  outlet: OutletSetupAdmin | null;
  onClose: () => void;
}) {
  return outlet ? <SendBillForm key={outlet.dealerId} outlet={outlet} onClose={onClose} /> : null;
}

function SendBillForm({ outlet, onClose }: { outlet: OutletSetupAdmin; onClose: () => void }) {
  const toast = useToast();
  const send = useSendBill();
  const config = useOnboardingConfigQuery(true);
  const autopay = useAutopayOverview(outlet.dealerId);
  const amountId = React.useId();
  const dueId = React.useId();
  const billed = outlet.payment.amountPaise;
  const [amount, setAmount] = React.useState(() => paiseToRupeesText(billed));
  const [typed, setTyped] = React.useState(false);
  const [dueOn, setDueOn] = React.useState(
    () => outlet.payment.dueOn ?? defaultDueOn(istTodayYmd()),
  );
  const [touched, setTouched] = React.useState(false);
  const [result, setResult] = React.useState<SendSetupBillResult | null>(null);
  // The WhatsApp's language: what the person picked; until they do, the outlet's default.
  const [pickedLang, setPickedLang] = React.useState<SetupMessageLang | null>(null);
  const today = istTodayYmd();

  // The flat monthly price, until the person types something else. It arrives
  // after the form opens, so it must not overwrite what has been typed, and it is
  // not used when the outlet already has a billed amount.
  const price = config.data?.monthlyPricePaise;
  const dueDays = config.data?.dueDays;
  React.useEffect(() => {
    if (!typed && !billed && price) setAmount(paiseToRupeesText(price));
  }, [typed, billed, price]);
  React.useEffect(() => {
    if (!outlet.payment.dueOn && dueDays && !touched) setDueOn(defaultDueOn(today, dueDays));
  }, [dueDays, outlet.payment.dueOn, touched, today]);

  const problem = billProblem({ amountText: amount, dueOn }, today);
  const amountBad = touched && amountProblem(amount) !== null;
  const dueBad = touched && (!isDay(dueOn) || dueOn < today);
  const again = outlet.payment.state === 'sent';

  async function submit() {
    if (send.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      const r = await send.mutateAsync({
        dealerId: outlet.dealerId,
        // The language that is on screen, as the person saw it.
        body: billBody({
          amountText: amount,
          dueOn,
          messageLang: chosenMessageLang(pickedLang, outlet.messageLang),
        }),
      });
      setResult(r);
      toast.success(
        r.created
          ? `Bill ${r.payment.number} raised: ${formatPaise(r.setup.payment.amountPaise)}, due ${ymdLabel(r.setup.payment.dueOn)}.`
          : `Bill ${r.payment.number} sent again.`,
      );
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  if (result) return <BillResultDialog result={result} outlet={outlet} onClose={onClose} />;

  return (
    <Dialog
      open
      onClose={onClose}
      title={again ? 'Send the bill again' : 'Send bill'}
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={send.isPending}>
            {again ? 'Send again' : 'Send bill'}
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
        <ForOutlet outlet={outlet} />
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor={amountId} required hint="₹, GST included">
              Amount
            </Label>
            <Input
              id={amountId}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => {
                setTyped(true);
                setAmount(e.target.value);
              }}
              placeholder="3540"
              invalid={amountBad}
            />
          </div>
          <div>
            <Label htmlFor={dueId} required>
              Due on
            </Label>
            <Input
              id={dueId}
              type="date"
              value={dueOn}
              min={today}
              onChange={(e) => setDueOn(e.target.value)}
              invalid={dueBad}
            />
          </div>
        </div>
        <FieldError message={touched ? (problem ?? undefined) : undefined} />
        <MessageLangField
          picked={pickedLang}
          fallback={outlet.messageLang}
          onPick={setPickedLang}
          disabled={send.isPending}
        />
        {again ? (
          <Callout intent="info">
            A bill is already out. With the same amount and day it is only sent again; with another
            it is replaced, and the old one is cancelled.
          </Callout>
        ) : null}
        {/* The server refuses a replacement at another amount while the autopay is out
            (FIRST_BILL_HAS_AUTOPAY); its own sentence is shown if it does. */}
        {firstBillAutopayWaiting(autopay.data?.current) ? (
          <Callout intent="warning">{FIRST_BILL_AUTOPAY_RESEND_WORDS}</Callout>
        ) : null}
        <p className="text-xs text-text-muted">
          {config.data?.paymentsConfigured
            ? 'This raises the bill as a payment, and Razorpay texts the owner a payment link. You then get the WhatsApp message to send (or it goes by itself once the template is approved).'
            : 'Razorpay is not switched on, so there is no payment link. This raises the bill as a payment and gives you the WhatsApp message to send: add your UPI or bank details to it before you do.'}{' '}
          In the dealer&rsquo;s app they see only the amount and the due date, never how to pay.
        </p>
      </form>
    </Dialog>
  );
}

/** What "Send bill" did, and what is left for the person to do by hand. */
function BillResultDialog({
  result,
  outlet,
  onClose,
}: {
  result: SendSetupBillResult;
  outlet: OutletSetupAdmin;
  onClose: () => void;
}) {
  const toast = useToast();
  const out = billOutcome(result);
  const [copied, setCopied] = React.useState(false);
  const draft = out.whatsapp.state === 'by_hand' ? out.whatsapp.message : '';
  const [message, setMessage] = React.useState(draft);

  async function copy() {
    if (await copyText(message)) {
      setCopied(true);
      toast.success('Message copied');
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error('Could not copy. Select the message and copy it by hand.');
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={out.headline}
      footerBelow="row"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="grid gap-3">
        <ForOutlet outlet={outlet} />
        <SmsLine out={out} />
        {out.link ? <Copyable label="Payment link" value={out.link} mono /> : null}
        <WhatsAppPart
          out={out}
          message={message}
          onMessage={setMessage}
          copied={copied}
          onCopy={() => void copy()}
          hasLink={out.link !== null}
          langLabel={messageLangLabel(result.messageLang)}
        />
        <p className="text-xs text-text-muted">
          The bill is on the{' '}
          <Link
            className="font-semibold text-brand underline"
            to={`/payments?payment=${result.payment.id}`}
            onClick={onClose}
          >
            Payments page
          </Link>
          . When the money comes, record it there or from this outlet&rsquo;s Setup card.
        </p>
      </div>
    </Dialog>
  );
}

function SmsLine({ out }: { out: BillOutcome }) {
  const tone =
    out.sms.state === 'sent'
      ? 'border-success bg-success-soft text-success-strong md:text-success'
      : out.sms.state === 'not_sent'
        ? 'border-warning bg-warning-soft text-warning-strong md:text-warning'
        : 'border-border bg-surface-2 text-text-muted';
  return (
    <div className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${tone}`}>
      {out.sms.state === 'sent' ? (
        <Check width={16} height={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
      ) : null}
      <span>{out.sms.text}</span>
    </div>
  );
}

function WhatsAppPart({
  out,
  message,
  onMessage,
  copied,
  onCopy,
  hasLink,
  langLabel,
}: {
  out: BillOutcome;
  message: string;
  onMessage: (text: string) => void;
  copied: boolean;
  onCopy: () => void;
  hasLink: boolean;
  /** The language the message is in ("Hinglish" / "English"), as the server wrote it. */
  langLabel: string;
}) {
  const textId = React.useId();
  if (out.whatsapp.state === 'sent') {
    return (
      <div className="flex items-start gap-2 rounded-md border border-success bg-success-soft p-2.5 text-sm text-success-strong md:text-success">
        <Check width={16} height={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          {out.whatsapp.text} It went in {langLabel}.
        </span>
      </div>
    );
  }
  return (
    <>
      <Callout intent="warning">
        The WhatsApp message was not sent. {out.whatsapp.text.replace(/[.\s]+$/, '')}. Send it from
        your phone.
        {hasLink
          ? ''
          : ' There is no payment link in it: add your UPI or bank details before you send.'}
      </Callout>
      <div>
        <Label htmlFor={textId}>
          Message to send
          <span className="ml-2 text-xs font-normal text-text-subtle">in {langLabel}</span>
        </Label>
        <Textarea
          id={textId}
          rows={6}
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          className="select-text"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* WhatsApp's own link: opens the chat with the words as they stand now. */}
        <a
          href={waLinkWithText(out.whatsapp.waLink, message)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 min-h-11 items-center gap-2 rounded-md bg-success px-4 text-sm font-semibold text-white hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
        >
          <MessageCircle width={16} height={16} strokeWidth={1.75} aria-hidden />
          Open WhatsApp
        </a>
        <Button
          variant="secondary"
          onClick={onCopy}
          leftIcon={copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
        >
          {copied ? 'Copied' : 'Copy message'}
        </Button>
      </div>
    </>
  );
}

// ── Pause for non-payment ───────────────────────────────────────────────────

export function PauseBillingDialog({
  outlet,
  onClose,
}: {
  outlet: OutletSetupAdmin | null;
  onClose: () => void;
}) {
  return outlet ? <PauseForm key={outlet.dealerId} outlet={outlet} onClose={onClose} /> : null;
}

const PAUSE_REASON_MIN = 3;
const PAUSE_REASON_MAX = 300;

function PauseForm({ outlet, onClose }: { outlet: OutletSetupAdmin; onClose: () => void }) {
  const toast = useToast();
  const pause = usePauseBilling();
  const reasonId = React.useId();
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const n = reason.trim().length;
  const problem =
    n < PAUSE_REASON_MIN
      ? `Say why, in at least ${PAUSE_REASON_MIN} characters.`
      : n > PAUSE_REASON_MAX
        ? `Keep it under ${PAUSE_REASON_MAX} characters. It is ${n} now.`
        : null;

  async function submit() {
    if (pause.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await pause.mutateAsync({ dealerId: outlet.dealerId, reason: reason.trim() });
      toast.success(`${dealerCodeLabel(outlet.code)}: services paused.`);
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={pause.isPending ? () => {} : onClose}
      title="Pause for non-payment"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pause.isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={pause.isPending}>
            Pause services
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
        <ForOutlet outlet={outlet} />
        <Callout intent="warning">
          This stops every service that is running for this outlet. It is not an archive: the dealer
          still signs in and still sees the bill. &ldquo;Resume services&rdquo; brings back exactly
          the ones this stops.
        </Callout>
        <div>
          <Label htmlFor={reasonId} required>
            Why
          </Label>
          <Textarea
            id={reasonId}
            rows={3}
            value={reason}
            maxLength={PAUSE_REASON_MAX + 50}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: the October bill is 20 days overdue and they are not answering."
            invalid={touched && !!problem}
          />
          <FieldError message={touched ? (problem ?? undefined) : undefined} />
        </div>
      </form>
    </Dialog>
  );
}
