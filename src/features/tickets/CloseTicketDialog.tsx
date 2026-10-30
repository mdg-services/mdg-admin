import * as React from 'react';

import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  FieldError,
  Input,
  Label,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  DEALER_WAITING_MESSAGE,
  OTHER_SERVICE_ID,
  buildCloseBody,
  closeProblems,
  waitingHeading,
} from '@/features/inbox/desk';
import { useSendMessage } from '@/hooks/api/useSendMessage';
import { useServicesQuery } from '@/hooks/api/useServices';
import { useCloseTicket } from '@/hooks/api/useTickets';
import { ApiError } from '@/lib/api';
import { askedByLabel } from '@/pages/tickets/format';
import { TICKET_NOTE_MAX, dealerCodeLabel, ticketRef } from '@dk/shared';
import type { TicketView } from '@dk/shared';

/** What a failed request says: the server's own sentence when it sent one. */
function failure(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'That did not go through.';
}

/**
 * Close a ticket — the one sheet for it (ADR 0026; it replaced the ticket's
 * Resolve and the chat's own Resolve, which closed different things).
 *
 * Closing needs nothing. An internal note and a "Services provided" entry are
 * both optional, and the dealer is sent nothing: they learn of it from the bar
 * in their chat, and the reply that answered them is the answer.
 *
 * THE ONE THING IT WILL NOT DO IS CLOSE OVER A DEALER WHO IS WAITING. When the
 * thread's dealer wrote after the last reply (`dealerWaitingSince`), the sheet
 * says so and carries a reply box: Close sends that text as an ordinary chat
 * reply first, through the same path as the composer, and then closes. The
 * server refuses the same close (409 `DEALER_WAITING`) and the sheet says the
 * server's own words, which is what happens if the dealer writes again between
 * the reply and the close — the box comes back for the new message.
 *
 * "Answered them on the phone" is not this sheet's job: the thread's "⋯" menu
 * has "Answered outside the app", which clears the waiting clock.
 *
 * It owns its requests and its toasts, so every caller closes a ticket the same
 * way. `ticket` is the one being closed; `null` is shut.
 */
export function CloseTicketDialog({
  ticket,
  now,
  onClose,
}: {
  ticket: TicketView | null;
  /** The page's one-minute tick, for "wrote since your last reply (25 min ago)". */
  now: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const close = useCloseTicket();
  const send = useSendMessage();
  const servicesQ = useServicesQuery();
  const ids = {
    note: React.useId(),
    reply: React.useId(),
    service: React.useId(),
    serviceName: React.useId(),
  };

  const [note, setNote] = React.useState('');
  const [reply, setReply] = React.useState('');
  const [addService, setAddService] = React.useState(false);
  const [serviceId, setServiceId] = React.useState('');
  const [serviceName, setServiceName] = React.useState('');
  // Problems are said after a press of Close, not while the sheet is still
  // blank: a scolding on a box nobody has touched is not a hint. Too long is
  // said at once, because that one only gets worse.
  const [attempted, setAttempted] = React.useState(false);
  // True once this sheet has sent the dealer's answer, so the box goes away and
  // a failed close cannot send it twice.
  const [replySent, setReplySent] = React.useState(false);
  // The server said the dealer wrote again, in its own words; the box is back for
  // the new message.
  const [waitedAgain, setWaitedAgain] = React.useState<string | null>(null);

  // A fresh, empty sheet for every ticket.
  React.useEffect(() => {
    setNote('');
    setReply('');
    setAddService(false);
    setServiceId('');
    setServiceName('');
    setAttempted(false);
    setReplySent(false);
    setWaitedAgain(null);
  }, [ticket?.id]);

  // A TYPED REPLY IS NEVER DROPPED. If a colleague answers (or marks it answered
  // outside the app) while this sheet is open, the dealer stops counting as waiting
  // — but the words already typed here still go before the close.
  const waiting =
    !!ticket &&
    (!!waitedAgain || ((!!ticket.dealerWaitingSince || reply.trim().length > 0) && !replySent));
  const problems = closeProblems({ note, waiting, reply, addService, serviceId, serviceName });
  const tooLong = note.trim().length > TICKET_NOTE_MAX;
  const shown = {
    note: problems.note && (attempted || tooLong) ? problems.note : undefined,
    reply: attempted ? problems.reply : undefined,
    service: attempted ? problems.service : undefined,
    serviceName: attempted ? problems.serviceName : undefined,
  };
  const busy = send.isPending || close.isPending;
  const heading = ticket ? waitingHeading(ticket, new Date(now)) : null;

  async function submit() {
    if (!ticket || busy) return;
    setAttempted(true);
    if (Object.keys(problems).length > 0) return;

    // The answer first. Nothing is closed unless it went.
    if (waiting) {
      try {
        await send.mutateAsync({ conversationId: ticket.conversationId, body: reply.trim() });
      } catch (e) {
        toast.error(`Your reply was not sent, so the ticket is still open. ${failure(e)}`);
        return;
      }
      setReplySent(true);
      setWaitedAgain(null);
      setReply('');
    }

    try {
      await close.mutateAsync({
        id: ticket.id,
        dealerId: ticket.dealerId,
        body: buildCloseBody({ note, addService, serviceId, serviceName }, servicesQ.data ?? []),
      });
      toast.success(`Ticket ${ticketRef(ticket.number)} closed.`);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'DEALER_WAITING') {
        // They wrote again while this sheet was open. Their new message needs an
        // answer too; nothing typed here can change that.
        const words = e.message || DEALER_WAITING_MESSAGE;
        setWaitedAgain(words);
        setAttempted(false);
        toast.error(words);
        return;
      }
      toast.error(failure(e));
      // A 409 otherwise means somebody closed it first. The lists are already
      // being refreshed, and nothing typed here can change that, so do not leave
      // a sheet open over a ticket that is no longer there to close.
      if (e instanceof ApiError && e.status === 409) onClose();
    }
  }

  return (
    <Dialog
      open={!!ticket}
      onClose={onClose}
      title={ticket ? `Close ticket ${ticketRef(ticket.number)}` : 'Close ticket'}
      // One line of short words: with the keyboard up, three stacked buttons
      // left the boxes almost nothing to live in.
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            {waiting ? 'Send and close' : 'Close'}
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

          {waiting ? (
            <div className="grid gap-2">
              <Callout intent="warning">
                {waitedAgain ?? heading ?? 'The dealer wrote since your last reply'}
              </Callout>
              <div>
                <Label htmlFor={ids.reply}>Your reply to the dealer</Label>
                <Textarea
                  id={ids.reply}
                  rows={3}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write the answer. It goes to the dealer in the chat, then the ticket closes."
                  invalid={!!shown.reply}
                />
                <FieldError message={shown.reply} />
              </div>
            </div>
          ) : null}

          <div>
            <Label htmlFor={ids.note} hint="Optional">
              Note for your team
            </Label>
            <Textarea
              id={ids.note}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: called the dealer, the 12 Oct payment is booked."
              invalid={!!shown.note}
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <FieldError message={shown.note} />
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

          <div className="grid gap-2">
            <Checkbox
              checked={addService}
              onChange={(e) => {
                setAddService(e.target.checked);
                // On a short phone the picker opens below the fold of the sheet.
                if (e.target.checked) {
                  window.setTimeout(
                    () => document.getElementById(ids.service)?.scrollIntoView({ block: 'nearest' }),
                    0,
                  );
                }
              }}
              label="Add to Services provided"
              hint="Records the service in this dealer's history, which the dealer can read. Your note is not copied there."
              align="start"
            />
            {addService ? (
              <div className="grid gap-2 border-l-2 border-border pl-3">
                <div>
                  <Label htmlFor={ids.service}>Service</Label>
                  {servicesQ.isLoading ? (
                    <div className="flex h-9 items-center gap-2 text-sm text-text-muted">
                      <Spinner size={14} /> Loading services…
                    </div>
                  ) : (
                    <Select
                      id={ids.service}
                      value={serviceId}
                      onChange={(e) => setServiceId(e.target.value)}
                      invalid={!!shown.service}
                    >
                      <option value="">Pick a service</option>
                      {(servicesQ.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      <option value={OTHER_SERVICE_ID}>Other (specify)</option>
                    </Select>
                  )}
                  <FieldError message={shown.service} />
                </div>
                {serviceId === OTHER_SERVICE_ID ? (
                  <div>
                    <Label htmlFor={ids.serviceName}>Service name</Label>
                    <Input
                      id={ids.serviceName}
                      value={serviceName}
                      onChange={(e) => setServiceName(e.target.value)}
                      placeholder="Describe the service"
                      maxLength={160}
                      invalid={!!shown.serviceName}
                    />
                    <FieldError message={shown.serviceName} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <p className="text-xs text-text-muted">
            {waiting
              ? 'Your reply goes to the dealer first; closing itself sends nothing more. Only your team sees the note.'
              : 'Closing sends nothing to the dealer and does not change the AI’s quiet. Only your team sees the note.'}
          </p>
        </form>
      ) : null}
    </Dialog>
  );
}
