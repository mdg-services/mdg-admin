import { ExternalLink } from 'lucide-react';
import * as React from 'react';

import {
  ActionRow,
  Badge,
  Button,
  Copyable,
  DealerChip,
  Drawer,
  EmptyState,
  KeyValueList,
  type KeyValueItem,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  useMarkPaymentProblemChecked,
  usePaymentLink,
  usePaymentQuery,
  usePaymentsConfigQuery,
  useRefreshPayment,
  useResendPaymentLink,
} from '@/hooks/api/usePayments';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { manualDrawerLines } from '@/lib/billing';
import { copyText } from '@/lib/clipboard';
import { formatYmd, istTodayYmd } from '@/lib/format';
import { istStamp } from '@/lib/intake';
import { PAYMENT_MODE_LABEL } from '@/lib/onboarding';
import {
  ATTEMPT_LABELS,
  REFUND_LABELS,
  type RazorpayThing,
  allowedActions,
  attemptTone,
  byAt,
  canEditBillTo,
  channelLabel,
  checkOutcome,
  dashboardUrl,
  extraCaptureLine,
  hasOpenProblem,
  linkSentLine,
  methodLabel,
  newestFirst,
  refundLine,
  refundTone,
  sendSmsLabel,
  statusHint,
  statusTone,
  wasPaid,
} from '@/pages/payments/format';
import {
  PAYMENT_PURPOSE_LABELS,
  PAYMENT_STATUS_LABELS,
  dealerCodeLabel,
  formatPaise,
} from '@dk/shared';
import type { AdminPayment } from '@dk/shared';

import { BillToDialog } from './BillToDialog';
import { CancelPaymentDialog } from './CancelPaymentDialog';
import { BillToCard, CreditNotesBody, InvoiceBody } from './GstSections';
import { ManualRefundDialog } from './ManualRefundDialog';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import { RefundPaymentDialog } from './RefundPaymentDialog';

/** The same 44px-on-a-phone link as the other pages' contact links. */
const LINK =
  'inline-flex min-h-11 max-w-full select-text items-center gap-1 rounded-sm text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0';

/**
 * One payment, in full: what it is, where it stands, what an admin can do about
 * it, and everything that has happened to it.
 *
 * Opened by `?payment=<id>` on the Payments page, so the link the activity log
 * and the `payment_problem` alert carry lands here. It fetches the payment
 * itself rather than being handed a row from the list, because that payment
 * need not be on the page the list is showing.
 *
 * The actions sit at the top, under the status, and not in a footer: there can
 * be five of them, and a footer of five buttons on a phone is a third of the
 * screen. They are offered only when the server would accept them
 * (`allowedActions`), and refund is shown to a super-admin alone.
 *
 * Below the details come the GST pieces (ADR 0022 §11): who the invoice is made
 * out to (editable until it is issued), the invoice itself with its Download, and
 * a credit note for each refund that went through.
 *
 * `id` is the payment to show; `null` is closed.
 */
export function PaymentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = usePaymentQuery(id);
  const p = q.data;

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={p?.number ?? 'Payment'}
      description={p ? `Outlet ${dealerCodeLabel(p.dealerCode)} · ${p.title}` : undefined}
    >
      {q.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : p ? (
        <PaymentBody payment={p} />
      ) : (
        // Not "empty": a payment that cannot be read is not a payment that does not exist.
        <EmptyState
          title="Could not open this payment"
          description={
            q.error instanceof Error && q.error.message
              ? q.error.message
              : 'It may have been removed, or the connection dropped. Try again.'
          }
          cta={
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
              Try again
            </Button>
          }
        />
      )}
    </Drawer>
  );
}

function PaymentBody({ payment: p }: { payment: AdminPayment }) {
  const toast = useToast();
  const isSuperAdmin = useIsSuperAdmin();
  const config = usePaymentsConfigQuery().data;
  const makeLink = usePaymentLink();
  const resend = useResendPaymentLink();
  const refresh = useRefreshPayment();
  const checked = useMarkPaymentProblemChecked();
  const [cancelling, setCancelling] = React.useState(false);
  const [refunding, setRefunding] = React.useState(false);
  const [handRefunding, setHandRefunding] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [editingBillTo, setEditingBillTo] = React.useState(false);
  // The link, shown for copying by hand — only when this device refused to copy it for us.
  const [manualLink, setManualLink] = React.useState<string | null>(null);

  // A different payment starts clean.
  React.useEffect(() => {
    setManualLink(null);
    setCancelling(false);
    setRefunding(false);
    setHandRefunding(false);
    setRecording(false);
    setEditingBillTo(false);
  }, [p.id]);

  const can = allowedActions(p, isSuperAdmin);
  const busy = makeLink.isPending || resend.isPending || refresh.isPending || checked.isPending;
  const today = istTodayYmd();
  const failedMessage = (e: unknown) =>
    e instanceof Error && e.message ? e.message : 'That did not go through.';

  async function onCopyLink() {
    try {
      const link = await makeLink.mutateAsync(p.id);
      if (await copyText(link.url)) {
        setManualLink(null);
        toast.success('Link copied. Paste it into WhatsApp.');
      } else {
        setManualLink(link.url);
        toast.info(
          'This device would not let the app copy. The link is shown below — long-press it and choose Copy.',
          { duration: 8000 },
        );
      }
    } catch (e) {
      toast.error(failedMessage(e));
    }
  }

  async function onSendSms() {
    try {
      await resend.mutateAsync(p.id);
      toast.success('Asked Razorpay to send the link.');
    } catch (e) {
      toast.error(failedMessage(e));
    }
  }

  async function onCheck() {
    const before = p.status;
    try {
      const after = await refresh.mutateAsync(p.id);
      const text = checkOutcome(before, after.status);
      if (after.status !== before) toast.success(text);
      else toast.info(text);
    } catch (e) {
      toast.error(failedMessage(e));
    }
  }

  async function onMarkChecked() {
    try {
      await checked.mutateAsync(p.id);
      toast.success('Marked as checked.');
    } catch (e) {
      toast.error(failedMessage(e));
    }
  }

  const details: KeyValueItem[] = [
    {
      key: 'outlet',
      label: 'Outlet',
      value: <DealerChip dealerId={p.dealerId} code={p.dealerCode} />,
    },
    { key: 'title', label: 'What it is for', value: p.title },
    { key: 'purpose', label: 'Kind', value: PAYMENT_PURPOSE_LABELS[p.purpose] },
    ...(p.note ? [{ key: 'note', label: 'Note', value: p.note, block: true }] : []),
    { key: 'due', label: 'Due date', value: p.dueDate ? formatYmd(p.dueDate) : '—' },
    ...(p.autopayOn
      ? [{ key: 'autopayOn', label: 'Autopay takes it', value: formatYmd(p.autopayOn) }]
      : []),
    { key: 'raised', label: 'Raised', value: byAt(p.createdByName, p.createdAt) },
    { key: 'number', label: 'Receipt number', value: p.number, mono: true, copyable: true },
    ...(p.paidAt
      ? [
          { key: 'paid', label: 'Paid', value: istStamp(p.paidAt) },
          {
            key: 'how',
            label: 'How it was paid',
            value: `${methodLabel(p.method)} · ${channelLabel(p.paidVia)}`,
          },
        ]
      : []),
    // Money recorded by hand: what came, the bank's reference, who recorded it, any shortfall.
    ...(p.manual
      ? manualDrawerLines(p.manual, PAYMENT_MODE_LABEL[p.manual.mode]).map((l) => ({
          ...l,
          block: true,
        }))
      : []),
    ...(p.subscriptionPeriod
      ? [
          {
            key: 'period',
            label: 'Pays for',
            value: `${formatYmd(p.subscriptionPeriod.from)} to ${formatYmd(p.subscriptionPeriod.to)}`,
          },
        ]
      : []),
    ...(p.feePaise != null
      ? [{ key: 'fee', label: 'Razorpay fee', value: formatPaise(p.feePaise) }]
      : []),
    ...(p.taxPaise != null
      ? [{ key: 'tax', label: 'GST on that fee', value: formatPaise(p.taxPaise) }]
      : []),
    ...(p.refundedPaise > 0
      ? [
          {
            key: 'refunded',
            label: 'Given back so far',
            value: formatPaise(p.refundedPaise),
          },
        ]
      : []),
    ...(p.lastFailure
      ? [
          {
            key: 'failure',
            label: 'Last failed try',
            value: `${p.lastFailure.reason} · ${istStamp(p.lastFailure.at)}`,
            block: true,
          },
        ]
      : []),
    ...(linkSentLine(p)
      ? [{ key: 'sentTo', label: 'Link sent to', value: linkSentLine(p), block: true }]
      : []),
    ...(p.linkUrl
      ? [
          {
            key: 'link',
            label: 'Payment link',
            value: p.linkUrl,
            mono: true,
            copyable: true,
            block: true,
          },
        ]
      : []),
    ...(p.cancelledAt
      ? [
          {
            key: 'cancelled',
            label: 'Cancelled',
            value: byAt(p.cancelledByName, p.cancelledAt),
          },
          ...(p.cancelReason
            ? [{ key: 'why', label: 'Why', value: p.cancelReason, block: true }]
            : []),
        ]
      : []),
    { key: 'updated', label: 'Last updated', value: istStamp(p.updatedAt) || '—' },
  ];

  const references: KeyValueItem[] = [
    {
      key: 'pay',
      label: 'Payment id',
      value: <RazorpayId kind="payment" id={p.razorpayPaymentId} />,
    },
    { key: 'order', label: 'Order id', value: <RazorpayId kind="order" id={p.razorpayOrderId} /> },
    {
      key: 'plink',
      label: 'Link id',
      value: <RazorpayId kind="link" id={p.razorpayLinkId} />,
    },
    // Only a bill an autopay was meant to take (or took) has one.
    ...(p.razorpaySubscriptionId
      ? [
          {
            key: 'subscription',
            label: 'Subscription id',
            value: <RazorpayId kind="subscription" id={p.razorpaySubscriptionId} />,
          },
        ]
      : []),
  ];

  const attempts = newestFirst(p.attempts, (a) => a.at);
  const refunds = newestFirst(p.refunds, (r) => r.createdAt);
  const extras = newestFirst(p.extraCaptures, (c) => c.at);
  // A server that has not been updated yet sends no list; that must not blank the drawer.
  const creditNotes = p.creditNotes ?? [];

  return (
    <div className="grid gap-5">
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tabular-nums text-text">
            {formatPaise(p.amountPaise)}
          </span>
          <Badge intent={statusTone(p.status)}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
        </div>
        <p className="mt-1 text-sm text-text-muted">{statusHint(p, today)}</p>
      </div>

      {hasOpenProblem(p) && p.problem ? (
        // Not a Callout: this one is red, and it carries the button that clears it.
        <div className="break-words rounded-md border border-danger bg-danger-soft px-3 py-2 text-xs text-danger-strong md:text-danger">
          <p className="text-sm font-semibold">Needs a look</p>
          <p className="mt-0.5 select-text">{p.problem.reason}</p>
          <p className="mt-0.5 opacity-80">{istStamp(p.problem.at)}</p>
          {can.markChecked ? (
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              loading={checked.isPending}
              disabled={busy && !checked.isPending}
              onClick={() => void onMarkChecked()}
            >
              Mark as checked
            </Button>
          ) : null}
        </div>
      ) : p.problem ? (
        <div className="break-words rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-text-muted">
          <p className="font-semibold text-text">Earlier problem, checked</p>
          <p className="mt-0.5 select-text">{p.problem.reason}</p>
          <p className="mt-0.5 text-text-subtle">
            {byAt(p.problem.checkedByName, p.problem.checkedAt)}
          </p>
        </div>
      ) : null}

      {can.copyLink ||
      can.sendSms ||
      can.check ||
      can.cancel ||
      can.refund ||
      can.recordManualRefund ||
      can.recordPayment ? (
        <div className="grid gap-2">
          <ActionRow below="wrap" align="start">
            {can.copyLink ? (
              <Button
                size="sm"
                loading={makeLink.isPending}
                disabled={busy && !makeLink.isPending}
                onClick={() => void onCopyLink()}
              >
                Copy link
              </Button>
            ) : null}
            {can.sendSms ? (
              <Button
                size="sm"
                variant="secondary"
                loading={resend.isPending}
                disabled={busy && !resend.isPending}
                onClick={() => void onSendSms()}
              >
                {sendSmsLabel(p)}
              </Button>
            ) : null}
            {can.check ? (
              <Button
                size="sm"
                variant="secondary"
                loading={refresh.isPending}
                disabled={busy && !refresh.isPending}
                onClick={() => void onCheck()}
              >
                Check with Razorpay
              </Button>
            ) : null}
            {can.recordPayment ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => setRecording(true)}
              >
                Record payment received…
              </Button>
            ) : null}
            {can.cancel ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => setCancelling(true)}
              >
                Cancel payment
              </Button>
            ) : null}
            {can.refund ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => setRefunding(true)}
              >
                Refund
              </Button>
            ) : null}
            {can.recordManualRefund ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => setHandRefunding(true)}
              >
                Record a refund made by hand…
              </Button>
            ) : null}
          </ActionRow>
          {can.recordManualRefund ? (
            <p className="text-xs text-text-muted">
              This money came by hand, so Razorpay cannot refund it. Give it back the way it came,
              then record it here. The GST credit note follows.
            </p>
          ) : null}
          {manualLink ? <Copyable value={manualLink} label="Payment link" mono /> : null}
        </div>
      ) : null}

      <section>
        <KeyValueList items={details} labelWidth="150px" />
      </section>

      {/* A withdrawn payment with nobody named has nothing to bill: no card at all. */}
      {p.billTo || canEditBillTo(p) ? (
        <Section title="Bill to">
          <BillToCard payment={p} onEdit={() => setEditingBillTo(true)} />
        </Section>
      ) : null}

      {p.invoice || wasPaid(p.status) ? (
        <Section title="GST invoice">
          <InvoiceBody payment={p} />
        </Section>
      ) : null}

      {creditNotes.length > 0 ? (
        <Section title={`Credit notes (${creditNotes.length})`}>
          <CreditNotesBody payment={p} />
        </Section>
      ) : null}

      <Section title="In Razorpay">
        <KeyValueList items={references} labelWidth="150px" />
        <p className="mt-2 text-xs text-text-subtle">
          These open Razorpay&rsquo;s dashboard.
          {config?.mode === 'test'
            ? ' Payments made in test mode only show there once its Test mode switch is on.'
            : ''}
        </p>
      </Section>

      {attempts.length > 0 ? (
        <Section title={`Tries to pay (${attempts.length})`}>
          <ul className="grid gap-2">
            {attempts.map((a, i) => (
              <li
                key={`${a.razorpayPaymentId}-${i}`}
                className="rounded-md border border-border p-2.5"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge intent={attemptTone(a.status)}>{ATTEMPT_LABELS[a.status]}</Badge>
                  <span className="text-sm text-text">{methodLabel(a.method)}</span>
                  <span className="text-xs text-text-subtle">{istStamp(a.at)}</span>
                </div>
                {a.reason ? (
                  <p className="mt-1 break-words text-sm text-text-muted">{a.reason}</p>
                ) : null}
                <p className="mt-1 text-xs">
                  <RazorpayId kind="payment" id={a.razorpayPaymentId} />
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {refunds.length > 0 ? (
        <Section title={`Refunds (${refunds.length})`}>
          <ul className="grid gap-2">
            {refunds.map((r, i) => (
              <li
                key={`${r.razorpayRefundId}-${i}`}
                className="rounded-md border border-border p-2.5"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge intent={refundTone(r.status)}>{REFUND_LABELS[r.status]}</Badge>
                  {r.manual ? <Badge intent="neutral">By hand</Badge> : null}
                  <span className="text-sm font-medium tabular-nums text-text">
                    {formatPaise(r.amountPaise)}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm text-text-muted">{refundLine(r)}</p>
                {r.manual ? (
                  <p className="mt-0.5 text-xs text-text-subtle">
                    Given back outside Razorpay. The GST credit note follows.
                  </p>
                ) : null}
                {r.processedAt && !r.manual ? (
                  <p className="mt-0.5 text-xs text-text-subtle">
                    Processed {istStamp(r.processedAt)}
                  </p>
                ) : null}
                {r.razorpayRefundId ? (
                  <p className="mt-1 select-text break-all font-mono text-xs text-text-subtle">
                    {r.razorpayRefundId}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {extras.length > 0 ? (
        <Section title={`Paid twice (${extras.length})`}>
          <ul className="grid gap-2">
            {extras.map((c, i) => (
              <li
                key={`${c.razorpayPaymentId}-${i}`}
                className="rounded-md border border-border p-2.5"
              >
                <p className="break-words text-sm text-text-muted">{extraCaptureLine(c)}</p>
                <p className="mt-1 text-xs">
                  <RazorpayId kind="payment" id={c.razorpayPaymentId} />
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <BillToDialog payment={editingBillTo ? p : null} onClose={() => setEditingBillTo(false)} />
      <CancelPaymentDialog payment={cancelling ? p : null} onClose={() => setCancelling(false)} />
      <RecordPaymentDialog
        target={recording ? { kind: 'payment', payment: p } : null}
        onClose={() => setRecording(false)}
      />
      <RefundPaymentDialog payment={refunding ? p : null} onClose={() => setRefunding(false)} />
      <ManualRefundDialog
        payment={handRefunding ? p : null}
        onClose={() => setHandRefunding(false)}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-text">{title}</h3>
      {children}
    </section>
  );
}

/**
 * A Razorpay id as the link that opens it in Razorpay's dashboard, or as plain
 * selectable text when it is not an id of the shape Razorpay issues (so nothing
 * odd ever ends up in a link). `—` for one the payment does not have yet.
 */
function RazorpayId({ kind, id }: { kind: RazorpayThing; id: string | null }) {
  if (!id) return <span className="text-text-subtle">—</span>;
  const href = dashboardUrl(kind, id);
  if (!href) return <span className="select-text break-all font-mono text-sm">{id}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      <span className="min-w-0 break-all font-mono">{id}</span>
      <ExternalLink width={13} height={13} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span className="sr-only">(opens Razorpay)</span>
    </a>
  );
}
