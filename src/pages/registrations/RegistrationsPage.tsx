import { CheckCircle2, ClipboardPen, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

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
import { ContactLinks } from '@/features/intake/ContactLinks';
import { MarkContactedDialog } from '@/features/registrations/MarkContactedDialog';
import { useEnrolmentsQuery, useReopenEnrolment } from '@/hooks/api/useEnrolments';
import { useBusyIds } from '@/hooks/useBusyIds';
import { cutShortNote } from '@/lib/intake';
import type { Enrolment, EnrolmentView } from '@dk/shared';

import { contactedLine, sentAgo, sentAt, sourceLabel } from './format';

function viewFromParam(v: string | null): EnrolmentView {
  return v === 'all' ? 'all' : 'new';
}

/**
 * Everyone who has filled in "Register your pump" — on mdgservices.in, or on
 * the sign-up screen inside the Dealer Kavach app, which posts to the same
 * place.
 *
 * Until this page existed the only record of a registration was the email the
 * website sent to our own inbox. The website now hands each one to us as well,
 * so they are listed here and raise an alert until somebody has been in touch.
 * Registrations sent before that change are only in the inbox.
 *
 * Marking one as contacted records the call; it sends nothing. The view lives
 * in the URL (`?view=all`), so Back and a shared link land on the same one.
 */
export function RegistrationsPage() {
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const view = viewFromParam(search.get('view'));
  const q = useEnrolmentsQuery(view);
  const reopen = useReopenEnrolment();
  const busy = useBusyIds();
  const [marking, setMarking] = React.useState<Enrolment | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  // Ages are relative ("3h 5m ago"); keep them honest on a page left open all morning.
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const fresh = q.data?.counts.new;
  const items = q.data?.items ?? [];
  // The server sends at most the newest 500 and counts them all: when the tab's
  // number is bigger than the rows below it, say so rather than let the list
  // look complete.
  const cutShort = q.data
    ? cutShortNote(items.length, view === 'new' ? q.data.counts.new : q.data.counts.all)
    : null;
  // No list at all, as opposed to an empty one. The two must not look alike:
  // "Nothing new" under a failed request is the one thing this page cannot say
  // wrongly. Hence `isPending` and not `isLoading` for the skeleton: a request
  // held back because the phone is offline or the app is in the background is
  // neither loading nor failed, and without a list it would fall through to the
  // empty state.
  const failed = q.isError && !q.data;
  // An empty New tab means two different things: all done, or nothing ever sent.
  const everyoneContacted = view === 'new' && (q.data?.counts.all ?? 0) > 0;

  function setView(next: EnrolmentView) {
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === 'new') params.delete('view');
        else params.set('view', next);
        return params;
      },
      { replace: true },
    );
  }

  function onReopen(e: Enrolment) {
    void busy.run(e.id, async () => {
      try {
        await reopen.mutateAsync(e.id);
        toast.success('Marked as new again.');
      } catch (err) {
        toast.error((err as Error).message || 'That did not go through.');
      }
    });
  }

  /** The row's button. "Mark as contacted" is the one this page exists for. */
  const action = (e: Enrolment) =>
    e.state === 'NEW' ? (
      <Button size="sm" variant="primary" onClick={() => setMarking(e)}>
        Mark as contacted
      </Button>
    ) : (
      <Button size="sm" variant="secondary" loading={busy.isBusy(e.id)} onClick={() => onReopen(e)}>
        Mark as new
      </Button>
    );

  return (
    <div>
      <PageHeader
        title="Registrations"
        subtitle="Registered on the website or in the app. Each stays new until someone has been in touch."
        tools={
          <RefreshTool
            label="Refresh the registrations"
            loading={q.isRefetching}
            onRefresh={() => void q.refetch()}
          />
        }
      />

      <SegmentedControl<EnrolmentView>
        aria-label="Which registrations"
        value={view}
        onChange={setView}
        className="mb-3"
        options={[
          { value: 'new', label: fresh === undefined ? 'New' : `New (${fresh})` },
          { value: 'all', label: 'Everything' },
        ]}
      />

      {cutShort ? <p className="mb-3 text-xs text-text-subtle">{cutShort}</p> : null}

      <DataList<Enrolment>
        rows={items}
        rowKey={(e) => e.id}
        loading={q.isPending}
        cardVariant="rows"
        empty={
          failed ? (
            <EmptyState
              icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
              title="Could not load the registrations"
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
                everyoneContacted ? (
                  <CheckCircle2 width={24} height={24} strokeWidth={1.75} />
                ) : (
                  <ClipboardPen width={24} height={24} strokeWidth={1.75} />
                )
              }
              title={everyoneContacted ? 'Nothing new' : 'No registrations yet'}
              description={
                everyoneContacted
                  ? 'Everyone has been contacted. A new registration reaches your phone as an alert.'
                  : 'Registrations from the website and the app appear here — earlier ones are only in the email inbox.'
              }
            />
          )
        }
        // Two columns and a button, for the reason the Grievances table is:
        // the details need the room, and everything short rides with them.
        minWidth="46rem"
        columns={[
          {
            id: 'registration',
            header: 'Registration',
            mobile: 'primary',
            cell: (e) => (
              // `overflow-wrap: anywhere`, not `break-words`: only the former
              // lets a table cell shrink, and one long pump name or email would
              // otherwise widen the whole table and push every button off the
              // right edge.
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="select-text font-medium text-text">{e.name}</span>
                  <Badge intent={e.state === 'NEW' ? 'warning' : 'success'}>
                    {e.state === 'NEW' ? 'New' : 'Contacted'}
                  </Badge>
                </div>
                {/* The table has its own Sent column; a phone card has no room
                    for one, so the same two facts ride under the name. */}
                <p className="mt-0.5 text-xs text-text-subtle md:hidden">
                  {sentAgo(e, now)} · {sentAt(e, now)}
                </p>
                <p className="mt-0.5 select-text text-sm text-text-muted">
                  {e.pumpName ?? 'Pump name not given'}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-subtle">
                  <span className="select-text">
                    SAP code <span className="font-mono">{e.sapCode}</span>
                  </span>
                  <Badge>{e.siteType}</Badge>
                  <Badge>{sourceLabel(e.source)}</Badge>
                </p>
                <div className="mt-0.5">
                  <ContactLinks mobile={e.mobile} email={e.email} />
                </div>
                {e.state === 'CONTACTED' ? (
                  <div className="mt-2 rounded-md border border-border bg-surface-2 p-2">
                    <p className="text-xs text-text-subtle">{contactedLine(e, now)}</p>
                    {e.note ? (
                      <p className="mt-0.5 select-text whitespace-pre-wrap text-sm text-text">
                        {e.note}
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
            cell: (e) => (
              <span className="flex flex-col items-start gap-1">
                <Badge intent={e.state === 'NEW' ? 'warning' : 'neutral'}>{sentAgo(e, now)}</Badge>
                <span className="text-xs text-text-subtle">{sentAt(e, now)}</span>
              </span>
            ),
          },
        ]}
        // Two placements for one button — see the Grievances page: in the card's
        // top right corner it would narrow every line beside it.
        rowActions={(e) => <span className="hidden md:block">{action(e)}</span>}
        cardActions={(e) => (
          <ActionRow below="wrap" align="start">
            {action(e)}
          </ActionRow>
        )}
      />

      <MarkContactedDialog enrolment={marking} onClose={() => setMarking(null)} />
    </div>
  );
}
