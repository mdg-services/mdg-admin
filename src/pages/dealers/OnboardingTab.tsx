import type { Dealer, OnboardingStepEntry, OnboardingStepId } from '@dk/shared';
import { ONBOARDING_STEPS, stepById } from '@dk/shared';
import { STEP_PAYLOAD_SCHEMAS } from '@dk/shared/schemas';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
  CircleDot,
  Copy,
  Lock,
  MessageCircle,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  FieldError,
  Input,
  Label,
  Spinner,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  useDealerOnboardingQuery,
  useNextCodeQuery,
  useStepCompleteMutation,
  useStepReopenMutation,
} from '@/hooks/api/useDealerOnboarding';
import { formatDateTime } from '@/lib/format';

interface Props {
  dealer: Dealer;
}

// ----- WhatsApp helpers ----------------------------------------------------

/** Strip everything except digits — wa.me only accepts the bare number. */
function waDigits(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

function waChatUrl(phone: string, message?: string): string {
  const base = `https://wa.me/${waDigits(phone)}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}

// Templates: editable defaults the admin uses to compose the WhatsApp message
// for each "send" step. Keep them factual; the admin can tweak inline.
const DEFAULT_MESSAGES: Partial<Record<OnboardingStepId, (dealer: Dealer) => string>> = {
  'send-welcome': (d) =>
    `Hi${d.name ? ' ' + d.name : ''}, welcome to Dealer Kavach.

We're glad to have you on board. Over the next few messages we'll guide you through a short onboarding so you can start using our services.

Reply here once you're ready and we'll begin.`,
  'send-terms-link': () =>
    `Please review and accept our Terms and Conditions here:
https://mdgservices.in/

Once you've accepted, reply here so we can proceed to the next step.`,
  'send-pdf': () =>
    `Please find the onboarding guide attached.

Once you've reviewed it, please share:
1. Your GST number
2. The payment screenshot after completing the payment

We'll proceed with the next steps as soon as we receive both.`,
};

export function OnboardingTab({ dealer }: Props) {
  const { data: onboarding, isLoading } = useDealerOnboardingQuery(dealer.id);
  const board = onboarding ?? dealer.onboarding;

  if (isLoading && !board) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <Spinner /> Loading onboarding…
      </div>
    );
  }

  const total = ONBOARDING_STEPS.length;
  const done = board.completedStepCount;

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-text">WhatsApp chat with dealer</div>
            <div className="text-xs text-text-muted">
              <span className="font-mono">{dealer.phone}</span>
              {dealer.name ? ` · ${dealer.name}` : null}
            </div>
          </div>
          <a
            href={waChatUrl(dealer.phone)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-success px-4 text-sm font-semibold text-text-inverse hover:bg-success/90"
          >
            <MessageCircle width={16} height={16} strokeWidth={1.75} />
            Open WhatsApp
          </a>
        </CardContent>
      </Card>

      {dealer.status === 'ACTIVE' ? (
        <Card>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-success-soft p-2 text-success">
                <Check width={18} height={18} />
              </div>
              <div>
                <div className="text-sm font-semibold text-text">
                  Dealer is ACTIVE — all steps complete
                </div>
                <div className="text-xs text-text-muted">
                  You can still reopen any reopenable step below to amend artifacts.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-text">
                Onboarding progress
              </div>
              <Badge intent="info">
                {done} of {total}
              </Badge>
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.round((done / total) * 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <ol className="grid gap-3">
        {ONBOARDING_STEPS.map((def) => {
          const entry = board.steps.find((s) => s.id === def.id);
          const isCurrent = board.currentStepId === def.id;
          return (
            <StepCard
              key={def.id}
              dealerId={dealer.id}
              dealer={dealer}
              stepId={def.id}
              order={def.order}
              entry={entry}
              isCurrent={isCurrent}
            />
          );
        })}
      </ol>
    </div>
  );
}

function StepCard({
  dealerId,
  dealer,
  stepId,
  order,
  entry,
  isCurrent,
}: {
  dealerId: string;
  dealer: Dealer;
  stepId: OnboardingStepId;
  order: number;
  entry: OnboardingStepEntry | undefined;
  isCurrent: boolean;
}) {
  const def = stepById(stepId);
  const status = entry?.status ?? 'PENDING';
  const isDone = status === 'DONE';
  const reopenable = def.reopenable;

  return (
    <Card>
      <CardContent>
        <div className="flex items-start gap-4">
          <StepDot order={order} done={isDone} current={isCurrent} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-text">{def.title}</div>
              <StepBadge isDone={isDone} isCurrent={isCurrent} />
            </div>
            <p className="mt-1 text-sm text-text-muted">{def.description}</p>
            {isDone && entry?.completedAt ? (
              <p className="mt-2 text-xs text-text-subtle">
                Completed {formatDateTime(entry.completedAt)}
                {entry.completedBy ? ` by ${entry.completedBy.slice(-6)}` : null}
              </p>
            ) : null}

            {isCurrent ? (
              <div className="mt-3">
                <StepForm dealerId={dealerId} dealer={dealer} stepId={stepId} />
              </div>
            ) : null}

            {isDone ? (
              <div className="mt-3">
                <ReopenAction
                  dealerId={dealerId}
                  stepId={stepId}
                  mutating={def.mutating}
                  reopenable={reopenable}
                />
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StepDot({
  order,
  done,
  current,
}: {
  order: number;
  done: boolean;
  current: boolean;
}) {
  const cls = done
    ? 'bg-success text-text-inverse'
    : current
      ? 'bg-brand text-text-inverse'
      : 'bg-surface-2 text-text-subtle';
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cls} text-xs font-semibold`}
      aria-hidden
    >
      {done ? <Check width={14} height={14} /> : order}
    </div>
  );
}

function StepBadge({
  isDone,
  isCurrent,
}: {
  isDone: boolean;
  isCurrent: boolean;
}) {
  if (isDone) return <Badge intent="success">Done</Badge>;
  if (isCurrent) return <Badge intent="info">Current</Badge>;
  return <Badge intent="neutral">Pending</Badge>;
}

// ----- Per-step inline form --------------------------------------------------

function StepForm({
  dealerId,
  dealer,
  stepId,
}: {
  dealerId: string;
  dealer: Dealer;
  stepId: OnboardingStepId;
}) {
  switch (stepId) {
    case 'collect-phone':
      // Created with the dealer; this step is never the current step after creation.
      return null;
    case 'send-welcome':
    case 'send-terms-link':
    case 'send-pdf':
      return (
        <SendMessageStep dealerId={dealerId} dealer={dealer} stepId={stepId} />
      );
    case 'receive-payment-and-gst':
      return <PaymentAndGstForm dealerId={dealerId} />;
    case 'assign-code':
      return <AssignCodeForm dealerId={dealerId} />;
    case 'create-admin-group':
      return <AdminGroupForm dealerId={dealerId} dealer={dealer} />;
    case 'create-dealer-group':
      return <DealerGroupForm dealerId={dealerId} dealer={dealer} />;
  }
}

// ----- Reusable: compose message + copy + open WhatsApp ---------------------

function ComposeMessageBlock({
  message,
  onChange,
  phone,
  helper,
}: {
  message: string;
  onChange: (v: string) => void;
  phone?: string;
  helper?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success('Message copied');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy — copy manually from the field.');
    }
  }

  const waHref = phone ? waChatUrl(phone, message) : undefined;

  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface-2/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="compose-message" className="m-0">
          Message to send
        </Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={copy}
            leftIcon={
              copied ? (
                <Check width={14} height={14} />
              ) : (
                <Copy width={14} height={14} />
              )
            }
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-success px-3 text-sm font-semibold text-text-inverse hover:bg-success/90"
            >
              <MessageCircle width={14} height={14} strokeWidth={1.75} />
              Open in WhatsApp
            </a>
          ) : null}
        </div>
      </div>
      <Textarea
        id="compose-message"
        rows={6}
        value={message}
        onChange={(e) => onChange(e.target.value)}
      />
      {helper ? <p className="text-xs text-text-subtle">{helper}</p> : null}
    </div>
  );
}

function SendMessageStep({
  dealerId,
  dealer,
  stepId,
}: {
  dealerId: string;
  dealer: Dealer;
  stepId: 'send-welcome' | 'send-terms-link' | 'send-pdf';
}) {
  const toast = useToast();
  const mutate = useStepCompleteMutation(dealerId);
  const [message, setMessage] = useState(
    () => DEFAULT_MESSAGES[stepId]?.(dealer) ?? '',
  );

  async function markDone() {
    try {
      // Persist the (possibly edited) message text as the step note for the
      // audit trail. Schema only requires note to be ≤500 chars; truncate.
      const note = message.slice(0, 500);
      await mutate.mutateAsync({ stepId, payload: { note } });
      toast.success('Step marked done.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const helper =
    stepId === 'send-pdf'
      ? 'Attach the onboarding PDF in WhatsApp before sending. The note saved here is for the audit trail.'
      : 'Edit the message inline, then copy or open in WhatsApp.';

  return (
    <div className="grid gap-3">
      <ComposeMessageBlock
        message={message}
        onChange={setMessage}
        phone={dealer.phone}
        helper={helper}
      />
      <div className="flex justify-end">
        <Button type="button" onClick={markDone} loading={mutate.isPending}>
          Mark sent
        </Button>
      </div>
    </div>
  );
}

function PaymentAndGstForm({ dealerId }: { dealerId: string }) {
  const toast = useToast();
  const mutate = useStepCompleteMutation(dealerId);
  const schema = STEP_PAYLOAD_SCHEMAS['receive-payment-and-gst'];
  type Form = { gst: string; paymentNote: string; note?: string };
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { gst: '', paymentNote: '', note: '' },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await mutate.mutateAsync({
        stepId: 'receive-payment-and-gst',
        payload: values,
      });
      toast.success('GST and payment recorded.');
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <Label htmlFor="gst" required>
          GST number
        </Label>
        <Input
          id="gst"
          placeholder="27ABCDE1234F1Z5"
          invalid={!!errors.gst}
          {...register('gst')}
        />
        <FieldError message={errors.gst?.message} />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="paymentNote" required>
          Payment note
        </Label>
        <Textarea
          id="paymentNote"
          rows={2}
          placeholder="UPI ref / bank txn / cash receipt #…"
          invalid={!!errors.paymentNote}
          {...register('paymentNote')}
        />
        <FieldError message={errors.paymentNote?.message} />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="note">Internal note (optional)</Label>
        <Textarea id="note" rows={2} {...register('note')} />
      </div>
      <div className="md:col-span-2 flex justify-end">
        <Button type="submit" loading={mutate.isPending}>
          Mark done
        </Button>
      </div>
    </form>
  );
}

function AssignCodeForm({ dealerId }: { dealerId: string }) {
  const toast = useToast();
  const mutate = useStepCompleteMutation(dealerId);
  const { data: nextCode, isLoading } = useNextCodeQuery(dealerId);
  const schema = STEP_PAYLOAD_SCHEMAS['assign-code'];
  type Form = { code: string; note?: string };
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', note: '' },
  });

  useEffect(() => {
    if (nextCode?.suggestion) setValue('code', nextCode.suggestion);
  }, [nextCode?.suggestion, setValue]);

  const submit = handleSubmit(async (values) => {
    try {
      await mutate.mutateAsync({ stepId: 'assign-code', payload: values });
      toast.success('Dealer code assigned.');
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div>
        <Label htmlFor="code" required>
          Dealer code
        </Label>
        <Input
          id="code"
          placeholder={isLoading ? 'Suggesting…' : 'E01'}
          invalid={!!errors.code}
          {...register('code')}
        />
        <FieldError message={errors.code?.message} />
        <p className="mt-1 text-xs text-text-subtle">
          Suggested next code: <span className="font-mono">{nextCode?.suggestion ?? '—'}</span>.
          Once committed, the code is append-only.
        </p>
      </div>
      <div>
        <Label htmlFor="note">Internal note (optional)</Label>
        <Textarea id="note" rows={2} {...register('note')} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={mutate.isPending}>
          Assign code
        </Button>
      </div>
    </form>
  );
}

function AdminGroupForm({
  dealerId,
  dealer,
}: {
  dealerId: string;
  dealer: Dealer;
}) {
  const toast = useToast();
  const mutate = useStepCompleteMutation(dealerId);
  const schema = STEP_PAYLOAD_SCHEMAS['create-admin-group'];
  type Form = {
    groupName: string;
    inviteLink: string;
    username: string;
    password: string;
    note?: string;
  };
  const defaultGroupName = dealer.code ? `${dealer.code}01` : '';
  const defaultUsername = dealer.code ? `${dealer.code.toLowerCase()}-admin` : '';
  const defaultWelcome = `Welcome to your dealer admin group on Dealer Kavach.

To set up your portal access, please share:
1. A username (3+ characters)
2. A temporary password (8+ characters)

We'll provision your account and you'll be asked to change the password on first login.`;
  const [welcomeMessage, setWelcomeMessage] = useState(defaultWelcome);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      groupName: defaultGroupName,
      inviteLink: '',
      username: defaultUsername,
      password: '',
      note: '',
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await mutate.mutateAsync({
        stepId: 'create-admin-group',
        payload: { ...values, note: values.note || welcomeMessage.slice(0, 500) },
      });
      toast.success('Admin group recorded.');
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <ComposeMessageBlock
          message={welcomeMessage}
          onChange={setWelcomeMessage}
          helper="Send this message in the group after creating it. Copy here, then paste into the new WhatsApp group."
        />
      </div>
      <div>
        <Label htmlFor="groupName" required>
          Group name
        </Label>
        <Input
          id="groupName"
          invalid={!!errors.groupName}
          {...register('groupName')}
        />
        <FieldError message={errors.groupName?.message} />
      </div>
      <div>
        <Label htmlFor="inviteLink" required>
          Group invite link
        </Label>
        <Input
          id="inviteLink"
          placeholder="https://chat.whatsapp.com/…"
          invalid={!!errors.inviteLink}
          {...register('inviteLink')}
        />
        <FieldError message={errors.inviteLink?.message} />
      </div>
      <div className="md:col-span-2 mt-2 border-t border-border pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Portal credentials provisioned for the dealer
        </div>
      </div>
      <div>
        <Label htmlFor="username" required>
          Username
        </Label>
        <Input
          id="username"
          invalid={!!errors.username}
          {...register('username')}
        />
        <FieldError message={errors.username?.message} />
      </div>
      <div>
        <Label htmlFor="password" required>
          Temporary password
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          invalid={!!errors.password}
          {...register('password')}
        />
        <FieldError message={errors.password?.message} />
        <p className="mt-1 text-xs text-text-subtle">
          Stored bcrypt-hashed. Dealer will be required to change on first login.
        </p>
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="adminGroupNote">Internal note (optional)</Label>
        <Textarea id="adminGroupNote" rows={2} {...register('note')} />
      </div>
      <div className="md:col-span-2 flex justify-end">
        <Button type="submit" loading={mutate.isPending}>
          Mark done
        </Button>
      </div>
    </form>
  );
}

function DealerGroupForm({
  dealerId,
  dealer,
}: {
  dealerId: string;
  dealer: Dealer;
}) {
  const toast = useToast();
  const mutate = useStepCompleteMutation(dealerId);
  const schema = STEP_PAYLOAD_SCHEMAS['create-dealer-group'];
  type Form = { groupName: string; inviteLink: string; note?: string };
  const defaultGroupName = dealer.code ? `${dealer.code}02` : '';
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { groupName: defaultGroupName, inviteLink: '', note: '' },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await mutate.mutateAsync({ stepId: 'create-dealer-group', payload: values });
      toast.success('Dealer group recorded. Dealer is now ACTIVE.');
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      <div>
        <Label htmlFor="dealerGroupName" required>
          Group name
        </Label>
        <Input
          id="dealerGroupName"
          invalid={!!errors.groupName}
          {...register('groupName')}
        />
        <FieldError message={errors.groupName?.message} />
      </div>
      <div>
        <Label htmlFor="dealerInviteLink" required>
          Group invite link
        </Label>
        <Input
          id="dealerInviteLink"
          placeholder="https://chat.whatsapp.com/…"
          invalid={!!errors.inviteLink}
          {...register('inviteLink')}
        />
        <FieldError message={errors.inviteLink?.message} />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="dealerGroupNote">Internal note (optional)</Label>
        <Textarea id="dealerGroupNote" rows={2} {...register('note')} />
      </div>
      <div className="md:col-span-2 flex justify-end">
        <Button type="submit" loading={mutate.isPending}>
          Mark done — activate dealer
        </Button>
      </div>
    </form>
  );
}

// ----- Reopen action --------------------------------------------------------

function ReopenAction({
  dealerId,
  stepId,
  mutating,
  reopenable,
}: {
  dealerId: string;
  stepId: OnboardingStepId;
  mutating: boolean;
  reopenable: boolean;
}) {
  const toast = useToast();
  const mutate = useStepReopenMutation(dealerId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!reopenable) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-subtle">
        <Lock width={12} height={12} /> Append-only — cannot be reopened.
      </div>
    );
  }

  async function doReopen(force: boolean) {
    try {
      await mutate.mutateAsync({ stepId, body: { force } });
      toast.success('Step reopened.');
      setConfirmOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (mutating) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          leftIcon={<RotateCcw width={14} height={14} />}
        >
          Reopen
        </Button>
        <Dialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Reopen this step?"
          description="This step mutates dealer data. Reopening will not auto-revert what was already written — re-complete with corrected values to overwrite."
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => doReopen(true)} loading={mutate.isPending}>
                Force reopen
              </Button>
            </>
          }
        >
          <p className="text-sm text-text-muted">
            Any later DONE steps will also flip back to PENDING for consistency.
          </p>
        </Dialog>
      </>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => doReopen(false)}
      loading={mutate.isPending}
      leftIcon={<RotateCcw width={14} height={14} />}
    >
      Reopen
    </Button>
  );
}

void CircleDot; // re-exported icon dependency to keep tree-shake happy
