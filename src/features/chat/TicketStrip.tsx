import { ChevronDown, ChevronRight, Ticket } from 'lucide-react';
import * as React from 'react';

import { Badge, Button } from '@/components/ui';
import { TicketOnItLine, TicketOnItMenu } from '@/features/chat/TicketOnIt';
import { ResolveTicketDialog } from '@/features/tickets/ResolveTicketDialog';
import { useMarkTicketSeen, useThreadTicketsQuery } from '@/hooks/api/useTickets';
import { cn } from '@/lib/cn';
import { resolvedLine, statusLine } from '@/pages/tickets/format';
import {
  TICKET_TOPIC_LABEL,
  TICKET_TRIGGER_LABEL,
  ticketAgeLabel,
  ticketAgeTone,
  ticketRef,
  ticketTriggerTone,
} from '@dk/shared';
import type { TicketView } from '@dk/shared';

/** Whether this tab is on screen. A phone that locked with a thread open is not looking. */
function useDocumentVisible(): boolean {
  const [visible, setVisible] = React.useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  React.useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

/**
 * The questions the AI could not settle on THIS thread, above the composer.
 *
 * An open ticket is shown whole — what it is about, what the dealer asked, how
 * long it has waited — with the one button that closes it. It is deliberately
 * not a bubble in the conversation: a reply typed in the box below does NOT
 * close it, and a strip that sits outside the message list and stays put while
 * the admin types is the plainest way to say so.
 *
 * "On it until ▾" sits beside Resolve: the person who has the ticket tells the
 * dealer when an update is coming, and the AI stays off that matter until then.
 * The line that says so, with "Let AI answer", is drawn under the question. It
 * is a promise, not a lock — anyone can still resolve the ticket, and it ends by
 * itself when the time passes.
 *
 * Recently resolved tickets are folded away beneath, with the note that closed
 * them. A thread with no tickets gets no strip at all, not an empty one — most
 * threads are that.
 *
 * LOOKING AT A THREAD IS WHAT STAMPS "SEEN". The dealer's bubble then says "MDG
 * team is looking at it", so the stamp is only worth anything if somebody really
 * looked. `stampSeen` is how the page withholds it from a thread it opened on
 * its own (the first row, auto-selected on a desktop), and a hidden tab never
 * stamps either.
 *
 * The page keys this on the conversation, so a half-written resolution and the
 * list of tickets already stamped both start empty on every thread.
 */
export function TicketStrip({
  conversationId,
  now,
  focusTicketId,
  stampSeen,
}: {
  conversationId: string;
  /** The page's one-minute tick, so the ages here advance with the inbox's. */
  now: number;
  /** The ticket a link pointed at (`&ticket=<id>`): highlighted, and its section opened. */
  focusTicketId: string | null;
  /** False when the thread was opened by the page rather than by the admin. */
  stampSeen: boolean;
}) {
  const ticketsQ = useThreadTicketsQuery(conversationId);
  const markSeen = useMarkTicketSeen();
  const visible = useDocumentVisible();
  const [resolving, setResolving] = React.useState<TicketView | null>(null);
  const [showResolved, setShowResolved] = React.useState(false);
  const stamped = React.useRef<Set<string>>(new Set());

  const tickets = React.useMemo(() => ticketsQ.data ?? [], [ticketsQ.data]);
  const open = tickets.filter((t) => t.state === 'OPEN');
  const resolved = tickets.filter((t) => t.state === 'RESOLVED');
  const focusedIsResolved = resolved.some((t) => t.id === focusTicketId);

  // A link to a ticket that is already closed has to land on it, not on a
  // collapsed "Resolved recently" the admin must know to open.
  React.useEffect(() => {
    if (focusedIsResolved) setShowResolved(true);
  }, [focusedIsResolved]);

  // Stamp every open ticket nobody has looked at yet. Each id is asked for once
  // per visit to the thread; a failed request is forgotten so the next refresh
  // of the list can try again, and a ticket that is already seen is never asked
  // for. `mutateAsync`, not `mutate`: only the LAST `mutate` call's callbacks
  // ever fire, and a thread can hold more than one open ticket.
  const { mutateAsync: stamp } = markSeen;
  React.useEffect(() => {
    if (!stampSeen || !visible) return;
    for (const t of tickets) {
      if (t.state !== 'OPEN' || t.seenAt || stamped.current.has(t.id)) continue;
      stamped.current.add(t.id);
      stamp(t.id).catch(() => {
        stamped.current.delete(t.id);
      });
    }
  }, [tickets, stampSeen, visible, stamp]);

  // Bring the ticket a link named into view; the strip scrolls inside its own capped box.
  React.useEffect(() => {
    if (!focusTicketId) return;
    document.getElementById(`ticket-${focusTicketId}`)?.scrollIntoView({ block: 'nearest' });
  }, [focusTicketId, tickets.length, showResolved]);

  // A thread whose tickets could not be read must not look like a thread with
  // none. This is the one place an admin learns a dealer is waiting on a person.
  if (ticketsQ.isError && !ticketsQ.data) {
    return (
      <div className="flex items-center gap-2 border-t border-border bg-surface px-3 py-2">
        <p className="min-w-0 flex-1 text-sm text-text-muted">
          This thread’s tickets could not be loaded.
        </p>
        <Button
          size="sm"
          variant="secondary"
          loading={ticketsQ.isFetching}
          onClick={() => void ticketsQ.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (tickets.length === 0) return null;

  const nowDate = new Date(now);

  return (
    <div className="border-t border-border bg-surface">
      {open.map((t) => (
        <section
          key={t.id}
          id={`ticket-${t.id}`}
          aria-label={`Open ticket ${ticketRef(t.number)}`}
          className={cn(
            'min-w-0 border-l-4 px-3 py-2.5 [overflow-wrap:anywhere]',
            t.urgent ? 'border-danger' : 'border-warning',
            t.id === focusTicketId && 'bg-brand-soft',
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <Ticket width={14} height={14} strokeWidth={2} className="shrink-0 text-text-muted" aria-hidden />
            <span className="text-sm font-semibold tabular-nums text-text">{ticketRef(t.number)}</span>
            <Badge>{TICKET_TOPIC_LABEL[t.topic]}</Badge>
            <Badge intent={ticketTriggerTone(t.trigger)}>{TICKET_TRIGGER_LABEL[t.trigger]}</Badge>
            {t.urgent ? <Badge intent="danger">Urgent</Badge> : null}
            <Badge intent={ticketAgeTone(t, nowDate)}>{`Open ${ticketAgeLabel(t.raisedAt, nowDate)}`}</Badge>
          </div>
          <p className="mt-1.5 text-sm font-medium text-text">{t.summary}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-text-muted" title={t.question}>
            {t.question}
          </p>
          <TicketOnItLine ticket={t} now={now} />
          {/* Wraps below ~400px: the seen-by text keeps its own line and the two
              buttons drop beneath it, right-aligned, rather than squeezing it. */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="min-w-0 text-xs text-text-subtle">{statusLine(t)}</p>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <TicketOnItMenu ticket={t} now={now} />
              <Button size="sm" variant="primary" onClick={() => setResolving(t)}>
                Resolve
              </Button>
            </div>
          </div>
        </section>
      ))}

      {resolved.length > 0 ? (
        <div className={cn(open.length > 0 && 'border-t border-border')}>
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            aria-expanded={showResolved}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left"
          >
            {showResolved ? (
              <ChevronDown width={16} height={16} strokeWidth={1.75} className="shrink-0 text-text-muted" />
            ) : (
              <ChevronRight width={16} height={16} strokeWidth={1.75} className="shrink-0 text-text-muted" />
            )}
            <span className="text-xs font-medium uppercase tracking-wide text-text-subtle">
              Resolved recently
            </span>
            <span className="text-xs text-text-subtle">{resolved.length}</span>
          </button>
          {showResolved ? (
            <ul className="grid gap-2 px-3 pb-3">
              {resolved.map((t) => (
                <li
                  key={t.id}
                  id={`ticket-${t.id}`}
                  className={cn(
                    'min-w-0 rounded-md border border-border p-2 [overflow-wrap:anywhere]',
                    t.id === focusTicketId ? 'bg-brand-soft' : 'bg-surface-2',
                  )}
                >
                  <p className="text-sm text-text">
                    <span className="font-semibold tabular-nums">{ticketRef(t.number)}</span>
                    <span className="text-text-muted"> · </span>
                    {t.summary}
                  </p>
                  <p className="mt-0.5 text-xs text-text-subtle">{resolvedLine(t)}</p>
                  {t.resolutionNote ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text-muted">{t.resolutionNote}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <ResolveTicketDialog ticket={resolving} onClose={() => setResolving(null)} />
    </div>
  );
}
