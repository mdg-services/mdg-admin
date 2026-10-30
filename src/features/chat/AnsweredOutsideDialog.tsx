import * as React from 'react';

import { Button, Dialog, FieldError, Label, Textarea, useToast } from '@/components/ui';
import { outsideNoteProblem } from '@/features/inbox/desk';
import { useAnsweredOutside } from '@/hooks/api/useAnsweredOutside';
import { TICKET_NOTE_MAX } from '@dk/shared';

/**
 * "Answered outside the app" — the admin rang the dealer, or wrote on WhatsApp,
 * and the chat should stop looking like a dealer is waiting.
 *
 * It clears the waiting clock and starts the AI's after-reply quiet exactly as a
 * typed reply does, so the machine does not answer the same question on top of
 * the person who just did. An open ticket on the thread counts as updated. The
 * dealer is sent nothing; the note (optional) is kept in the audit trail only.
 *
 * `conversationId` is the thread it is for; `null` is shut.
 */
export function AnsweredOutsideDialog({
  conversationId,
  onClose,
}: {
  conversationId: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const answered = useAnsweredOutside();
  const noteId = React.useId();
  const [note, setNote] = React.useState('');

  // A fresh, empty box each time it is opened.
  React.useEffect(() => {
    setNote('');
  }, [conversationId]);

  const problem = outsideNoteProblem(note);

  async function submit() {
    if (!conversationId || answered.isPending || problem) return;
    const trimmed = note.trim();
    try {
      await answered.mutateAsync({ conversationId, ...(trimmed ? { note: trimmed } : {}) });
      toast.success('Marked as answered. The AI stays quiet in this chat for a while.');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open={!!conversationId}
      onClose={onClose}
      title="Answered outside the app"
      description="Use this when you answered the dealer by phone, on WhatsApp or in person. The chat stops counting as waiting. The dealer is sent nothing."
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={answered.isPending} disabled={!!problem}>
            Mark as answered
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
        <div>
          <Label htmlFor={noteId} hint="Optional">
            Note
          </Label>
          <Textarea
            id={noteId}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: rang the owner, told him the figure."
            invalid={!!problem}
          />
          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <FieldError message={problem ?? undefined} />
            </div>
            <span className="ml-auto shrink-0 text-xs tabular-nums text-text-subtle">
              {note.trim().length.toLocaleString('en-IN')} / {TICKET_NOTE_MAX.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
        <p className="text-xs text-text-muted">
          Only your team sees the note, in the activity log.
        </p>
      </form>
    </Dialog>
  );
}
