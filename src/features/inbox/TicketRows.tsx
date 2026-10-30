import { Badge, Button, useToast } from '@/components/ui';
import { closedLine, ownerLine, rowAge, waitingLine } from '@/features/inbox/desk';
import { useReopenTicket } from '@/hooks/api/useTickets';
import { cn } from '@/lib/cn';
import {
  TICKET_DESK_STATE_LABEL,
  TICKET_DESK_STATE_TONE,
  dealerCodeLabel,
  ticketDeskState,
  ticketRef,
} from '@dk/shared';
import type { TicketTone, TicketView } from '@dk/shared';

/**
 * A coloured edge on each row, so the list can be read by its left side: red is
 * late, amber is new or waiting, blue is somebody on it. Shape and words carry
 * the same fact (the chip), so nothing depends on telling the colours apart.
 */
const EDGE: Record<TicketTone, string> = {
  danger: 'border-l-danger',
  warning: 'border-l-warning',
  info: 'border-l-info',
  success: 'border-l-success',
  neutral: 'border-l-border-strong',
};

/**
 * The inbox's Tickets tab: one row per ticket.
 *
 * Each row says, in the order an admin reads it: whose it is (the dealer's
 * code), where it stands (the desk-state chip — the same word the server's
 * "needs us" count and the Today list use), what it is about, who has it and
 * until when, and how long ago it came. Tapping a row opens its thread.
 *
 * The caller hands the rows over already sorted and filtered; this only draws
 * them. `now` is the page's one-minute tick, so "Late" and the ages advance on
 * their own.
 */
export function TicketRows({
  tickets,
  now,
  selectedConversationId,
  selectedTicketId = null,
  onOpen,
}: {
  tickets: readonly TicketView[];
  now: number;
  /** The thread open beside the list, whose row is tinted. */
  selectedConversationId: string | null;
  /**
   * The ticket a link or a closed row named. A thread can hold many closed
   * tickets, so when one is named only its row is tinted and not all of them.
   */
  selectedTicketId?: string | null;
  onOpen: (t: TicketView) => void;
}) {
  const nowDate = new Date(now);
  const reopen = useReopenTicket();
  const toast = useToast();

  async function putBack(t: TicketView) {
    try {
      await reopen.mutateAsync(t.id);
      toast.success(`Ticket ${ticketRef(t.number)} is open again.`);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  return (
    <>
      {tickets.map((t) => {
        const state = ticketDeskState(t, nowDate);
        const tone = TICKET_DESK_STATE_TONE[state];
        const closed = state === 'closed';
        const owner = closed ? closedLine(t) : ownerLine(t, nowDate);
        const waiting = waitingLine(t, nowDate);
        const selected =
          selectedConversationId === t.conversationId &&
          (!closed || !selectedTicketId || selectedTicketId === t.id);
        return (
          // A closed row is the button AND its note, so the tint and the one
          // rule under it belong to the item, not to the button inside it.
          <li
            key={t.id}
            className={cn(closed && 'border-b border-border', closed && selected && 'bg-selected')}
          >
            <button
              type="button"
              onClick={() => onOpen(t)}
              aria-current={selected ? 'true' : undefined}
              // The conversation rows' own look (`ConversationRow`): the same
              // selected tint and hover, and the text starting at the same 16px
              // even with the edge's 3px beside it. Not `hover:bg-surface-2/60`:
              // Tailwind makes no CSS for an opacity on a colour held in a
              // variable, so that hover never drew.
              className={cn(
                'focus-inset flex min-h-11 w-full flex-col border-l-[3px] py-3 pl-[13px] pr-4 text-left transition-colors duration-150',
                !closed && 'border-b border-b-border',
                EDGE[tone],
                // On a closed row the tint is the item's (above), so the note
                // beneath it is tinted too.
                selected ? !closed && 'bg-selected' : 'hover:bg-surface-2',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="shrink-0 rounded bg-surface-2 px-1.5 py-px font-mono text-[11px] font-medium leading-4 text-text-muted">
                    {dealerCodeLabel(t.dealerCode)}
                  </span>
                  <Badge intent={tone}>{TICKET_DESK_STATE_LABEL[state]}</Badge>
                  {t.urgent && t.state === 'OPEN' ? <Badge intent="danger">Urgent</Badge> : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-text-muted">{rowAge(t, nowDate)}</span>
              </span>
              <span className="mt-1 line-clamp-2 min-w-0 text-sm text-text [overflow-wrap:anywhere]">
                <span className="font-semibold tabular-nums">{ticketRef(t.number)}</span>
                <span className="text-text-muted"> · </span>
                {t.summary}
              </span>
              {owner || waiting ? (
                <span className="mt-0.5 min-w-0 text-xs text-text-muted [overflow-wrap:anywhere]">
                  {[owner, waiting].filter(Boolean).join(' · ')}
                </span>
              ) : null}
            </button>
            {/* A CLOSED ROW CARRIES ITS OWN NOTE AND ITS WAY BACK. The thread's strip
                only holds tickets closed in the last seven days, so for an older one
                this row is the only place the note can be read and the ticket put
                back. Outside the row's button: a button cannot hold another. */}
            {closed ? (
              <div className="flex items-start justify-between gap-3 px-4 pb-3 [overflow-wrap:anywhere]">
                <p className="min-w-0 whitespace-pre-wrap text-sm text-text-muted">
                  {t.resolutionNote?.trim() || 'No note.'}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  loading={reopen.isPending && reopen.variables === t.id}
                  onClick={() => void putBack(t)}
                >
                  Reopen
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </>
  );
}
