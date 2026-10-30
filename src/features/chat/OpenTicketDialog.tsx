import * as React from 'react';

import { Button, Dialog, FieldError, Input, Label, useToast } from '@/components/ui';
import { chipClass } from '@/features/inbox/chips';
import { buildOpenBody, summaryProblem } from '@/features/inbox/desk';
import { useOpenTicket } from '@/hooks/api/useTickets';
import { ApiError } from '@/lib/api';
import { TICKET_SUMMARY_MAX, onItChoices, promiseTimeText, ticketRef } from '@dk/shared';

type OnItKey = ReturnType<typeof onItChoices>[number]['key'];

/**
 * "Open a ticket" — a person starts one by hand, after a phone call, a WhatsApp
 * or a visit, for something the AI never saw.
 *
 * One line on what it is about (admins only; the dealer never reads it), and
 * optionally "on it until" in the same step, so the dealer's chat says an update
 * is coming by then. The thread's own "⋯" menu offers it only while the thread
 * has no open ticket: there is one open ticket per thread, and the server
 * refuses a second (409), which this says in words and closes over.
 *
 * The time SENT is worked out again from the real clock at the tap, as the
 * strip's "On it until" menu does: a phone woken from sleep can hold a tick
 * hours old, and "Tomorrow 10:00" read off yesterday's date would promise the
 * dealer a day early.
 *
 * `conversationId` is the thread it is for; `null` is shut.
 */
export function OpenTicketDialog({
  conversationId,
  now,
  onClose,
}: {
  conversationId: string | null;
  /** The page's one-minute tick, to show each choice as a clock time. */
  now: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const open = useOpenTicket();
  const summaryId = React.useId();
  const onItId = React.useId();
  const [summary, setSummary] = React.useState('');
  // The chosen "on it until" chip, or none: tapping the chosen one again clears it.
  const [onIt, setOnIt] = React.useState<OnItKey | null>(null);
  const [attempted, setAttempted] = React.useState(false);

  // A fresh, empty form each time it is opened.
  React.useEffect(() => {
    setSummary('');
    setOnIt(null);
    setAttempted(false);
  }, [conversationId]);

  const problem = summaryProblem(summary);
  const tooLong = summary.trim().length > TICKET_SUMMARY_MAX;
  const shown = problem && (attempted || tooLong) ? problem : undefined;
  const nowDate = new Date(now);
  const chosen = onIt ? onItChoices(nowDate).find((c) => c.key === onIt) : undefined;

  async function submit() {
    if (!conversationId || open.isPending) return;
    setAttempted(true);
    if (problem) return;
    const tappedAt = new Date();
    const until = onIt ? (onItChoices(tappedAt).find((c) => c.key === onIt)?.until ?? null) : null;
    try {
      const ticket = await open.mutateAsync(buildOpenBody(conversationId, summary, until));
      toast.success(
        until
          ? `Ticket ${ticketRef(ticket.number)} opened. The dealer is told you are on it until ${promiseTimeText(until.toISOString(), 'en', tappedAt)}.`
          : `Ticket ${ticketRef(ticket.number)} opened.`,
      );
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error('This chat already has an open ticket. Close it first, or work from it.');
        onClose();
        return;
      }
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open={!!conversationId}
      onClose={onClose}
      title="Open a ticket"
      description="For something you are handling that the AI never saw. It stays on your list until you close it."
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={open.isPending}>
            Open ticket
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
          <Label htmlFor={summaryId} required>
            What is it about
          </Label>
          <Input
            id={summaryId}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="For example: Owner will send the PAN card tomorrow."
            invalid={!!shown}
          />
          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <FieldError message={shown} />
            </div>
            <span
              className={
                tooLong
                  ? 'ml-auto shrink-0 text-xs tabular-nums text-danger'
                  : 'ml-auto shrink-0 text-xs tabular-nums text-text-subtle'
              }
            >
              {summary.trim().length} / {TICKET_SUMMARY_MAX}
            </span>
          </div>
        </div>

        <div>
          <p id={onItId} className="mb-1 text-sm font-medium text-text">
            On it until <span className="ml-1 text-xs font-normal text-text-subtle">Optional</span>
          </p>
          <div role="group" aria-labelledby={onItId} className="flex flex-wrap gap-1.5">
            {onItChoices(nowDate).map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={onIt === c.key}
                onClick={() => setOnIt((cur) => (cur === c.key ? null : c.key))}
                className={chipClass(onIt === c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-text-muted">
            {chosen
              ? `The dealer is told you are on it until ${promiseTimeText(chosen.until.toISOString(), 'en', nowDate)}.`
              : 'The dealer sees a ticket bar in their chat while it is open. Pick a time and it says an update is coming by then.'}
          </p>
        </div>
      </form>
    </Dialog>
  );
}
