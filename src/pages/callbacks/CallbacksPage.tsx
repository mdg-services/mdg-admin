import { CheckCircle2, MessageCircle, PhoneCall, TriangleAlert } from 'lucide-react';
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
import { MarkCalledDialog } from '@/features/callbacks/MarkCalledDialog';
import { ContactLinks } from '@/features/intake/ContactLinks';
import { useCallbacksQuery, useReopenCallback } from '@/hooks/api/useCallbacks';
import { useBusyIds } from '@/hooks/useBusyIds';
import { cutShortNote } from '@/lib/intake';
import type { CallbackRequest, CallbackView } from '@dk/shared';

import { askedAgo, askedAt, calledLine, chatHref, refLine, whereLine } from './format';

function viewFromParam(v: string | null): CallbackView {
  return v === 'all' ? 'all' : 'new';
}

/**
 * Everyone who asked us to call them on the website: the film pages' "we'll
 * call you" above all, and the home page, the Khata Kavach page and the site
 * assistant's fallback. Until this page the only record was the email the
 * website sends to our own inbox; it still sends it.
 *
 * A request from a film link says who that link went to, so the person who
 * got the WhatsApp film and the person asking to be called can be seen as one.
 * Marking one as called records the call; it sends nothing. The view lives in
 * the URL (`?view=all`), so Back and a shared link land on the same one.
 */
export function CallbacksPage() {
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const view = viewFromParam(search.get('view'));
  const q = useCallbacksQuery(view);
  const reopen = useReopenCallback();
  const busy = useBusyIds();
  const [marking, setMarking] = React.useState<CallbackRequest | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  // Ages are relative ("3h 5m ago"); keep them honest on a page left open all morning.
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const fresh = q.data?.counts.new;
  const items = q.data?.items ?? [];
  const cutShort = q.data
    ? cutShortNote(items.length, view === 'new' ? q.data.counts.new : q.data.counts.all)
    : null;
  // No list at all is not an empty one: "Nobody waiting" under a failed request
  // is the one thing this page cannot say wrongly.
  const failed = q.isError && !q.data;
  const everyoneCalled = view === 'new' && (q.data?.counts.all ?? 0) > 0;

  function setView(next: CallbackView) {
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

  function onReopen(c: CallbackRequest) {
    void busy.run(c.id, async () => {
      try {
        await reopen.mutateAsync(c.id);
        toast.success('Marked as new again.');
      } catch (err) {
        toast.error((err as Error).message || 'That did not go through.');
      }
    });
  }

  const action = (c: CallbackRequest) =>
    c.state === 'NEW' ? (
      <Button size="sm" variant="primary" onClick={() => setMarking(c)}>
        Mark as called
      </Button>
    ) : (
      <Button size="sm" variant="secondary" loading={busy.isBusy(c.id)} onClick={() => onReopen(c)}>
        Mark as new
      </Button>
    );

  return (
    <div>
      <PageHeader
        title="Call-backs"
        subtitle="People who asked us to call them on the website. Each stays new until someone has called."
        tools={
          <RefreshTool
            label="Refresh the call-backs"
            loading={q.isRefetching}
            onRefresh={() => void q.refetch()}
          />
        }
      />

      <SegmentedControl<CallbackView>
        aria-label="Which call-backs"
        value={view}
        onChange={setView}
        className="mb-3"
        options={[
          { value: 'new', label: fresh === undefined ? 'New' : `New (${fresh})` },
          { value: 'all', label: 'Everything' },
        ]}
      />

      {cutShort ? <p className="mb-3 text-xs text-text-subtle">{cutShort}</p> : null}

      <DataList<CallbackRequest>
        rows={items}
        rowKey={(c) => c.id}
        loading={q.isPending}
        cardVariant="rows"
        empty={
          failed ? (
            <EmptyState
              icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
              title="Could not load the call-backs"
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
                everyoneCalled ? (
                  <CheckCircle2 width={24} height={24} strokeWidth={1.75} />
                ) : (
                  <PhoneCall width={24} height={24} strokeWidth={1.75} />
                )
              }
              title={everyoneCalled ? 'Nobody waiting' : 'No call-back requests yet'}
              description={
                everyoneCalled
                  ? 'Everyone has been called. A new request reaches your phone as an alert.'
                  : 'Requests from the film pages and the website appear here — earlier ones are only in the email inbox.'
              }
            />
          )
        }
        minWidth="46rem"
        columns={[
          {
            id: 'request',
            header: 'Request',
            mobile: 'primary',
            cell: (c) => {
              const from = refLine(c, now);
              const chat = chatHref(c);
              return (
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="select-text font-medium text-text">{c.name}</span>
                    <Badge intent={c.state === 'NEW' ? 'warning' : 'success'}>
                      {c.state === 'NEW' ? 'New' : 'Called'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-text-subtle md:hidden">
                    {askedAgo(c, now)} · {askedAt(c, now)}
                  </p>
                  <p className="mt-0.5 select-text text-sm text-text-muted">
                    {c.outlet ?? 'Pump name not given'}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-subtle">
                    <Badge>{whereLine(c)}</Badge>
                    {c.lang ? (
                      <Badge>{c.lang === 'hi' ? 'Hindi page' : 'English page'}</Badge>
                    ) : null}
                  </p>
                  {from ? <p className="mt-1 select-text text-xs text-text-muted">{from}</p> : null}
                  {c.message && c.source !== 'film' ? (
                    <p className="mt-0.5 select-text text-xs text-text-subtle">{c.message}</p>
                  ) : null}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3">
                    <ContactLinks mobile={c.mobile} />
                    {chat ? (
                      <Link
                        to={chat}
                        className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
                      >
                        <MessageCircle width={13} height={13} strokeWidth={1.75} aria-hidden />
                        Their WhatsApp chat
                      </Link>
                    ) : null}
                  </div>
                  {c.state === 'CALLED' ? (
                    <div className="mt-2 rounded-md border border-border bg-surface-2 p-2">
                      <p className="text-xs text-text-subtle">{calledLine(c, now)}</p>
                      {c.note ? (
                        <p className="mt-0.5 select-text whitespace-pre-wrap text-sm text-text">
                          {c.note}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            },
          },
          {
            id: 'asked',
            header: 'Asked',
            mobile: 'hidden',
            width: '10rem',
            cell: (c) => (
              <span className="flex flex-col items-start gap-1">
                <Badge intent={c.state === 'NEW' ? 'warning' : 'neutral'}>{askedAgo(c, now)}</Badge>
                <span className="text-xs text-text-subtle">{askedAt(c, now)}</span>
              </span>
            ),
          },
        ]}
        rowActions={(c) => <span className="hidden md:block">{action(c)}</span>}
        cardActions={(c) => (
          <ActionRow below="wrap" align="start">
            {action(c)}
          </ActionRow>
        )}
      />

      <MarkCalledDialog request={marking} onClose={() => setMarking(null)} />
    </div>
  );
}
