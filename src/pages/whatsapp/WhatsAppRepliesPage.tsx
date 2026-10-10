import { CheckCircle2, MessageCircle, Phone, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Callout,
  DataList,
  EmptyState,
  RefreshTool,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import {
  useMarkRepliesSeen,
  useWhatsAppRepliesQuery,
  type RepliesView,
} from '@/hooks/api/useWhatsAppReplies';
import { useBusyIds } from '@/hooks/useBusyIds';
import type { WhatsAppReplyThread } from '@dk/shared';

import {
  dialHref,
  messageText,
  messageTime,
  phoneLabel,
  profileNote,
  stopNote,
  threadAge,
  threadName,
} from './format';

function viewFromParam(v: string | null): RepliesView {
  return v === 'all' ? 'all' : 'unread';
}

/**
 * What people have written back to the WhatsApp number our promotions go out
 * from.
 *
 * That number runs through Meta's servers, not through a phone: there is no
 * handset where a reply appears. This page is the only place one is ever read,
 * which is why every unread reply also raises an alert that points here.
 *
 * Reading is all it does. An answer has to come from a person's own phone —
 * the page says so, because a reply box that is not there is the first thing
 * anyone will look for.
 */
export function WhatsAppRepliesPage() {
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const view = viewFromParam(search.get('view'));
  const q = useWhatsAppRepliesQuery(view);
  const markSeen = useMarkRepliesSeen();
  const busy = useBusyIds();
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const unread = q.data?.counts.unread;
  const items = q.data?.items ?? [];
  // No list at all, as opposed to an empty one. The two must not look alike:
  // "Nothing to read" under a tick is the one thing this page cannot say wrongly.
  const failed = q.isError && !q.data;

  function setView(next: RepliesView) {
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === 'unread') params.delete('view');
        else params.set('view', next);
        return params;
      },
      { replace: true },
    );
  }

  function onRead(thread: WhatsAppReplyThread) {
    void busy.run(thread.person, async () => {
      try {
        // Only as far as what is on the screen: `lastAt` is the newest message drawn.
        await markSeen.mutateAsync({ person: thread.person, upTo: thread.lastAt });
        toast.success('Marked as read.');
      } catch (e) {
        toast.error((e as Error).message || 'That did not go through.');
      }
    });
  }

  return (
    <div>
      <PageHeader
        title="WhatsApp replies"
        subtitle="What people have written back to the number our messages go out from."
        tools={
          <RefreshTool
            label="Refresh the replies"
            loading={q.isRefetching}
            onRefresh={() => void q.refetch()}
          />
        }
      />

      <Callout intent="info" className="mb-3">
        Replies can be read here but not answered from here. To answer, call or message the person
        from your own phone, then mark their message as read.
      </Callout>

      <SegmentedControl<RepliesView>
        aria-label="Which replies"
        value={view}
        onChange={setView}
        className="mb-3"
        options={[
          { value: 'unread', label: unread === undefined ? 'To read' : `To read (${unread})` },
          { value: 'all', label: 'Everything' },
        ]}
      />

      <DataList<WhatsAppReplyThread>
        rows={items}
        rowKey={(t) => t.person}
        loading={q.isLoading}
        cardVariant="rows"
        empty={
          failed ? (
            <EmptyState
              icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
              title="Could not load the replies"
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
                view === 'unread' ? (
                  <CheckCircle2 width={24} height={24} strokeWidth={1.75} />
                ) : (
                  <MessageCircle width={24} height={24} strokeWidth={1.75} />
                )
              }
              title={view === 'unread' ? 'Nothing to read' : 'Nobody has written yet'}
              description={
                view === 'unread'
                  ? 'Every reply has been read. A new one reaches your phone as an alert.'
                  : 'Replies to our WhatsApp messages are listed here as they arrive.'
              }
            />
          )
        }
        columns={[
          {
            id: 'when',
            header: 'Last message',
            mobile: 'secondary',
            width: '7rem',
            cell: (t) => (
              <Badge intent={t.unread > 0 ? 'warning' : 'neutral'}>{threadAge(t, now)}</Badge>
            ),
          },
          {
            id: 'who',
            header: 'Who, and what they wrote',
            mobile: 'primary',
            cell: (t) => (
              // `overflow-wrap: anywhere`, not `break-words`: only the former
              // lets a table cell shrink, and one long link in one message
              // would otherwise widen the whole table and push every "Mark as
              // read" button off the right edge.
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <p className="font-medium text-text">
                  {threadName(t)}
                  {t.optedOut ? (
                    <Badge intent="neutral" className="ml-2 align-middle">
                      On the stop list
                    </Badge>
                  ) : null}
                </p>
                {/* The page says "call them from your own phone", so the number
                    has to be something a thumb can dial and a long-press can
                    copy. `select-text` because the app turns selection off
                    everywhere else. */}
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-text-subtle">
                  {t.phone ? (
                    // The same link the assistant's leads use: 44px tall on a
                    // phone so a thumb can hit it, ordinary height on a desktop.
                    <a
                      href={dialHref(t.phone)}
                      className="inline-flex min-h-11 select-text items-center gap-1 rounded-sm text-sm tabular-nums text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
                    >
                      <Phone width={13} height={13} strokeWidth={1.75} aria-hidden />
                      {phoneLabel(t.phone)}
                    </a>
                  ) : (
                    <span>{phoneLabel(null)}</span>
                  )}
                  {profileNote(t) ? <span>{profileNote(t)}</span> : null}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {t.messages.map((m) => {
                    const stop = stopNote(m);
                    return (
                      <li key={m.id} className="min-w-0">
                        <p
                          className={
                            m.seenAt || (m.stop && m.stopRecorded)
                              ? 'select-text text-sm text-text-muted'
                              : 'select-text text-sm font-medium text-text'
                          }
                        >
                          {messageText(m)}
                        </p>
                        <p className="text-xs text-text-subtle">
                          {messageTime(m.at)}
                          {stop ? (
                            <span className={stop.urgent ? 'font-medium text-danger' : undefined}>
                              {' · '}
                              {stop.text}
                            </span>
                          ) : null}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ),
          },
        ]}
        // Two placements for one button. At desktop width it is the table's
        // last column. On a phone that slot is the card's top right corner,
        // and a button parked there narrows every line of a long message to
        // make room for itself — so there it goes under the messages instead,
        // which is also where a thumb is once they have been read.
        rowActions={(t) =>
          t.unread > 0 ? (
            <span className="hidden md:block">
              <Button
                size="sm"
                variant="secondary"
                loading={busy.isBusy(t.person)}
                onClick={() => onRead(t)}
              >
                Mark as read
              </Button>
            </span>
          ) : null
        }
        cardActions={(t) =>
          t.unread > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              loading={busy.isBusy(t.person)}
              onClick={() => onRead(t)}
            >
              Mark as read
            </Button>
          ) : null
        }
      />
    </div>
  );
}
