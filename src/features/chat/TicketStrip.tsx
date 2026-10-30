import { ChevronDown, Ticket } from 'lucide-react';
import * as React from 'react';

import { Badge, Button, useToast } from '@/components/ui';
import { TicketOnItLine, TicketOnItMenu } from '@/features/chat/TicketOnIt';
import { waitingLine } from '@/features/inbox/desk';
import { CloseTicketDialog } from '@/features/tickets/CloseTicketDialog';
import {
  useMarkTicketSeen,
  useReopenTicket,
  useThreadTicketsQuery,
} from '@/hooks/api/useTickets';
import { useBusyIds } from '@/hooks/useBusyIds';
import { cn } from '@/lib/cn';
import { onItLine, resolvedLine, statusLine } from '@/pages/tickets/format';
import {
  TICKET_DESK_STATE_LABEL,
  TICKET_DESK_STATE_TONE,
  TICKET_TOPIC_LABEL,
  TICKET_TRIGGER_LABEL,
  ticketAgeLabel,
  ticketAgeTone,
  ticketDeskState,
  ticketRef,
  ticketTriggerTone,
} from '@dk/shared';

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
 * The open tickets on THIS thread, pinned at the top of the messages.
 *
 * ONE SLIM LINE PER OPEN TICKET — its number, what it is about, how long it has
 * waited and the one button that closes it — with the rest (where it stands, the
 * topic, why it was raised, the dealer's own words, who has seen it) a tap away.
 * It used to sit whole above the composer in a stack with the AI log and the
 * Reply helper, and at a laptop's height that stack left the messages no room at
 * all. It is still deliberately not a bubble in the conversation: a reply typed
 * in the box does NOT close it, and a band that stays put above the messages
 * says so.
 *
 * "On it until ▾" sits beside Close: the person who has the ticket tells the
 * dealer when an update is coming, and the AI stays off that matter until then.
 * The line that says so, with "Let AI handle it", is drawn under the ticket's
 * own line, whether or not it is opened — it is the ticket's state. It is a
 * promise, not a lock: anyone can still close the ticket, and it ends by
 * itself when the time passes. When the dealer has written since the last
 * reply, that line says so first ("Dealer waiting 25 min"): it is the thing
 * Close will ask about.
 *
 * Closed tickets live in the side panel's Details tab (`TicketHistory`). A
 * thread with no open ticket gets no band at all, not an empty one.
 *
 * LOOKING AT A THREAD IS WHAT STAMPS "SEEN". The dealer's bar then says "MDG
 * team is looking at it", so the stamp is only worth anything if somebody really
 * looked. `stampSeen` is how the page withholds it from a thread it opened on
 * its own (the first row, auto-selected on a desktop), and a hidden tab never
 * stamps either.
 *
 * The page keys this on the conversation, so an opened line and the list of
 * tickets already stamped both start empty on every thread.
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
  /** The ticket a link pointed at (`&ticket=<id>`): opened and highlighted. */
  focusTicketId: string | null;
  /** False when the thread was opened by the page rather than by the admin. */
  stampSeen: boolean;
}) {
  const ticketsQ = useThreadTicketsQuery(conversationId);
  const markSeen = useMarkTicketSeen();
  const visible = useDocumentVisible();
  // The id, not the ticket: the sheet reads the live row, so "the dealer wrote
  // since your last reply" appears if they write while it is open.
  const [closingId, setClosingId] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(focusTicketId);
  const stamped = React.useRef<Set<string>>(new Set());

  const tickets = React.useMemo(() => ticketsQ.data ?? [], [ticketsQ.data]);
  const open = tickets.filter((t) => t.state === 'OPEN');
  const closing = open.find((t) => t.id === closingId) ?? null;

  // A second link followed while the thread is already open still lands.
  React.useEffect(() => {
    if (focusTicketId) setExpanded(focusTicketId);
  }, [focusTicketId]);

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

  // Bring the ticket a link named into view; the band scrolls inside its own capped box.
  React.useEffect(() => {
    if (!focusTicketId) return;
    document.getElementById(`ticket-${focusTicketId}`)?.scrollIntoView({ block: 'nearest' });
  }, [focusTicketId, tickets.length]);

  // A thread whose tickets could not be read must not look like a thread with
  // none. This is the one place an admin learns a dealer is waiting on a person.
  if (ticketsQ.isError && !ticketsQ.data) {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
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

  if (open.length === 0) return <CloseTicketDialog ticket={closing} now={now} onClose={() => setClosingId(null)} />;

  const nowDate = new Date(now);

  return (
    // The page caps the whole pinned band (the AI-quiet line, these, the guard
    // banner) together, so this block does not scroll on its own.
    <div className="border-b border-border">
      {open.map((t) => {
        const isOpen = expanded === t.id;
        const detailId = `ticket-detail-${t.id}`;
        // The summary and the dealer's words are often the same sentence; say it once.
        const question = t.question.trim();
        const showQuestion = question !== '' && question !== t.summary.trim();
        const state = ticketDeskState(t, nowDate);
        const dealerWaiting = waitingLine(t, nowDate);
        return (
          <section
            key={t.id}
            id={`ticket-${t.id}`}
            aria-label={`Open ticket ${ticketRef(t.number)}`}
            className={cn(
              'min-w-0 border-b border-border last:border-b-0 [overflow-wrap:anywhere]',
              // `*-soft` is a fixed light shade; on the dark theme it put light
              // text on a pale band, so dark mode takes a deep tint of the hue.
              t.urgent ? 'bg-danger-soft/70 dark:bg-danger/15' : 'bg-warning-soft/60 dark:bg-warning/15',
              t.id === focusTicketId && 'ring-2 ring-inset ring-brand',
            )}
          >
            {/* `py-1` below md: the 44px buttons sat flush on the header's
                border and on the chips under them. */}
            <div className="flex min-h-11 items-center gap-2 py-1 pl-2 pr-3 md:py-0">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : t.id)}
                aria-expanded={isOpen}
                aria-controls={detailId}
                className={cn(
                  'focus-inset flex min-h-11 min-w-0 flex-1 gap-2 rounded-md px-2 text-left',
                  isOpen ? 'items-start py-2.5' : 'items-center',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    t.urgent ? 'bg-danger text-white' : 'bg-warning text-white',
                  )}
                  aria-hidden
                >
                  <Ticket width={13} height={13} strokeWidth={2.25} />
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-text">
                  {ticketRef(t.number)}
                </span>
                {/* One line while folded; opened, the whole of it, since it is
                    the one sentence that says what the dealer is waiting for. */}
                <span
                  className={cn('min-w-0 flex-1 text-sm text-text', isOpen ? 'whitespace-normal' : 'truncate')}
                  title={t.summary}
                >
                  {t.summary}
                </span>
                <span
                  className={cn(
                    'hidden shrink-0 text-xs font-medium tabular-nums sm:inline',
                    t.urgent ? 'text-danger-strong dark:text-red-300' : 'text-warning-strong dark:text-amber-300',
                  )}
                >
                  {ticketAgeLabel(t.raisedAt, nowDate)}
                </span>
                <ChevronDown
                  width={16}
                  height={16}
                  strokeWidth={1.75}
                  aria-hidden
                  className={cn(
                    'shrink-0 text-text-muted transition-transform duration-200',
                    isOpen && 'rotate-180',
                  )}
                />
              </button>
              <Button size="sm" variant="secondary" onClick={() => setClosingId(t.id)} className="shrink-0">
                Close
              </Button>
            </div>
            {isOpen ? (
              <div id={detailId} className="grid gap-1.5 px-4 pb-2 pl-12 md:-mt-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge intent={TICKET_DESK_STATE_TONE[state]}>{TICKET_DESK_STATE_LABEL[state]}</Badge>
                  <Badge>{TICKET_TOPIC_LABEL[t.topic]}</Badge>
                  <Badge intent={ticketTriggerTone(t.trigger)}>{TICKET_TRIGGER_LABEL[t.trigger]}</Badge>
                  {t.urgent ? <Badge intent="danger">Urgent</Badge> : null}
                  <Badge intent={ticketAgeTone(t, nowDate)}>{`Open ${ticketAgeLabel(t.raisedAt, nowDate)}`}</Badge>
                </div>
                {showQuestion ? (
                  <p className="text-sm text-text-muted">
                    <span className="text-text-subtle">They asked: </span>
                    {question}
                  </p>
                ) : null}
                {onItLine(t, nowDate) ? (
                  <p className="text-xs text-text-muted">{statusLine(t)}</p>
                ) : null}
              </div>
            ) : null}
            {/* The ticket's state and "On it ▾" on a line of their own, under
                the summary: "On it until… · Asha" while someone has it (the menu
                holds "Let AI handle it"), otherwise who has seen it, and above
                either "Dealer waiting 25 min" while they are. Beside the
                summary they left it three letters ("Owne…") on a 432px chat. */}
            {/* `pt-1.5` below md: two 44px buttons stacked edge to edge read as one target. */}
            <div className="flex items-center gap-3 pb-2 pl-12 pr-3 pt-1.5 md:pt-0">
              <div className="min-w-0 flex-1">
                {dealerWaiting ? (
                  <p className="truncate text-[13px] font-medium leading-5 text-warning-strong dark:text-amber-300">
                    {dealerWaiting}
                  </p>
                ) : null}
                {onItLine(t, nowDate) ? (
                  <TicketOnItLine ticket={t} now={now} showButton={false} />
                ) : (
                  <p className="truncate text-xs text-text-muted">{statusLine(t)}</p>
                )}
              </div>
              <TicketOnItMenu ticket={t} now={now} compact />
            </div>
          </section>
        );
      })}
      <CloseTicketDialog ticket={closing} now={now} onClose={() => setClosingId(null)} />
    </div>
  );
}

/**
 * The thread's closed tickets, newest first, with the note that closed each and a
 * Reopen for the one closed by mistake — Close sends the dealer nothing, so it is
 * a quiet button to press and this is its way back. A section of the side
 * panel's Details tab. Nothing at all when there are none.
 *
 * A link that names one of these (`&ticket=<id>`) is highlighted here; the page
 * brings the Details tab forward for it, and `active` (the tab is on screen)
 * is what lets the scroll land — a hidden pane has nothing to scroll.
 */
export function TicketHistory({
  conversationId,
  focusTicketId,
  active,
  renderSection,
}: {
  conversationId: string;
  focusTicketId: string | null;
  active: boolean;
  /** Wraps the list in the panel's section chrome (title + count). */
  renderSection: (count: number, list: React.ReactNode) => React.ReactNode;
}) {
  const ticketsQ = useThreadTicketsQuery(conversationId);
  const toast = useToast();
  const reopen = useReopenTicket();
  const busy = useBusyIds();
  const resolved = React.useMemo(
    () => (ticketsQ.data ?? []).filter((t) => t.state === 'RESOLVED'),
    [ticketsQ.data],
  );
  const focused = resolved.some((t) => t.id === focusTicketId);

  React.useEffect(() => {
    if (!focused || !active) return;
    document.getElementById(`ticket-${focusTicketId}`)?.scrollIntoView({ block: 'nearest' });
  }, [focused, focusTicketId, active]);

  function onReopen(t: { id: string; number: number }) {
    void busy.run(t.id, async () => {
      try {
        await reopen.mutateAsync(t.id);
        toast.success(`Ticket ${ticketRef(t.number)} is open again.`);
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
      }
    });
  }

  if (resolved.length === 0) return null;
  return renderSection(
    resolved.length,
    <ul className="grid gap-2">
      {resolved.map((t) => (
        <li
          key={t.id}
          id={`ticket-${t.id}`}
          className={cn(
            'min-w-0 rounded-md border border-border px-3 py-2.5 [overflow-wrap:anywhere]',
            t.id === focusTicketId ? 'bg-brand-soft' : 'bg-surface',
          )}
        >
          <p className="text-sm text-text">
            <span className="font-semibold tabular-nums">{ticketRef(t.number)}</span>
            <span className="text-text-subtle"> · </span>
            {t.summary}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">{resolvedLine(t)}</p>
          {t.resolutionNote ? (
            <p className="mt-1.5 whitespace-pre-wrap border-t border-border pt-1.5 text-sm text-text-muted">
              {t.resolutionNote}
            </p>
          ) : null}
          <div className="mt-1.5 flex justify-end">
            <Button size="sm" variant="secondary" loading={busy.isBusy(t.id)} onClick={() => onReopen(t)}>
              Reopen
            </Button>
          </div>
        </li>
      ))}
    </ul>,
  );
}
