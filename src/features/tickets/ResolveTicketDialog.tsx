import * as React from 'react';

import {
  Button,
  Dialog,
  FieldError,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import { useResolveTicket } from '@/hooks/api/useTickets';
import { ApiError } from '@/lib/api';
import {
  askedByLabel,
  noteProblem,
} from '@/pages/tickets/format';
import { TICKET_NOTE_MAX, dealerCodeLabel, ticketRef } from '@dk/shared';
import type { TicketView } from '@dk/shared';

/**
 * Close a ticket — and refuse to without a written note.
 *
 * The note is the whole point of the screen. A ticket exists because a machine
 * gave up on a question, and the only thing that closes it is a person saying
 * what they did about it; an empty box would turn "resolve" into a way to make
 * the number on the nav go down.
 *
 * It owns its own request and its own toasts, so the Tickets page and the
 * thread's strip open it the same way and cannot drift apart. `ticket` is the
 * one being resolved; `null` is closed.
 */
export function ResolveTicketDialog({
  ticket,
  onClose,
}: {
  ticket: TicketView | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const resolve = useResolveTicket();
  const noteId = React.useId();
  const [note, setNote] = React.useState('');
  // The "write something" message waits for a press of Resolve: showing it
  // against a box nobody has touched yet is a scolding, not a hint. A note that
  // is too long is said at once, because that one only gets worse.
  const [attempted, setAttempted] = React.useState(false);

  // A fresh, empty box for every ticket.
  React.useEffect(() => {
    setNote('');
    setAttempted(false);
  }, [ticket?.id]);

  const problem = noteProblem(note);
  const tooLong = note.trim().length > TICKET_NOTE_MAX;
  const shownProblem = problem && (attempted || tooLong) ? problem : undefined;

  async function submit() {
    if (!ticket || resolve.isPending) return;
    setAttempted(true);
    if (problem) return;
    try {
      await resolve.mutateAsync({ id: ticket.id, note: note.trim() });
      toast.success(`Ticket ${ticketRef(ticket.number)} resolved.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
      // A 409 means somebody resolved it first. The lists are already being
      // refreshed, and nothing typed here can change that, so do not leave a
      // box open over a ticket that is no longer there to resolve.
      if (e instanceof ApiError && e.status === 409) onClose();
    }
  }

  return (
    <Dialog
      open={!!ticket}
      onClose={onClose}
      title={ticket ? `Resolve ticket ${ticketRef(ticket.number)}` : 'Resolve ticket'}
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
      {ticket ? (
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
              {dealerCodeLabel(ticket.dealerCode)} · {askedByLabel(ticket)}
            </p>
            <p className="mt-0.5 text-sm font-medium text-text">{ticket.summary}</p>
            <p className="mt-0.5 line-clamp-3 text-sm text-text-muted">{ticket.question}</p>
          </div>

          <div>
            <Label htmlFor={noteId} required>
              What was done
            </Label>
            <Textarea
              id={noteId}
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: called the dealer, the 12 Oct payment is booked."
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
                {note.trim().length.toLocaleString('en-IN')} / {TICKET_NOTE_MAX.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <p className="text-xs text-text-muted">
            Only your team sees this note. The dealer only sees that the ticket is closed, so
            answer them in the chat.
          </p>
        </form>
      ) : null}
    </Dialog>
  );
}
