import * as React from 'react';

import {
  Button,
  Callout,
  Checkbox,
  Copyable,
  Dialog,
  FieldError,
  Input,
  Label,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { useDealersQuery } from '@/hooks/api/useDealers';
import { type CreatedPayment, useCreatePayment, usePaymentLink } from '@/hooks/api/usePayments';
import {
  PAYMENT_NOTE_MAX,
  type RequestDraft,
  linkSentLine,
  sentence,
  validateRequest,
} from '@/pages/payments/format';
import {
  PAYMENT_PURPOSES,
  PAYMENT_PURPOSE_LABELS,
  compareDealerCodes,
  dealerCodeLabel,
  formatPaise,
  parseRupeesToPaise,
} from '@dk/shared';

const EMPTY_DRAFT: RequestDraft = {
  dealerId: '',
  title: '',
  purpose: 'subscription',
  amount: '',
  dueDate: '',
  note: '',
  sendLink: true,
  phone: '',
  email: '',
};

/**
 * Ask an outlet for money: pick the outlet, say what it is for, set the amount
 * and (optionally) a due date. With "Send the link by SMS" on — it starts on —
 * Razorpay texts the outlet owner a link to pay, and emails it if there is an
 * address.
 *
 * The amount is typed in rupees and shown back in the same Indian grouping the
 * list uses, so a slipped comma is seen before the request goes. The server
 * reads the amount off the payment it makes; nothing the outlet's browser sends
 * can change it later.
 *
 * It never closes on its own after a success. The next thing an admin wants is
 * the link, to paste into WhatsApp, and the link is on the screen the success
 * leaves behind. If Razorpay refused to make the link the payment still exists,
 * and the screen says so in Razorpay's words rather than showing an error for a
 * request that did half-work.
 */
export function RequestPaymentDialog({
  open,
  onClose,
  defaultDealerId,
  onOpenPayment,
}: {
  open: boolean;
  onClose: () => void;
  /** The outlet to start on — the one the page is already filtered to. */
  defaultDealerId?: string;
  /** Show the payment that was just raised in the drawer. */
  onOpenPayment: (id: string) => void;
}) {
  const toast = useToast();
  const create = useCreatePayment();
  const makeLink = usePaymentLink();
  const dealersQ = useDealersQuery({ pageSize: 200 });
  const uid = React.useId();
  const [draft, setDraft] = React.useState<RequestDraft>(EMPTY_DRAFT);
  // The "fix this" messages wait for a press of the button: showing them against
  // a form nobody has touched is a scolding, not a hint.
  const [attempted, setAttempted] = React.useState(false);
  const [created, setCreated] = React.useState<CreatedPayment | null>(null);
  // A link made after the fact, for a payment raised without one.
  const [madeLink, setMadeLink] = React.useState<string | null>(null);

  // A fresh, empty form every time it opens.
  React.useEffect(() => {
    if (!open) return;
    setDraft({ ...EMPTY_DRAFT, dealerId: defaultDealerId ?? '' });
    setAttempted(false);
    setCreated(null);
    setMadeLink(null);
  }, [open, defaultDealerId]);

  const dealers = React.useMemo(
    () =>
      (dealersQ.data?.items ?? [])
        .filter((d) => !d.archivedAt)
        .slice()
        .sort((a, b) => compareDealerCodes(a.code, b.code)),
    [dealersQ.data],
  );

  const { input, problems } = validateRequest(draft);
  const shown = attempted ? problems : {};
  const paise = parseRupeesToPaise(draft.amount);
  const noteLength = draft.note.trim().length;

  function set<K extends keyof RequestDraft>(key: K, value: RequestDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function submit() {
    if (create.isPending) return;
    setAttempted(true);
    if (!input) return;
    try {
      const payment = await create.mutateAsync(input);
      setCreated(payment);
      toast.success(`Payment ${payment.number} raised.`);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  async function onMakeLink() {
    if (!created || makeLink.isPending) return;
    try {
      const link = await makeLink.mutateAsync(created.id);
      setMadeLink(link.url);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  // One Dialog for both halves, so the sheet does not slide up a second time
  // when the request succeeds: the form and the receipt are the same panel.
  const link = created ? (madeLink ?? created.linkUrl) : null;
  const sentTo = created ? linkSentLine(created) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={created ? 'Payment raised' : 'Request a payment'}
      description={created ? undefined : 'The outlet gets a link to pay on Razorpay.'}
      footerBelow="row"
      footer={
        created ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                onOpenPayment(created.id);
                onClose();
              }}
            >
              Open payment
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} loading={create.isPending}>
              {draft.sendLink ? 'Request and send link' : 'Request payment'}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="grid gap-3">
          <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 [overflow-wrap:anywhere]">
            <p className="text-sm font-medium text-text">
              {created.number} · {formatPaise(created.amountPaise)}
            </p>
            <p className="mt-0.5 text-xs text-text-subtle">
              Outlet {dealerCodeLabel(created.dealerCode)} · {created.title}
            </p>
          </div>

          {created.linkError ? (
            <Callout intent="warning">
              The payment was raised, but the payment link could not be made. Razorpay said:{' '}
              {sentence(created.linkError)}
              <span className="mt-1 block">Open the payment and press Copy link to try again.</span>
            </Callout>
          ) : sentTo ? (
            <p className="text-sm text-text-muted">Razorpay sent the link to {sentTo}.</p>
          ) : link ? (
            <p className="text-sm text-text-muted">The link was made, and nothing was sent.</p>
          ) : (
            <p className="text-sm text-text-muted">
              No link was made. Make one when you want to paste it into WhatsApp.
            </p>
          )}

          {link ? (
            <Copyable
              value={link}
              label="Payment link — paste it into WhatsApp"
              toastLabel="Link copied"
            />
          ) : !created.linkError ? (
            <div>
              <Button
                variant="secondary"
                loading={makeLink.isPending}
                onClick={() => void onMakeLink()}
              >
                Make a link to copy
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <Label htmlFor={`${uid}-dealer`} required>
              Outlet
            </Label>
            <Select
              id={`${uid}-dealer`}
              value={draft.dealerId}
              onChange={(e) => set('dealerId', e.target.value)}
              invalid={!!shown.dealerId}
            >
              <option value="">Choose an outlet</option>
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {dealerCodeLabel(d.code)}
                </option>
              ))}
            </Select>
            <FieldError message={shown.dealerId} />
          </div>

          <div>
            <Label htmlFor={`${uid}-title`} required>
              What it is for
            </Label>
            <Input
              id={`${uid}-title`}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Dealer Kavach, October 2026"
              autoComplete="off"
              invalid={!!shown.title}
            />
            <FieldError message={shown.title} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor={`${uid}-purpose`}>Kind of payment</Label>
              <Select
                id={`${uid}-purpose`}
                value={draft.purpose}
                onChange={(e) => set('purpose', e.target.value as RequestDraft['purpose'])}
              >
                {PAYMENT_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_PURPOSE_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${uid}-amount`} required>
                Amount in rupees
              </Label>
              <Input
                id={`${uid}-amount`}
                value={draft.amount}
                onChange={(e) => set('amount', e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="4999"
                invalid={!!shown.amount}
              />
              <FieldError message={shown.amount} />
              {/* The amount read back, as the list and the outlet will see it. */}
              {paise !== null && !problems.amount ? (
                <p className="mt-1 text-xs tabular-nums text-text-muted">
                  That is {formatPaise(paise)}.
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <Label htmlFor={`${uid}-due`} hint="Optional">
              Due date
            </Label>
            <Input
              id={`${uid}-due`}
              type="date"
              value={draft.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
              invalid={!!shown.dueDate}
            />
            <FieldError message={shown.dueDate} />
          </div>

          <div>
            <Label htmlFor={`${uid}-note`} hint="Optional">
              Note
            </Label>
            <Textarea
              id={`${uid}-note`}
              rows={2}
              value={draft.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Anything the outlet should know about this payment."
              invalid={!!shown.note}
            />
            {/* The title and this note are what the outlet reads in the Dealer
                Kavach app too, and Google Play's payments rule forbids an app to
                tell its user where or how to pay anywhere but Play. */}
            <p className="mt-1 text-xs text-text-muted">
              The outlet reads the title and this note inside the Android app. Do not write where or
              how to pay there: Google Play does not allow it.
            </p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <FieldError message={shown.note} />
              </div>
              <span
                className={
                  noteLength > PAYMENT_NOTE_MAX
                    ? 'ml-auto shrink-0 text-xs tabular-nums text-danger'
                    : 'ml-auto shrink-0 text-xs tabular-nums text-text-subtle'
                }
              >
                {noteLength.toLocaleString('en-IN')} / {PAYMENT_NOTE_MAX.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <Checkbox
            checked={draft.sendLink}
            onChange={(e) => set('sendLink', e.target.checked)}
            label="Send the link by SMS"
            hint="Razorpay texts the outlet owner a link to pay, and emails it if we have an address. Turn it off to get a link to copy instead."
            align="start"
          />

          {draft.sendLink ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor={`${uid}-phone`} hint="Optional">
                  Send to this phone
                </Label>
                <Input
                  id={`${uid}-phone`}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={draft.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="98765 43210"
                  invalid={!!shown.phone}
                />
                <FieldError message={shown.phone} />
              </div>
              <div>
                <Label htmlFor={`${uid}-email`} hint="Optional">
                  Send to this email
                </Label>
                <Input
                  id={`${uid}-email`}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={draft.email}
                  onChange={(e) => set('email', e.target.value)}
                  invalid={!!shown.email}
                />
                <FieldError message={shown.email} />
              </div>
              <p className="text-xs text-text-muted md:col-span-2">
                Leave both empty to use the phone and email of the outlet&rsquo;s owner.
              </p>
            </div>
          ) : null}

          <FieldError message={shown.form} />
        </form>
      )}
    </Dialog>
  );
}
