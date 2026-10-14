import * as React from 'react';

import { Button, Dialog, FieldError, Label, Textarea, useToast } from '@/components/ui';
import { useMarkEnrolmentContacted } from '@/hooks/api/useEnrolments';
import { ENROLMENT_NOTE_MAX, noteProblem } from '@/pages/registrations/format';
import type { Enrolment } from '@dk/shared';

/**
 * Record that somebody at MDG has been in touch with a registration — with an
 * optional note about how it went ("called, will join in November").
 *
 * The note is optional because the press of the button is the fact that matters
 * and the list should not need a sentence to go down; the box is there for the
 * times there is something worth the next person knowing. Marking it contacted
 * does not message the person.
 *
 * It owns its own request and its own toasts. `enrolment` is the one being
 * marked; `null` is closed.
 */
export function MarkContactedDialog({
  enrolment,
  onClose,
}: {
  enrolment: Enrolment | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const mark = useMarkEnrolmentContacted();
  const noteId = React.useId();
  const [note, setNote] = React.useState('');

  // A fresh, empty box for every registration.
  React.useEffect(() => {
    setNote('');
  }, [enrolment?.id]);

  const problem = noteProblem(note);

  async function submit() {
    if (!enrolment || mark.isPending || problem) return;
    try {
      await mark.mutateAsync({ id: enrolment.id, note: note.trim() || undefined });
      toast.success('Marked as contacted.');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open={!!enrolment}
      onClose={onClose}
      title="Mark as contacted"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={mark.isPending} disabled={!!problem}>
            Mark as contacted
          </Button>
        </>
      }
    >
      {enrolment ? (
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 [overflow-wrap:anywhere]">
            <p className="text-sm font-medium text-text">{enrolment.name}</p>
            <p className="mt-0.5 text-xs text-text-subtle">
              {[enrolment.pumpName, `SAP code ${enrolment.sapCode}`].filter(Boolean).join(' · ')}
            </p>
          </div>

          <div>
            <Label htmlFor={noteId} hint="Optional">
              Note
            </Label>
            <Textarea
              id={noteId}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: called, will join in November."
              invalid={!!problem}
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <FieldError message={problem ?? undefined} />
              </div>
              <span
                className={
                  problem
                    ? 'ml-auto shrink-0 text-xs tabular-nums text-danger'
                    : 'ml-auto shrink-0 text-xs tabular-nums text-text-subtle'
                }
              >
                {note.trim().length.toLocaleString('en-IN')} /{' '}
                {ENROLMENT_NOTE_MAX.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <p className="text-xs text-text-muted">
            This only records that someone has been in touch. It does not message them.
          </p>
        </form>
      ) : null}
    </Dialog>
  );
}
