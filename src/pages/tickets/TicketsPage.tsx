import { CheckCircle2, Ticket, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  ActionRow,
  Badge,
  Button,
  DataList,
  EmptyState,
  RefreshTool,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import { ResolveTicketDialog } from '@/features/tickets/ResolveTicketDialog';
import {
  useMarkTicketSeen,
  useReopenTicket,
  useSetTicketUrgent,
  useTicketCountsQuery,
  useTicketListQuery,
} from '@/hooks/api/useTickets';
import { useBusyIds } from '@/hooks/useBusyIds';
import {
  TICKET_TOPIC_LABEL,
  TICKET_TRIGGER_LABEL,
  dealerCodeLabel,
  ticketAgeLabel,
  ticketAgeTone,
  ticketRef,
  ticketTriggerTone,
} from '@dk/shared';
import type { TicketState, TicketView } from '@dk/shared';

import {
  askedByLabel,
  openSummary,
  resolvedLine,
  statusLine,
  ticketThreadHref,
  urgentActionLabel,
} from './format';

type TicketTab = 'open' | 'resolved';

const STATE_OF_TAB: Record<TicketTab, TicketState> = {
  open: 'OPEN',
  resolved: 'RESOLVED',
};

function tabFromParam(v: string | null): TicketTab {
  return v === 'resolved' ? 'resolved' : 'open';
}

const EMPTY: Record<TicketTab, { title: string; description: string }> = {
  open: {
    title: 'No open tickets',
    description:
      'When the AI cannot settle a dealer’s question it raises one here. It stays until someone resolves it with a note.',
  },
  resolved: {
    title: 'Nothing resolved yet',
    description: 'Tickets you resolve are kept here, with the note that closed them.',
  },
};

/**
 * Every question the AI could not settle, across every outlet — one row per
 * ticket, each held open until a person resolves it with a note.
 *
 * The server decides what is open and when. Replying in the chat, a later AI
 * answer, the dealer writing again and hiding the alert all leave a ticket
 * exactly where it was, so this page has one job beyond showing the list:
 * letting an admin open the thread, look, and close the ticket with what they
 * did. Nothing here resolves a ticket without the note.
 *
 * The tab lives in the URL (`?view=resolved`), so Back and a shared link land
 * on the same one.
 */
export function TicketsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const tab = tabFromParam(search.get('view'));
  const q = useTicketListQuery(STATE_OF_TAB[tab]);
  const countsQ = useTicketCountsQuery();
  const markSeen = useMarkTicketSeen();
  const setUrgent = useSetTicketUrgent();
  const reopen = useReopenTicket();
  const busy = useBusyIds();
  const [resolving, setResolving] = React.useState<TicketView | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  // Ages are relative ("3 h"); keep them honest on a page left open all morning.
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const counts = countsQ.data;
  // A refetch of pages already loaded can shift a row across a page edge, and
  // a duplicated id would be a duplicated React key.
  const items = React.useMemo(() => {
    const seen = new Map<string, TicketView>();
    for (const page of q.data?.pages ?? []) {
      for (const t of page.items) seen.set(t.id, t);
    }
    return [...seen.values()];
  }, [q.data]);
  // No list at all, as opposed to an empty one. The two must not look alike:
  // "No open tickets" under a failed request is the one thing this page cannot
  // say wrongly.
  const failed = q.isError && !q.data;
  const summary = tab === 'open' ? openSummary(counts) : null;
  const nowDate = new Date(now);

  function setTab(next: TicketTab) {
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === 'open') params.delete('view');
        else params.set('view', next);
        return params;
      },
      { replace: true },
    );
  }

  function refresh() {
    void q.refetch();
    void countsQ.refetch();
  }

  function onOpenThread(t: TicketView) {
    // Opening the thread is what "looked at" means. The thread's own strip
    // stamps it too, and the server keeps only the first, so this is not a
    // second claim — it is the one that still lands if the thread fails to load.
    if (t.state === 'OPEN' && !t.seenAt) markSeen.mutate(t.id);
    navigate(ticketThreadHref(t));
  }

  function onToggleUrgent(t: TicketView) {
    void busy.run(t.id, async () => {
      try {
        await setUrgent.mutateAsync({ id: t.id, urgent: !t.urgent });
        toast.success(t.urgent ? 'No longer urgent.' : 'Marked urgent.');
      } catch (e) {
        toast.error((e as Error).message || 'That did not go through.');
      }
    });
  }

  function onReopen(t: TicketView) {
    void busy.run(t.id, async () => {
      try {
        await reopen.mutateAsync(t.id);
        toast.success(`Ticket ${ticketRef(t.number)} is open again.`);
      } catch (e) {
        toast.error((e as Error).message || 'That did not go through.');
      }
    });
  }

  /** The row's buttons. Resolve first: it is the one this page exists for. */
  const actions = (t: TicketView) => (
    <>
      {t.state === 'OPEN' ? (
        <Button size="sm" variant="primary" onClick={() => setResolving(t)}>
          Resolve
        </Button>
      ) : null}
      <Button size="sm" variant="secondary" onClick={() => onOpenThread(t)}>
        Open thread
      </Button>
      {t.state === 'OPEN' ? (
        <Button
          size="sm"
          variant="secondary"
          loading={busy.isBusy(t.id)}
          onClick={() => onToggleUrgent(t)}
        >
          {urgentActionLabel(t)}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          loading={busy.isBusy(t.id)}
          onClick={() => onReopen(t)}
        >
          Reopen
        </Button>
      )}
    </>
  );

  const empty = EMPTY[tab];

  return (
    <div>
      <PageHeader
        title="Tickets"
        subtitle="Dealer questions the AI could not settle. A ticket stays open until someone resolves it with a note. Replying in the chat does not close it."
        tools={
          <RefreshTool
            label="Refresh the tickets"
            loading={q.isRefetching || countsQ.isRefetching}
            onRefresh={refresh}
          />
        }
      />

      <SegmentedControl<TicketTab>
        aria-label="Which tickets"
        value={tab}
        onChange={setTab}
        className="mb-3"
        options={[
          { value: 'open', label: counts ? `Open (${counts.open})` : 'Open' },
          { value: 'resolved', label: 'Resolved' },
        ]}
      />

      {summary ? <p className="mb-3 text-sm text-text-muted">{summary}</p> : null}

      <DataList<TicketView>
        rows={items}
        rowKey={(t) => t.id}
        loading={q.isLoading}
        cardVariant="rows"
        empty={
          failed ? (
            <EmptyState
              icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
              title="Could not load the tickets"
              description="This does not mean there are none. Check the connection and try again."
              cta={
                <Button size="sm" variant="secondary" onClick={refresh}>
                  Try again
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={
                tab === 'open' ? (
                  <CheckCircle2 width={24} height={24} strokeWidth={1.75} />
                ) : (
                  <Ticket width={24} height={24} strokeWidth={1.75} />
                )
              }
              title={empty.title}
              description={empty.description}
            />
          )
        }
        // The table is three columns, not six: the dealer's words need the room,
        // and the status line, the chips and the age are all short enough to
        // ride with them. Below the width it needs, it scrolls inside its own
        // box rather than squeezing the words into a sliver.
        minWidth="46rem"
        columns={[
          {
            id: 'ticket',
            header: 'Ticket',
            mobile: 'primary',
            cell: (t) => (
              // `overflow-wrap: anywhere`, not `break-words`: only the former
              // lets a table cell shrink, and one long word in a dealer's
              // message would otherwise widen the whole table and push every
              // button off the right edge.
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-semibold tabular-nums text-text">{ticketRef(t.number)}</span>
                  <span className="font-mono text-text-muted">{dealerCodeLabel(t.dealerCode)}</span>
                  <span className="text-text-muted">{askedByLabel(t)}</span>
                  {t.urgent ? <Badge intent="danger">Urgent</Badge> : null}
                </div>
                <p className="mt-1 font-medium text-text">{t.summary}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-text-muted" title={t.question}>
                  {t.question}
                </p>
                {t.state === 'RESOLVED' ? (
                  <div className="mt-2 rounded-md border border-border bg-surface-2 p-2">
                    <p className="text-xs text-text-subtle">{resolvedLine(t)}</p>
                    {t.resolutionNote ? (
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-text">
                        {t.resolutionNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {statusLine(t) ? (
                  <p className="mt-1 text-xs text-text-subtle">{statusLine(t)}</p>
                ) : null}
              </div>
            ),
          },
          {
            id: 'about',
            header: 'About',
            mobile: 'secondary',
            width: '14rem',
            cell: (t) => (
              <span className="inline-flex flex-wrap items-center gap-1">
                <Badge>{TICKET_TOPIC_LABEL[t.topic]}</Badge>
                <Badge intent={ticketTriggerTone(t.trigger)}>{TICKET_TRIGGER_LABEL[t.trigger]}</Badge>
                {/* How long it has been waiting; once resolved, how long it took. */}
                <Badge intent={ticketAgeTone(t, nowDate)}>
                  {t.state === 'RESOLVED' && t.resolvedAt
                    ? `Took ${ticketAgeLabel(t.raisedAt, new Date(t.resolvedAt))}`
                    : `Open ${ticketAgeLabel(t.raisedAt, nowDate)}`}
                </Badge>
              </span>
            ),
          },
          {
            // The phone gets these under the card instead (`cardActions`): in
            // the table they are the last column of a row far wider than a
            // phone, and the card's top-right corner is no place for three
            // buttons beside a dealer's words.
            id: 'actions',
            header: 'Actions',
            mobile: 'hidden',
            align: 'right',
            width: '8.5rem',
            cell: (t) => (
              <div className="flex flex-col items-stretch gap-1.5">{actions(t)}</div>
            ),
          },
        ]}
        cardActions={(t) => (
          <ActionRow below="wrap" align="start">
            {actions(t)}
          </ActionRow>
        )}
      />

      {q.hasNextPage ? (
        <div className="mt-3 flex justify-center">
          <Button
            variant="secondary"
            loading={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            Show more
          </Button>
        </div>
      ) : null}

      <ResolveTicketDialog ticket={resolving} onClose={() => setResolving(null)} />
    </div>
  );
}
