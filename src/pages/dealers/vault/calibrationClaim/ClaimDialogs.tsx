import * as React from 'react';

import {
  Button,
  Callout,
  Checkbox,
  ConfirmDialog,
  Dialog,
  FieldError,
  Input,
  Label,
  Textarea,
} from '@/components/ui';
import { useRevealOnChange } from '@/hooks/useRevealOnChange';
import type { CalibrationClaimView, ClaimPlan } from '@dk/shared';
import type { ClaimOverridesInput } from '@dk/shared/schemas';

import {
  approvalFacts,
  correctionFormFrom,
  correctionPayload,
  exclusionChoices,
  leftOutUnits,
  planSummary,
  reasonProblem,
  SLOT_LABEL,
  valueRows,
  type CorrectionForm,
} from './format';
import { UploadPaperButton } from './UploadPaperButton';

/**
 * The small forms of a claim: a reason, an approval, corrections, and recording
 * by hand what happened on IndianOil.
 *
 * Every one re-seeds when it opens — a dialog that remembered the last claim's
 * reason would put it on the next — and every one stays OPEN when the server
 * refuses, with what was typed still in it. The pane closes it from its own
 * success handler (`onDone`), exactly as `ConfirmDialog` is used.
 */

/* ─────────────────────── a reason (cancel, send back, accept a check) ─────────────────────── */

export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  confirmVariant = 'primary',
  dismissLabel = 'Cancel',
  max,
  loading,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
  /** What the way out says. "Cancel" is wrong beside a button that cancels something. */
  dismissLabel?: string;
  /** The longest the server takes. */
  max: number;
  loading: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [text, setText] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setText('');
    setTouched(false);
  }, [open]);

  const problem = touched ? reasonProblem(text, max) : null;

  function submit() {
    setTouched(true);
    if (reasonProblem(text, max)) return;
    onSubmit(text.trim());
  }

  return (
    <Dialog
      open={open}
      onClose={loading ? () => {} : onClose}
      size="md"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {dismissLabel}
          </Button>
          <Button variant={confirmVariant} onClick={submit} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div>
        <Label htmlFor="claim-reason" required>
          {label}
        </Label>
        <Textarea
          id="claim-reason"
          rows={4}
          value={text}
          placeholder={placeholder}
          invalid={!!problem}
          disabled={loading}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        <FieldError message={problem ?? undefined} />
      </div>
    </Dialog>
  );
}

/* ─────────────────────── approval ─────────────────────── */

/**
 * What an approval lets happen, line by line, before it is given.
 *
 * Approving is the one act that lets the robot write to IndianOil, so the box
 * lists the plan's own figures — the very ones it will type and check the portal
 * against — and the units it leaves out. "Also press Finalize" starts from the
 * plan's setting but is the admin's call on this claim, and its warning is in
 * plain sight: Finalize submits the claim and cannot be undone.
 */
export function ApproveDialog({
  open,
  onCancel,
  onConfirm,
  plan,
  defaultFinalize,
  letterIn,
  loading,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (finalize: boolean) => void;
  plan: ClaimPlan;
  defaultFinalize: boolean;
  /** A signed letter PDF is already on the claim (accepted from the owner, or uploaded). */
  letterIn: boolean;
  loading: boolean;
}) {
  const [finalize, setFinalize] = React.useState(defaultFinalize);

  React.useEffect(() => {
    if (open) setFinalize(defaultFinalize);
  }, [open, defaultFinalize]);

  const leftOut = leftOutUnits(plan);

  return (
    <ConfirmDialog
      open={open}
      onCancel={onCancel}
      onConfirm={() => onConfirm(finalize)}
      title="Approve this claim?"
      confirmLabel="Approve"
      size="md"
      loading={loading}
      description={
        <div className="grid gap-3">
          <p className="text-text">
            This lets MDG file the claim on IndianOil. Exactly this will be typed in:{' '}
            {planSummary(plan)}.
          </p>
          <dl className="grid gap-2">
            {approvalFacts(plan).map((f) => (
              <div key={f.label}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {f.label}
                </dt>
                <dd className="whitespace-pre-line break-words text-sm text-text">{f.value}</dd>
              </div>
            ))}
          </dl>
          {leftOut.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Left out
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-text">
                {leftOut.map((l) => (
                  <li key={l} className="break-words">
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <Checkbox
              align="start"
              checked={finalize}
              disabled={loading}
              onChange={(e) => setFinalize(e.target.checked)}
              label="Also press Finalize on the portal"
              hint="Leave this off to stop on the last page and finalize it yourself."
            />
            <p className="mt-1 text-xs font-medium text-warning-strong md:text-warning">
              Finalize cannot be undone.
            </p>
          </div>
          <p className="text-xs text-text-muted">
            {letterIn
              ? 'The signed letter is in, so filing starts within a minute.'
              : 'The signed letter is not in yet. Filing starts by itself the minute it is.'}
          </p>
        </div>
      }
    />
  );
}

/* ─────────────────────── corrections ─────────────────────── */

export function CorrectionsDialog({
  open,
  onClose,
  claim,
  loading,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  claim: CalibrationClaimView;
  loading: boolean;
  onSubmit: (payload: ClaimOverridesInput) => void;
}) {
  const [form, setForm] = React.useState<CorrectionForm>(() => correctionFormFrom(claim.overrides));
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const errorRef = useRevealOnChange<HTMLDivElement>(error, attempt);

  React.useEffect(() => {
    if (!open) return;
    setForm(correctionFormFrom(claim.overrides));
    setError(null);
    // Opened afresh: what the claim holds now, not what an earlier open left.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const read = new Map(valueRows(claim).map((r) => [r.key, r.readAs ?? r.value]));
  const choices = exclusionChoices(claim);
  const set = <K extends keyof CorrectionForm>(key: K, value: CorrectionForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit() {
    setAttempt((n) => n + 1);
    const result = correctionPayload(form, claim.overrides);
    if (!result.ok) {
      setError(result.problem);
      return;
    }
    setError(null);
    onSubmit(result.payload);
  }

  const hint = (key: string) => (
    <p className="mt-1 break-words text-xs text-text-subtle">
      Read from the paper: {read.get(key) ?? '—'}
    </p>
  );

  return (
    <Dialog
      open={open}
      onClose={loading ? () => {} : onClose}
      size="lg"
      title="Corrections"
      description="Type a value only where the paper was read wrongly. A box left empty uses what was read. The checks run again after you save."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading}>
            Save corrections
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? (
          <div ref={errorRef} role="alert">
            <Callout intent="warning">{error}</Callout>
          </div>
        ) : null}

        <div className="grid gap-3 [&>*]:min-w-0 md:grid-cols-2">
          <div>
            <Label htmlFor="fix-cert">Certificate number</Label>
            <Input
              id="fix-cert"
              value={form.certificateNo}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              disabled={loading}
              onChange={(e) => set('certificateNo', e.target.value)}
            />
            {hint('cert-no')}
          </div>
          <div>
            <Label htmlFor="fix-cal">Calibration date</Label>
            <Input
              id="fix-cal"
              type="date"
              value={form.calibrationDate}
              disabled={loading}
              onChange={(e) => set('calibrationDate', e.target.value)}
            />
            {hint('cal-date')}
          </div>
          <div>
            <Label htmlFor="fix-valid">Valid until</Label>
            <Input
              id="fix-valid"
              type="date"
              value={form.validityDate}
              disabled={loading}
              onChange={(e) => set('validityDate', e.target.value)}
            />
            {hint('valid')}
          </div>
          <div>
            <Label htmlFor="fix-receipt">Receipt number</Label>
            <Input
              id="fix-receipt"
              value={form.receiptNo}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              disabled={loading}
              onChange={(e) => set('receiptNo', e.target.value)}
            />
            {hint('receipt-no')}
          </div>
          <div>
            <Label htmlFor="fix-receipt-date">Receipt date</Label>
            <Input
              id="fix-receipt-date"
              type="date"
              value={form.receiptDate}
              disabled={loading}
              onChange={(e) => set('receiptDate', e.target.value)}
            />
            {hint('receipt-date')}
          </div>
          <div>
            <Label htmlFor="fix-amount">Amount per nozzle (₹)</Label>
            <Input
              id="fix-amount"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={form.amountPerNozzle}
              disabled={loading}
              onChange={(e) => set('amountPerNozzle', e.target.value)}
            />
            <p className="mt-1 text-xs text-text-subtle">Leave empty for the usual rate.</p>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-text">Units to leave out</p>
          <p className="text-xs text-text-muted">
            A tick keeps that unit out of the claim, whatever the certificate says about it.
          </p>
          {choices.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">No units have been read yet.</p>
          ) : (
            <div className="mt-1 grid">
              {choices.map((c) => (
                <Checkbox
                  key={c.serialNo}
                  align="start"
                  checked={form.excludeSerials.includes(c.serialNo)}
                  disabled={loading}
                  onChange={(e) =>
                    set(
                      'excludeSerials',
                      e.target.checked
                        ? [...form.excludeSerials, c.serialNo]
                        : form.excludeSerials.filter((s) => s !== c.serialNo),
                    )
                  }
                  label={<span className="break-words">{c.label}</span>}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/* ─────────────────────── recorded by hand ─────────────────────── */

export function MarkFiledDialog({
  open,
  onClose,
  loading,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  onSubmit: (input: { finalized: boolean; portalReference: string }) => void;
}) {
  const [finalized, setFinalized] = React.useState(false);
  const [reference, setReference] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setFinalized(false);
    setReference('');
  }, [open]);

  const tooLong = reference.trim().length > 80;

  return (
    <Dialog
      open={open}
      onClose={loading ? () => {} : onClose}
      size="md"
      title="Mark as filed by hand"
      description="Use this when the claim was filed on IndianOil outside MDG. Nothing is sent to IndianOil."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            loading={loading}
            disabled={tooLong}
            onClick={() => onSubmit({ finalized, portalReference: reference.trim() })}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Checkbox
          align="start"
          checked={finalized}
          disabled={loading}
          onChange={(e) => setFinalized(e.target.checked)}
          label="It was finalized on IndianOil"
          hint="Leave this off if it is only saved so far. You can mark it again once it is finalized."
        />
        <div>
          <Label htmlFor="claim-ref" hint="optional">
            Claim number shown by IndianOil
          </Label>
          <Input
            id="claim-ref"
            value={reference}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            invalid={tooLong}
            disabled={loading}
            onChange={(e) => setReference(e.target.value)}
          />
          <FieldError message={tooLong ? 'That is too long (80 characters at most).' : undefined} />
        </div>
      </div>
    </Dialog>
  );
}

/* ─────────────────────── upload the papers by hand ─────────────────────── */

/**
 * Both papers in one place, for a claim whose papers are not coming from the
 * eMaaptaul site: choose the certificate, choose the receipt. Each uploads on its
 * own as soon as it is picked, so one that fails does not take the other with it.
 */
export function UploadPapersDialog({
  open,
  onClose,
  dealerId,
  claim,
}: {
  open: boolean;
  onClose: () => void;
  dealerId: string;
  claim: CalibrationClaimView;
}) {
  const slots = ['certificate', 'receipt'] as const;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Upload the papers"
      description="A PDF or a clear photo of each."
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <ul className="divide-y divide-border">
        {slots.map((slot) => {
          const doc = claim.documents.find((d) => d.slot === slot);
          return (
            <li
              key={slot}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">{SLOT_LABEL[slot]}</p>
                <p className="break-words text-xs text-text-muted">
                  {doc ? doc.filename : 'Not here yet.'}
                </p>
              </div>
              <div className="shrink-0">
                <UploadPaperButton
                  dealerId={dealerId}
                  claimId={claim.id}
                  slot={slot}
                  label={doc ? 'Replace' : 'Choose a file'}
                  variant={doc ? 'ghost' : 'secondary'}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
