import * as React from 'react';

import { Button, Dialog, FieldError, Label, Textarea, useToast } from '@/components/ui';
import { useMarkCallbackCalled } from '@/hooks/api/useCallbacks';
import { CALLBACK_NOTE_MAX, noteProblem } from '@/pages/callbacks/format';
import type { CallbackRequest } from '@dk/shared';

/**
 * Record that somebody at MDG has called a person who asked for a call — with
 * an optional note about how it went ("wants a visit on Monday"). The press of
 * the button is the fact that matters; marking it does not message anybody.
 *
 * `request` is the one being marked; `null` is closed.
 */
export function MarkCalledDialog({
  request,
  onClose,
}: {
  request: CallbackRequest | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const mark = useMarkCallbackCalled();
  const noteId = React.useId();
  const [note, setNote] = React.useState('');

  // A fresh, empty box for every request.
  React.useEffect(() => {
    setNote('');
  }, [request?.id]);

  const problem = noteProblem(note);

  async function submit() {
    if (!request || mark.isPending || problem) return;
    try {
      await mark.mutateAsync({ id: request.id, note: note.trim() || undefined });
      toast.success('Marked as called.');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open={!!request}
      onClose={onClose}
      title="Mark as called"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={mark.isPending} disabled={!!problem}>
            Mark as called
          </Button>
        </>
      }
    >
      {request ? (
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="min-w-0 rounded-md border border-border bg-surface-2 p-2.5 [overflow-wrap:anywhere]">
            <p className="text-sm font-medium text-text">{request.name}</p>
            {request.outlet ? (
              <p className="mt-0.5 text-xs text-text-subtle">{request.outlet}</p>
            ) : null}
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
              placeholder="For example: wants a visit on Monday."
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
                {CALLBACK_NOTE_MAX.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <p className="text-xs text-text-muted">
            This only records the call. It does not message them.
          </p>
        </form>
      ) : null}
    </Dialog>
  );
}
