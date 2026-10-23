import * as React from 'react';

import { Button, Dialog, FieldError, Label, Textarea, useToast } from '@/components/ui';
import { CLOSE_REASON_MAX, closeProblem } from '@/lib/onboarding';

/**
 * Close a registration or an outlet's setup: the lead said no, or went silent
 * for good. A reason is required, because this is what keeps the funnel honest
 * and what the next person reads when the same pump registers again.
 *
 * It knows nothing about which of the two it is closing: the caller says what
 * the dialog is about and what to do with the reason, and a failure comes back
 * as a rejected promise that is toasted here. `subject` is the one line that
 * names what is being closed. `null` is closed.
 */
export function CloseDialog({
  open,
  title,
  subject,
  confirmLabel = 'Close it',
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  subject: React.ReactNode;
  confirmLabel?: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const toast = useToast();
  const reasonId = React.useId();
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  // A fresh, empty box every time it opens.
  React.useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  const problem = closeProblem(reason);
  // Not shouted at before anyone has typed: the button simply waits.
  const shown = touched || reason.length > CLOSE_REASON_MAX ? problem : null;

  async function submit() {
    if (pending) return;
    setTouched(true);
    if (problem) return;
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={pending}>
            {confirmLabel}
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
        <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 text-sm text-text [overflow-wrap:anywhere]">
          {subject}
        </div>
        <div>
          <Label htmlFor={reasonId} required>
            Reason
          </Label>
          <Textarea
            id={reasonId}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="For example: not interested, already uses another service."
            invalid={!!shown}
          />
          <FieldError message={shown ?? undefined} />
        </div>
        <p className="text-xs text-text-muted">
          This does not message the dealer. The reason is kept with the record.
        </p>
      </form>
    </Dialog>
  );
}
