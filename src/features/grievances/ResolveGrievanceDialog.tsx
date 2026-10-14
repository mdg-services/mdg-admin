import * as React from 'react';

import { Button, Callout, Dialog, FieldError, Label, Textarea, useToast } from '@/components/ui';
import { ContactLinks } from '@/features/intake/ContactLinks';
import { useResolveGrievance } from '@/hooks/api/useGrievances';
import {
  GRIEVANCE_NOTE_MAX,
  noteProblem,
  replySubject,
  resolveWarning,
} from '@/pages/grievances/format';
import { GRIEVANCE_CATEGORY_LABELS } from '@dk/shared';
import type { Grievance } from '@dk/shared';

/**
 * Close a grievance — and refuse to without a written note.
 *
 * The note is what the next person reads when the same person writes in again,
 * so an empty box would turn "resolve" into a way to make the number on the nav
 * go down. It says in plain words what resolving does NOT do: the person is not
 * emailed. They were sent an acknowledgement with their number when they
 * submitted, and nothing since; telling them the outcome is the admin's job,
 * so their number and email are on this dialog to do it from. One made through
 * the assistant may have no email at all, and then the dialog says to call.
 *
 * It owns its own request and its own toasts. `grievance` is the one being
 * resolved; `null` is closed.
 */
export function ResolveGrievanceDialog({
  grievance,
  onClose,
}: {
  grievance: Grievance | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const resolve = useResolveGrievance();
  const noteId = React.useId();
  const [note, setNote] = React.useState('');
  // The "write something" message waits for a press of Resolve: showing it
  // against a box nobody has touched yet is a scolding, not a hint. A note that
  // is too long is said at once, because that one only gets worse.
  const [attempted, setAttempted] = React.useState(false);

  // A fresh, empty box for every grievance.
  React.useEffect(() => {
    setNote('');
    setAttempted(false);
  }, [grievance?.id]);

  const problem = noteProblem(note);
  const tooLong = note.trim().length > GRIEVANCE_NOTE_MAX;
  const shownProblem = problem && (attempted || tooLong) ? problem : undefined;

  async function submit() {
    if (!grievance || resolve.isPending) return;
    setAttempted(true);
    if (problem) return;
    try {
      await resolve.mutateAsync({ id: grievance.id, note: note.trim() });
      toast.success(`Grievance ${grievance.ref} resolved.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open={!!grievance}
      onClose={onClose}
      title={grievance ? `Resolve ${grievance.ref}` : 'Resolve grievance'}
      // One line of short words: with the keyboard up, three stacked buttons
      // left the note box almost nothing to live in.
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={resolve.isPending}>
            Resolve
          </Button>
        </>
      }
    >
      {grievance ? (
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 [overflow-wrap:anywhere]">
            <p className="text-xs text-text-subtle">
              {GRIEVANCE_CATEGORY_LABELS[grievance.category] ?? grievance.category} ·{' '}
              {grievance.name}
            </p>
            <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-sm text-text-muted">
              {grievance.message}
            </p>
            <div className="mt-1">
              <ContactLinks
                mobile={grievance.mobile}
                email={grievance.email}
                mailSubject={replySubject(grievance)}
              />
            </div>
          </div>

          <Callout intent="warning">{resolveWarning(grievance)}</Callout>

          <div>
            <Label htmlFor={noteId} required>
              What was done
            </Label>
            <Textarea
              id={noteId}
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: called on 12 Oct, the meter was re-checked and they are happy."
              invalid={!!shownProblem}
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <FieldError message={shownProblem} />
              </div>
              <span
                className={
                  tooLong
                    ? 'ml-auto shrink-0 text-xs tabular-nums text-danger'
                    : 'ml-auto shrink-0 text-xs tabular-nums text-text-subtle'
                }
              >
                {note.trim().length.toLocaleString('en-IN')} /{' '}
                {GRIEVANCE_NOTE_MAX.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <p className="text-xs text-text-muted">
            Only your team sees this note. It stays on the grievance, with your name and the time.
          </p>
        </form>
      ) : null}
    </Dialog>
  );
}
