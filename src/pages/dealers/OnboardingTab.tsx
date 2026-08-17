import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
  CircleDot,
  Copy,
  KeyRound,
  Lock,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useState } from 'react';
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
  useStepCompleteMutation,
  useStepReopenMutation,
} from '@/hooks/api/useDealerOnboarding';
import { formatDateTime } from '@/lib/format';
import { generatePassword } from '@/lib/password';
import { ONBOARDING_STEPS, stepById } from '@dk/shared';
import type { Dealer, OnboardingStepEntry, OnboardingStepId } from '@dk/shared';
import { STEP_PAYLOAD_SCHEMAS } from '@dk/shared/schemas';

interface Props {
  dealer: Dealer;
}

// Templates: editable defaults the admin uses to compose the message the dealer
// receives in the in-app chat for each "send" step. Keep them factual; the
// admin can tweak inline before marking the step sent.
const DEFAULT_MESSAGES: Partial<Record<OnboardingStepId, (dealer: Dealer) => string>> = {
  'send-welcome': () =>
    `Welcome to Dealer Kavach.

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

            {/* Once issued, show a copyable credentials panel even after the
                step is DONE so the admin can re-share the login email. */}
            {stepId === 'issue-app-login' && isDone && dealer.portalCredentials ? (
              <div className="mt-3">
                <IssuedLoginPanel email={dealer.portalCredentials.username} />
              </div>
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
      return <CollectPhoneForm dealerId={dealerId} dealer={dealer} />;
    case 'send-welcome':
    case 'send-terms-link':
    case 'send-pdf':
      return (
        <SendMessageStep dealerId={dealerId} dealer={dealer} stepId={stepId} />
      );
    case 'receive-payment-and-gst':
      return <PaymentAndGstForm dealerId={dealerId} />;
    case 'assign-code':
      return <AssignCodeForm dealerId={dealerId} dealer={dealer} />;
    case 'issue-app-login':
      return <IssueAppLoginForm dealerId={dealerId} dealer={dealer} />;
  }
}

// ----- Reusable: compose message + copy --------------------------------------

function ComposeMessageBlock({
  message,
  onChange,
  helper,
}: {
  message: string;
  onChange: (v: string) => void;
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

  return (
    <div className="grid gap-2 rounded-md border border-border bg-surface-2/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="compose-message" className="m-0">
          Message to send
        </Label>
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
      ? 'Attach the onboarding PDF in the dealer chat before sending. The note saved here is for the audit trail.'
      : 'Edit the message inline, then copy it and send it in the dealer chat.';

  return (
    <div className="grid gap-3">
      <ComposeMessageBlock
        message={message}
        onChange={setMessage}
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

// ----- Collect phone ---------------------------------------------------------

/**
 * Captures the dealer's phone number.
 *
 * Reachable whenever the dealer was created WITHOUT a phone: creation only
 * auto-completes this step when a number was supplied, so otherwise it stays the
 * current step and is completed here. (It is also reachable after a reopen.)
 */
function CollectPhoneForm({
  dealerId,
  dealer,
}: {
  dealerId: string;
  dealer: Dealer;
}) {
  const toast = useToast();
  const mutate = useStepCompleteMutation(dealerId);
  const schema = STEP_PAYLOAD_SCHEMAS['collect-phone'];
  type Form = { phone: string; note?: string };
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { phone: dealer.phone ?? '', note: '' },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await mutate.mutateAsync({ stepId: 'collect-phone', payload: values });
      toast.success('Phone number saved.');
      reset({ phone: values.phone, note: '' });
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div>
        <Label htmlFor="collect-phone" required>
          Phone number
        </Label>
        <Input
          id="collect-phone"
          placeholder="+91 90000 00000"
          invalid={!!errors.phone}
          {...register('phone')}
        />
        <FieldError message={errors.phone?.message} />
        <p className="mt-1 text-xs text-text-subtle">
          This is how the dealer is reached for the rest of the journey. It must
          not already belong to another dealer.
        </p>
      </div>
      <div>
        <Label htmlFor="collect-phone-note">Internal note (optional)</Label>
        <Textarea id="collect-phone-note" rows={2} {...register('note')} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={mutate.isPending}>
          Save phone number
        </Button>
      </div>
    </form>
  );
}

/**
 * Step 6 confirms the code rather than choosing it.
 *
 * The dealer's code is claimed at creation now — it is the record's identity, so
 * there is no dealer to assign one to before it exists. The step is kept because
 * it is where the code lands in the audit trail, and because removing it would
 * renumber the journey for every dealer part-way through it. Submitting the code
 * the dealer already has is a no-op server-side; submitting a different one is
 * rejected, which is why the field is read-only.
 */
function AssignCodeForm({ dealerId, dealer }: { dealerId: string; dealer: Dealer }) {
  const toast = useToast();
  const mutate = useStepCompleteMutation(dealerId);
  const schema = STEP_PAYLOAD_SCHEMAS['assign-code'];
  type Form = { code: string; note?: string };
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { code: dealer.code, note: '' },
  });

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
          readOnly
          className="font-mono"
          invalid={!!errors.code}
          {...register('code')}
        />
        <FieldError message={errors.code?.message} />
        <p className="mt-1 text-xs text-text-subtle">
          Assigned when the dealer was created. To correct it, edit the dealer
          record — the code is append-only through this step.
        </p>
      </div>
      <div>
        <Label htmlFor="note">Internal note (optional)</Label>
        <Textarea id="note" rows={2} {...register('note')} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={mutate.isPending}>
          Confirm code
        </Button>
      </div>
    </form>
  );
}

// ----- Issue app login -------------------------------------------------------

function CopyButton({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy — copy manually.');
    }
  }
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={copy}
      leftIcon={
        copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />
      }
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

/** Shown after issue-app-login is done — surfaces the owner's login email. */
function IssuedLoginPanel({ email }: { email: string }) {
  return (
    <div className="grid gap-2 rounded-md border border-success/40 bg-success-soft/50 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-text">
        <KeyRound width={15} height={15} strokeWidth={1.75} className="text-success" />
        App login issued
      </div>
      <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface px-2 py-1.5">
        <div className="min-w-0">
          <div className="text-xs text-text-subtle">Login email</div>
          <div className="truncate font-mono text-sm text-text">{email}</div>
        </div>
        <CopyButton value={email} label="Email" />
      </div>
      <p className="text-xs text-text-subtle">
        The password is set, hashed and never returned. Reopen this step to issue
        a new password if it needs to be re-shared.
      </p>
    </div>
  );
}

/** Credentials panel shown immediately after issuing, including the password. */
function ShareCredentialsPanel({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const both = `Email: ${email}\nPassword: ${password}`;
  return (
    <div className="grid gap-2 rounded-md border border-success/50 bg-success-soft/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-text">
          <KeyRound width={15} height={15} strokeWidth={1.75} className="text-success" />
          Share these with the dealer
        </div>
        <CopyButton value={both} label="Credentials" />
      </div>
      <p className="text-xs text-text-subtle">
        This password is shown once. Copy it now — it is stored hashed and cannot
        be retrieved later.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface px-2 py-1.5">
          <div className="min-w-0">
            <div className="text-xs text-text-subtle">Login email</div>
            <div className="truncate font-mono text-sm text-text">{email}</div>
          </div>
          <CopyButton value={email} label="Email" />
        </div>
        <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface px-2 py-1.5">
          <div className="min-w-0">
            <div className="text-xs text-text-subtle">Temporary password</div>
            <div className="truncate font-mono text-sm text-text">{password}</div>
          </div>
          <CopyButton value={password} label="Password" />
        </div>
      </div>
    </div>
  );
}

function IssueAppLoginForm({
  dealerId,
  dealer,
}: {
  dealerId: string;
  dealer: Dealer;
}) {
  const toast = useToast();
  const mutate = useStepCompleteMutation(dealerId);
  const schema = STEP_PAYLOAD_SCHEMAS['issue-app-login'];
  type Form = {
    email: string;
    name: string;
    password: string;
    phone?: string;
    note?: string;
  };
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: dealer.ownerContact?.email ?? '',
      name: dealer.ownerContact?.name ?? '',
      password: '',
      phone: dealer.phone ?? '',
      note: '',
    },
  });

  // Once issued, the credentials are shown once for the admin to hand over.
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(
    null,
  );
  const [copiedPw, setCopiedPw] = useState(false);

  function fillGenerated() {
    const pw = generatePassword(14);
    setValue('password', pw, { shouldValidate: true, shouldDirty: true });
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(getValues('password'));
      setCopiedPw(true);
      toast.success('Password copied');
      window.setTimeout(() => setCopiedPw(false), 1500);
    } catch {
      toast.error('Could not copy — copy manually.');
    }
  }

  const submit = handleSubmit(async (values) => {
    try {
      await mutate.mutateAsync({ stepId: 'issue-app-login', payload: values });
      toast.success('App login issued. Dealer is now ACTIVE.');
      setIssued({ email: values.email.toLowerCase(), password: values.password });
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  if (issued) {
    return <ShareCredentialsPanel email={issued.email} password={issued.password} />;
  }

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      <div>
        <Label htmlFor="app-email" required>
          Login email
        </Label>
        <Input
          id="app-email"
          type="email"
          autoComplete="off"
          placeholder="owner@example.com"
          invalid={!!errors.email}
          {...register('email')}
        />
        <FieldError message={errors.email?.message} />
      </div>
      <div>
        <Label htmlFor="app-name" required>
          Owner name
        </Label>
        <Input
          id="app-name"
          placeholder="Full name"
          invalid={!!errors.name}
          {...register('name')}
        />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="app-password" required>
          Password
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="app-password"
            type="text"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            invalid={!!errors.password}
            className="font-mono"
            {...register('password')}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={fillGenerated}
            leftIcon={<RefreshCw width={14} height={14} />}
          >
            Generate
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={copyPassword}
            leftIcon={
              copiedPw ? (
                <Check width={14} height={14} />
              ) : (
                <Copy width={14} height={14} />
              )
            }
          >
            {copiedPw ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <FieldError message={errors.password?.message} />
        <p className="mt-1 text-xs text-text-subtle">
          Stored bcrypt-hashed. The dealer is asked to change it on first login.
        </p>
      </div>
      <div>
        <Label htmlFor="app-phone">Phone (optional)</Label>
        <Input
          id="app-phone"
          placeholder="+91…"
          invalid={!!errors.phone}
          {...register('phone')}
        />
        <FieldError message={errors.phone?.message} />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="app-note">Internal note (optional)</Label>
        <Textarea id="app-note" rows={2} {...register('note')} />
      </div>
      <div className="md:col-span-2 flex justify-end">
        <Button type="submit" loading={mutate.isPending}>
          Issue login — activate dealer
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
