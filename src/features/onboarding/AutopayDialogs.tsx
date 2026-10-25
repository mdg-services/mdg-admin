import * as React from 'react';

import { Button, Dialog, FieldError, Label, Select, Textarea, useToast } from '@/components/ui';
import { useAutopayFollowUp, useStopAutopay } from '@/hooks/api/useAutopay';
import { ApiError } from '@/lib/api';
import {
  AUTOPAY_FOLLOW_UP_MAX,
  AUTOPAY_STOP_NOTE_MAX,
  failedText,
  followUpNoteProblem,
  perMonth,
  stopNoteProblem,
} from '@/lib/autopay';
import { istStamp } from '@/lib/intake';
import {
  AUTOPAY_ENDED_BY_LABELS,
  AUTOPAY_STOP_REASONS,
  AUTOPAY_STOP_REASON_LABELS,
  dealerCodeLabel,
  type AdminAutopay,
  type AutopayStopReason,
} from '@dk/shared';

/** What a refused press says: the server's own plain sentence, or ours for "Razorpay is off". */
export function errorText(err: unknown): string {
  return err instanceof ApiError
    ? failedText(err.status, err.message)
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
  const noteId = React.useId();
  const reasonId = React.useId();
  const [note, setNote] = React.useState('');
  const [reason, setReason] = React.useState<AutopayStopReason | ''>('');
  const [touched, setTouched] = React.useState(false);
  const problem = stopNoteProblem(note);

  async function submit() {
    if (stop.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await stop.mutateAsync({ id: autopay.id, note: note.trim(), ...(reason ? { reason } : {}) });
      toast.success('Autopay stopped. The next bill goes to the owner as a link.');
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
          {autopay.state === 'setting_up'
            ? 'The approval link the owner was sent stops working. '
            : 'No more money is taken after this. '}
          The services do not stop. The month already paid runs out as usual, and the next bill goes
          to the owner as a link.
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
