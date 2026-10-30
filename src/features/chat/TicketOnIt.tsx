import { ChevronDown } from 'lucide-react';

import { Button, Menu, MenuItem, useToast } from '@/components/ui';
import { useClearTicketOnIt, useSetTicketOnIt } from '@/hooks/api/useTickets';
import { cn } from '@/lib/cn';
import { onItLine } from '@/pages/tickets/format';
import { onItChoices, promiseTimeText, ticketRef } from '@dk/shared';
import type { TicketView } from '@dk/shared';

/** What a failed request says: the server's own sentence when it sent one. */
function failure(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'That did not go through.';
}

/**
 * "On it until ▾" — the person who has an open ticket tells the dealer when an
 * update is coming.
 *
 * The three choices are TIMES, not lengths ("until 5:12 pm"), because that is
 * what the dealer is shown. The rows are drawn from the page's one-minute tick,
 * but the time SENT is worked out again from the real clock at the tap: a phone
 * woken from sleep can hold a tick hours old, and "Tomorrow 10:00" read off
 * yesterday's date would promise the dealer a day early. The toast says the time
 * that was sent. Choosing again replaces the earlier time.
 *
 * It does not close the ticket and does not touch the chat's own quiet: it
 * keeps the AI off THIS matter only, and the AI still answers a question about
 * something else.
 */
export function TicketOnItMenu({ ticket, now }: { ticket: TicketView; now: number }) {
  const toast = useToast();
  const setOnIt = useSetTicketOnIt();
  const nowDate = new Date(now);

  async function choose(key: ReturnType<typeof onItChoices>[number]['key']) {
    const tappedAt = new Date();
    const until = onItChoices(tappedAt).find((c) => c.key === key)?.until;
    if (!until) return;
    try {
      await setOnIt.mutateAsync({ id: ticket.id, until });
      toast.success(
        `Ticket ${ticketRef(ticket.number)}: the dealer is told you are on it until ${promiseTimeText(until.toISOString(), 'en', tappedAt)}.`,
      );
    } catch (e) {
      toast.error(failure(e));
    }
  }

  return (
    <Menu
      label="On it until"
      title="On it until"
      align="end"
      triggerVariant="secondary"
      triggerSize="sm"
      triggerDisabled={setOnIt.isPending}
      trigger={
        <>
          <span>On it until</span>
          <ChevronDown width={14} height={14} strokeWidth={1.75} aria-hidden />
        </>
      }
    >
      {onItChoices(nowDate).map((c) => (
        <MenuItem key={c.key} onSelect={() => void choose(c.key)}>
          <span className="block font-medium text-text">{c.label}</span>
          <span className="block text-xs text-text-muted">
            {`until ${promiseTimeText(c.until.toISOString(), 'en', nowDate)}`}
          </span>
        </MenuItem>
      ))}
    </Menu>
  );
}

/**
 * The line that says a person is on this ticket — or that the time they gave
 * has gone by.
 *
 * While the time is ahead it is a quiet line with "Let AI handle it", which
 * takes the promise off and puts the AI back on this matter at once — starting
 * with the dealer's message that is waiting, if one is. (The chat's own quiet
 * after a reply is a separate line with its own button.) Once the time
 * has passed the AI is already answering again by itself, so there is nothing to
 * hand back: the line turns to a warning and has no button, and the person is
 * left to say something to the dealer. Nothing at all when nobody is on it.
 */
export function TicketOnItLine({ ticket, now }: { ticket: TicketView; now: number }) {
  const toast = useToast();
  const clear = useClearTicketOnIt();
  const line = onItLine(ticket, new Date(now));
  if (!line) return null;

  async function letAiAnswer() {
    try {
      await clear.mutateAsync(ticket.id);
      toast.success(`Ticket ${ticketRef(ticket.number)}: the AI is answering about it again.`);
    } catch (e) {
      toast.error(failure(e));
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p
        className={cn(
          'min-w-0 text-sm [overflow-wrap:anywhere]',
          // The strong shade below md, as the other small warnings here do: the
          // plain one is too pale for 14px text on a phone in daylight.
          line.active ? 'text-text-muted' : 'font-medium text-warning-strong md:text-warning',
        )}
      >
        {line.text}
      </p>
      {line.active ? (
        <Button
          size="sm"
          variant="ghost"
          loading={clear.isPending}
          onClick={() => void letAiAnswer()}
        >
          Let AI handle it
        </Button>
      ) : null}
    </div>
  );
}
