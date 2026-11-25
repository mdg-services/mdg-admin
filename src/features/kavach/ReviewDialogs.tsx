import * as React from 'react';

import { Button, Checkbox, Dialog, FieldError, Label, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { reasonLabel } from '@/lib/kavachWords';
import { KAVACH_SEND_BACK_REASONS, type KavachSendBackReason } from '@dk/shared';

/** Same length the server asks for on a free-text note. */
const MIN_NOTE = 4;

function useResetOnOpen(open: boolean, reset: () => void) {
  const resetRef = React.useRef(reset);
  resetRef.current = reset;
  React.useEffect(() => {
    if (open) resetRef.current();
  }, [open]);
}

/**
 * Ask the outlet again. One tap on a reason sends it; "Something else…" opens a
 * box for what is wrong, because the outlet reads that sentence.
 */
export function AskAgainDialog({
  open,
  title,
  busy,
  onClose,
  onSend,
}: {
  open: boolean;
  /** What is being asked again: "Update DSR before 10 am, 1E". */
  title: string;
  busy: boolean;
  onClose: () => void;
  onSend: (reason: KavachSendBackReason, note: string | null) => void;
}) {
  const [other, setOther] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  useResetOnOpen(open, () => {
    setOther(false);
    setNote('');
    setTouched(false);
  });
  const trimmed = note.trim();
  const tooShort = trimmed.length < MIN_NOTE;

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Ask again"
      description={`${title}. The outlet sees the reason and sends a new photo.`}
      size="sm"
      footer={
        other ? (
          <>
            <Button variant="secondary" onClick={() => setOther(false)} disabled={busy}>
              Back
            </Button>
            <Button
              loading={busy}
              onClick={() => {
                setTouched(true);
                if (!tooShort) onSend('other', trimmed);
              }}
            >
              Ask again
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        )
      }
    >
      {other ? (
        <div>
          <Label htmlFor="kavach-ask-note">What is wrong?</Label>
          <Textarea
            id="kavach-ask-note"
            autoFocus
            rows={3}
            maxLength={300}
            value={note}
            invalid={touched && tooShort}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Say it the way you would say it on the phone"
          />
          <FieldError message={touched && tooShort ? 'Say what is wrong, in a few words' : undefined} />
        </div>
      ) : (
        <div role="group" aria-label="Reason" className="flex flex-col gap-2">
          {KAVACH_SEND_BACK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => (r === 'other' ? setOther(true) : onSend(r, null))}
              className={cn(
                'min-h-11 rounded-md border border-border-strong bg-surface px-3 text-left text-sm font-medium text-text',
                'hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {reasonLabel(r)}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/** Tell the owner, in the owners' chat. Optionally with the outlet's own photo. */
export function TellOwnerDialog({
  open,
  title,
  hasPhoto,
  busy,
  onClose,
  onSend,
}: {
  open: boolean;
  title: string;
  /** The check has a photo to put in the message. */
  hasPhoto: boolean;
  busy: boolean;
  onClose: () => void;
  onSend: (note: string, withPhoto: boolean) => void;
}) {
  const [note, setNote] = React.useState('');
  const [withPhoto, setWithPhoto] = React.useState(true);
  const [touched, setTouched] = React.useState(false);
  useResetOnOpen(open, () => {
    setNote('');
    setWithPhoto(true);
    setTouched(false);
  });
  const trimmed = note.trim();
  const tooShort = trimmed.length < MIN_NOTE;

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Tell the owner"
      description={`${title}. The owner gets your note in the owners' chat, with a push.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              setTouched(true);
              if (!tooShort) onSend(trimmed, hasPhoto && withPhoto);
            }}
          >
            Send to owner
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="kavach-owner-note">Your note</Label>
          <Textarea
            id="kavach-owner-note"
            autoFocus
            rows={4}
            maxLength={600}
            value={note}
            invalid={touched && tooShort}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What the owner needs to know or do"
          />
          <FieldError message={touched && tooShort ? 'Write a few words for the owner' : undefined} />
        </div>
        {hasPhoto ? (
          <Checkbox
            checked={withPhoto}
            onChange={(e) => setWithPhoto(e.target.checked)}
            label="Include the photo"
          />
        ) : null}
      </div>
    </Dialog>
  );
}

/** Excuse a check: it is taken out of the total for that period. */
export function ExcuseDialog({
  open,
  title,
  busy,
  onClose,
  onSend,
}: {
  open: boolean;
  title: string;
  busy: boolean;
  onClose: () => void;
  onSend: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  useResetOnOpen(open, () => {
    setReason('');
    setTouched(false);
  });
  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_NOTE;

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Excuse this check"
      description={`${title}. It is taken out of the total for this period.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              setTouched(true);
              if (!tooShort) onSend(trimmed);
            }}
          >
            Excuse
          </Button>
        </>
      }
    >
      <Label htmlFor="kavach-excuse-reason">Why is it not needed?</Label>
      <Textarea
        id="kavach-excuse-reason"
        autoFocus
        rows={3}
        maxLength={300}
        value={reason}
        invalid={touched && tooShort}
        onChange={(e) => setReason(e.target.value)}
        placeholder="For example: the toilet is shut for repairs this week"
      />
      <FieldError message={touched && tooShort ? 'Say why, in a few words' : undefined} />
    </Dialog>
  );
}

/** Mark a data point done or not done by hand, with a note. */
export function MarkDataDialog({
  open,
  verdict,
  title,
  busy,
  onClose,
  onSend,
}: {
  open: boolean;
  verdict: 'done' | 'not_done';
  title: string;
  busy: boolean;
  onClose: () => void;
  onSend: (note: string) => void;
}) {
  const [note, setNote] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  useResetOnOpen(open, () => {
    setNote('');
    setTouched(false);
  });
  const trimmed = note.trim();
  const tooShort = trimmed.length < MIN_NOTE;
  const done = verdict === 'done';

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title={done ? 'Mark done' : 'Mark not done'}
      description={`${title}. Our data could not decide this one, so you are deciding it by hand.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            variant={done ? 'primary' : 'danger'}
            onClick={() => {
              setTouched(true);
              if (!tooShort) onSend(trimmed);
            }}
          >
            {done ? 'Mark done' : 'Mark not done'}
          </Button>
        </>
      }
    >
      <Label htmlFor="kavach-mark-note">Your note</Label>
      <Textarea
        id="kavach-mark-note"
        autoFocus
        rows={3}
        maxLength={300}
        value={note}
        invalid={touched && tooShort}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What you checked, in a few words"
      />
      <FieldError message={touched && tooShort ? 'Say what you checked, in a few words' : undefined} />
    </Dialog>
  );
}
