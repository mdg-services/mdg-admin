import { CheckCircle2, MessageSquareWarning, MessagesSquare, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

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
import { ResolveGrievanceDialog } from '@/features/grievances/ResolveGrievanceDialog';
import { ContactLinks } from '@/features/intake/ContactLinks';
import { useGrievancesQuery, useReopenGrievance } from '@/hooks/api/useGrievances';
import { useBusyIds } from '@/hooks/useBusyIds';
import { cutShortNote } from '@/lib/intake';
import { GRIEVANCE_CATEGORY_LABELS, GRIEVANCE_SOURCE_LABELS } from '@dk/shared';
import type { Grievance, GrievanceView } from '@dk/shared';

import {
  conversationHref,
  languageNote,
  madeWithAssistant,
  replySubject,
  resolvedLine,
  sentAgo,
  sentAt,
} from './format';

function viewFromParam(v: string | null): GrievanceView {
  return v === 'all' ? 'all' : 'open';
}

/**
 * Everything people have sent from the grievance page on mdgservices.in, and
 * everything the site's assistant has taken down from a visitor who was
 * complaining about us.
 *
 * The website emails the person an acknowledgement with their number the moment
 * they send it; the assistant shows the number on screen instead, and its
 * visitor may leave no email at all. Either way the grievance is handed to us.
 * After that it is ours: it sits here, and raises an alert on every
 * super-admin's phone, until somebody resolves it with a note.
 *
 * Resolving sends nothing. The outcome is told to the person by a human, by
 * phone or email, and this page cannot know which — the dialog says so, and
 * that is also why the number and email on every row are links. A row from the
 * assistant also links to the conversation it came out of, because the visitor's
 * own words before and after are often the context the note needs.
 *
 * The view lives in the URL (`?view=all`), so Back and a shared link land on the
 * same one.
 */
export function GrievancesPage() {
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const view = viewFromParam(search.get('view'));
  const q = useGrievancesQuery(view);
  const reopen = useReopenGrievance();
  const busy = useBusyIds();
  const [resolving, setResolving] = React.useState<Grievance | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  // Ages are relative ("3h 5m ago"); keep them honest on a page left open all morning.
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const open = q.data?.counts.open;
  const items = q.data?.items ?? [];
  // The server sends at most the newest 500 and counts them all: when the tab's
  // number is bigger than the rows below it, say so rather than let the list
  // look complete.
  const cutShort = q.data
    ? cutShortNote(items.length, view === 'open' ? q.data.counts.open : q.data.counts.all)
    : null;
  // No list at all, as opposed to an empty one. The two must not look alike:
  // "Nothing is waiting" under a failed request is the one thing this page
  // cannot say wrongly. Hence `isPending` and not `isLoading` for the skeleton:
  // a request held back because the phone is offline or the app is in the
  // background is neither loading nor failed, and without a list it would fall
  // through to the empty state.
  const failed = q.isError && !q.data;
  // An empty Open tab means two different things: all done, or nothing ever sent.
  const everythingResolved = view === 'open' && (q.data?.counts.all ?? 0) > 0;

  function setView(next: GrievanceView) {
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

  function onReopen(g: Grievance) {
    void busy.run(g.id, async () => {
      try {
        await reopen.mutateAsync(g.id);
        toast.success(`Grievance ${g.ref} is open again.`);
      } catch (e) {
        toast.error((e as Error).message || 'That did not go through.');
      }
    });
  }

  /** The row's button. Resolve is the one this page exists for. */
  const action = (g: Grievance) =>
    g.state === 'OPEN' ? (
      <Button size="sm" variant="primary" onClick={() => setResolving(g)}>
        Resolve
      </Button>
    ) : (
      <Button size="sm" variant="secondary" loading={busy.isBusy(g.id)} onClick={() => onReopen(g)}>
        Reopen
      </Button>
    );

  return (
    <div>
      <PageHeader
        title="Grievances"
        subtitle="Sent from the website or taken down by the assistant. Each one stays open until someone resolves it."
        tools={
          <RefreshTool
            label="Refresh the grievances"
            loading={q.isRefetching}
            onRefresh={() => void q.refetch()}
          />
        }
      />

      <SegmentedControl<GrievanceView>
        aria-label="Which grievances"
        value={view}
        onChange={setView}
        className="mb-3"
        options={[
          { value: 'open', label: open === undefined ? 'Open' : `Open (${open})` },
          { value: 'all', label: 'Everything' },
        ]}
      />

      {cutShort ? <p className="mb-3 text-xs text-text-subtle">{cutShort}</p> : null}

      <DataList<Grievance>
        rows={items}
        rowKey={(g) => g.id}
        loading={q.isPending}
        cardVariant="rows"
        empty={
          failed ? (
            <EmptyState
              icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
              title="Could not load the grievances"
              description="This does not mean there are none. Check the connection and try again."
              cta={
                <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={
                everythingResolved ? (
                  <CheckCircle2 width={24} height={24} strokeWidth={1.75} />
                ) : (
                  <MessageSquareWarning width={24} height={24} strokeWidth={1.75} />
                )
              }
              title={everythingResolved ? 'Nothing is waiting' : 'No grievances yet'}
              description={
                everythingResolved
                  ? 'Every grievance has been resolved. A new one reaches your phone as an alert.'
                  : 'Grievances from the website and the assistant appear here.'
              }
            />
          )
        }
        // The table is two columns and a button: the person's words need the
        // room, and the number, the email and the badges all ride with them.
        // Below the width it needs, it scrolls inside its own box rather than
        // squeezing the words into a sliver.
        minWidth="46rem"
        columns={[
          {
            id: 'grievance',
            header: 'Grievance',
            mobile: 'primary',
            cell: (g) => (
              // `overflow-wrap: anywhere`, not `break-words`: only the former
              // lets a table cell shrink, and one long word in a stranger's
              // message would otherwise widen the whole table and push every
              // button off the right edge.
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-semibold tabular-nums text-text">{g.ref}</span>
                  <Badge intent={g.state === 'OPEN' ? 'warning' : 'success'}>
                    {g.state === 'OPEN' ? 'Open' : 'Resolved'}
                  </Badge>
                  {/* An unknown category (a newer website) is shown as sent. */}
                  <Badge>{GRIEVANCE_CATEGORY_LABELS[g.category] ?? g.category}</Badge>
                  {/* Where it was made. An unknown source (a newer server) is
                      shown as sent, and a row with none prints no badge. */}
                  {g.source ? (
                    <Badge intent={madeWithAssistant(g) ? 'info' : 'neutral'}>
                      {GRIEVANCE_SOURCE_LABELS[g.source] ?? g.source}
                    </Badge>
                  ) : null}
                  {languageNote(g) ? <Badge>{languageNote(g)}</Badge> : null}
                </div>
                {/* The table has its own Sent column; a phone card has no room
                    for one, so the same two facts ride under the badges. */}
                <p className="mt-1 text-xs text-text-subtle md:hidden">
                  {sentAgo(g, now)} · {sentAt(g, now)}
                </p>
                <p className="mt-1 select-text font-medium text-text">{g.name}</p>
                <div className="mt-0.5">
                  <ContactLinks mobile={g.mobile} email={g.email} mailSubject={replySubject(g)} />
                </div>
                {g.outlet ? (
                  <p className="mt-0.5 select-text text-xs text-text-subtle">Outlet: {g.outlet}</p>
                ) : null}
                {/* Their words as they wrote them: line breaks kept, and a very
                    long word wraps instead of pushing the row wider. */}
                <p className="mt-2 select-text whitespace-pre-wrap text-sm text-text">
                  {g.message}
                </p>
                <ConversationLink grievance={g} />
                {g.state === 'RESOLVED' ? (
                  <div className="mt-2 rounded-md border border-border bg-surface-2 p-2">
                    <p className="text-xs text-text-subtle">{resolvedLine(g, now)}</p>
                    {g.resolutionNote ? (
                      <p className="mt-0.5 select-text whitespace-pre-wrap text-sm text-text">
                        {g.resolutionNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ),
          },
          {
            id: 'sent',
            header: 'Sent',
            mobile: 'hidden',
            width: '10rem',
            cell: (g) => (
              <span className="flex flex-col items-start gap-1">
                <Badge intent={g.state === 'OPEN' ? 'warning' : 'neutral'}>{sentAgo(g, now)}</Badge>
                <span className="text-xs text-text-subtle">{sentAt(g, now)}</span>
              </span>
            ),
          },
        ]}
        // Two placements for one button. At desktop width it is the table's
        // last column. On a phone that slot is the card's top right corner,
        // and a button parked there narrows every line of a long message to
        // make room for itself — so there it goes under the message instead,
        // which is also where a thumb is once it has been read.
        rowActions={(g) => <span className="hidden md:block">{action(g)}</span>}
        cardActions={(g) => (
          <ActionRow below="wrap" align="start">
            {action(g)}
          </ActionRow>
        )}
      />

      <ResolveGrievanceDialog grievance={resolving} onClose={() => setResolving(null)} />
    </div>
  );
}

/**
 * "Read the conversation" — only on a grievance the assistant took down, and
 * only as a link to the console, which opens the transcript and the recording.
 * The same 44px-on-a-phone target as the phone and email links beside it.
 */
function ConversationLink({ grievance }: { grievance: Grievance }) {
  const href = conversationHref(grievance);
  if (!href) return null;
  return (
    <Link
      to={href}
      className="mt-1 inline-flex min-h-11 max-w-full items-center gap-1 rounded-sm text-sm text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
    >
      <MessagesSquare width={13} height={13} strokeWidth={1.75} aria-hidden className="shrink-0" />
      Read the conversation
    </Link>
  );
}
