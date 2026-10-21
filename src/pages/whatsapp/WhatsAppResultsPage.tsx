import { AlertCircle, ChartColumn } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Meter, StatTile, StatTileGrid } from '@/components/charts';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  DataList,
  EmptyState,
  RefreshTool,
  Select,
  Skeleton,
} from '@/components/ui';
import { linkLabel, phoneLabel } from '@/features/whatsapp/format';
import { useWhatsAppResultsQuery } from '@/hooks/api/useWhatsAppResults';
import { ApiError } from '@/lib/api';
import {
  WHATSAPP_RESULTS_ALL,
  type WhatsAppResultCounts,
  type WhatsAppResultPerson,
  type WhatsAppResultSend,
} from '@dk/shared';

import {
  OUTCOME_WORDS,
  linkLine,
  minutesLabel,
  ofLine,
  openedLine,
  plural,
  sendOption,
  sendTitle,
  sentWhen,
} from './resultsFormat';

/**
 * Message results — what happened to the promotions we sent on WhatsApp.
 *
 * Built to answer, in order, the questions an owner asks after a send: did it
 * arrive, did they open it, did they tap the link (and come back to it), did
 * they answer or say stop. Then one line per person, which opens their chat.
 *
 * The send lives in the URL (`?send=`), so a link to one send's results can be
 * passed on. With none, the server opens the newest.
 */
export function WhatsAppResultsPage() {
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const q = useWhatsAppResultsQuery(search.get('send') ?? undefined);
  const data = q.data;

  function pick(send: string) {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('send', send);
        return next;
      },
      { replace: true },
    );
  }

  const sendById = React.useMemo(
    () => new Map((data?.sends ?? []).map((s) => [s.id, s])),
    [data?.sends],
  );
  const isAll = data?.selected === WHATSAPP_RESULTS_ALL;
  const send = data && !isAll ? sendById.get(data.selected) : undefined;

  return (
    <div>
      <PageHeader
        title="Message results"
        subtitle="What happened to the promotions we sent on WhatsApp: who got them, opened them, tapped the link, answered or said stop."
        tools={
          <RefreshTool
            label="Refresh the results"
            loading={q.isRefetching}
            onRefresh={() => void q.refetch()}
          />
        }
      />

      {q.isPending ? (
        <PageSkeleton />
      ) : q.isError && !data ? (
        <Card>
          <CardContent padding="none">
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load the results"
              description={
                q.error instanceof ApiError
                  ? q.error.message
                  : 'This does not mean there are none. Try again.'
              }
              cta={
                <Button variant="secondary" size="sm" onClick={() => void q.refetch()}>
                  Try again
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : !data || data.sends.length === 0 ? (
        <Card>
          <CardContent padding="none">
            <EmptyState
              icon={<ChartColumn width={28} height={28} strokeWidth={1.75} />}
              title="No promotions sent yet"
              description="Once a promotion goes out — from the inbox or a campaign — this page shows who got it, opened it and tapped its link."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:gap-4">
          <Card>
            <CardContent className="grid gap-1">
              <label htmlFor="results-send" className="text-xs font-medium text-text-muted">
                Message
              </label>
              <Select
                id="results-send"
                value={data.selected}
                onChange={(e) => pick(e.target.value)}
              >
                {data.sends.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sendOption(s)}
                  </option>
                ))}
                <option value={WHATSAPP_RESULTS_ALL}>
                  All messages together · {plural(data.total.sent, 'message', 'messages')} to{' '}
                  {plural(data.total.people, 'person', 'people')}
                </option>
              </Select>
              <SendLine send={send} counts={data.counts} />
            </CardContent>
          </Card>

          <FunnelCard counts={data.counts} isAll={isAll} />

          <StatTileGrid columnsAtMd={4}>
            <StatTile
              label="Tapped the link 2+ times"
              value={data.counts.withLink > 0 ? data.counts.tappedLinkTwice : '—'}
              caption={
                data.counts.withLink > 0
                  ? `${plural(data.counts.linkTaps, 'tap', 'taps')} in all`
                  : 'No link we can count in this message'
              }
            />
            <StatTile
              label="Replied"
              value={data.counts.replied}
              caption="Wrote back, or sent an emoji"
            />
            <StatTile
              label="Said stop"
              value={data.counts.stopped}
              caption={
                data.counts.stopped > 0
                  ? 'They get no more promotions from us'
                  : 'Nobody asked to stop'
              }
            />
            <StatTile
              label="Time to open"
              value={minutesLabel(data.counts.openMinutesMedian)}
              caption="Typical wait from sending to the blue tick"
            />
          </StatTileGrid>

          <Callout intent="info">
            <span className="font-medium">What WhatsApp does not tell us.</span> It reports an open
            only once, the first time — never a second open. People with blue ticks turned off count
            as opened only when they tapped, replied or said stop. And only a link that goes through
            our own address can be counted as a tap — the film invite&apos;s button, or a link added
            in the inbox. A link typed into a message&apos;s words cannot.
          </Callout>

          <Card>
            <CardHeader>
              <CardTitle>Each person</CardTitle>
              <CardSubtitle>Tap a person to open their chat.</CardSubtitle>
            </CardHeader>
            <CardContent padding="none">
              <DataList<WhatsAppResultPerson>
                rows={data.people}
                rowKey={(p) => `${p.sendId}:${p.person}:${p.sentAt}`}
                onRowClick={(p) => navigate(`/whatsapp?chat=${encodeURIComponent(p.person)}`)}
                cardVariant="rows"
                minWidth={data.counts.withLink > 0 ? '54rem' : '44rem'}
                columns={[
                  {
                    id: 'person',
                    header: 'Person',
                    mobile: 'primary',
                    width: '14rem',
                    cell: (p) => (
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-text">
                          {p.name ?? phoneLabel(p.phone)}
                        </p>
                        {p.name ? (
                          <p className="whitespace-nowrap text-xs text-text-subtle">
                            {phoneLabel(p.phone)}
                          </p>
                        ) : null}
                        {isAll ? (
                          <p className="text-xs text-text-subtle">
                            {sendById.get(p.sendId) ? sendTitle(sendById.get(p.sendId)!) : null}
                          </p>
                        ) : null}
                      </div>
                    ),
                  },
                  {
                    id: 'outcome',
                    header: 'What happened',
                    mobile: 'primaryRight',
                    width: '10.5rem',
                    cell: (p) => (
                      <span title={p.failure ?? undefined}>
                        <Badge intent={OUTCOME_WORDS[p.outcome].intent}>
                          {OUTCOME_WORDS[p.outcome].label}
                        </Badge>
                      </span>
                    ),
                  },
                  {
                    id: 'opened',
                    header: 'Opened',
                    width: '11rem',
                    cell: (p) => <span className="text-sm text-text-muted">{openedLine(p)}</span>,
                  },
                  // A message with no link we can count has no Link column at all.
                  ...(data.counts.withLink > 0
                    ? [
                        {
                          id: 'link',
                          header: 'Link',
                          width: '10rem',
                          cell: (p: WhatsAppResultPerson) => (
                            <span
                              className={
                                p.linkTaps > 0
                                  ? 'text-sm font-medium text-text'
                                  : 'text-sm text-text-muted'
                              }
                            >
                              {linkLine(p)}
                            </span>
                          ),
                        },
                      ]
                    : []),
                  {
                    id: 'answer',
                    header: 'Answered',
                    width: '8rem',
                    cell: (p) =>
                      p.replied || p.stopped ? (
                        <span className="flex flex-wrap gap-1">
                          {p.replied ? <Badge intent="success">Replied</Badge> : null}
                          {p.stopped ? <Badge intent="warning">Said stop</Badge> : null}
                        </span>
                      ) : (
                        <span className="text-sm text-text-muted">—</span>
                      ),
                  },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Under the picker: when it went, who to, and what it said in full. */
function SendLine({
  send,
  counts,
}: {
  send: WhatsAppResultSend | undefined;
  counts: WhatsAppResultCounts;
}) {
  if (!send) {
    return (
      <p className="text-xs text-text-subtle">
        Every promotion so far: {plural(counts.sent, 'message', 'messages')} to{' '}
        {plural(counts.people, 'person', 'people')}. A person who got two counts twice.
      </p>
    );
  }
  const words = send.label.startsWith('Words not saved') ? null : send.label;
  return (
    <>
      <p className="text-xs text-text-subtle">
        Sent {sentWhen(send)} to {plural(counts.people, 'person', 'people')}
        {send.campaign ? ` · campaign ${send.campaign}` : ''}
      </p>
      {words ? (
        <p className="mt-1 select-text whitespace-pre-wrap rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text">
          {send.kind === 'Film invite'
            ? 'The Dealer Kavach film, with a button to watch it'
            : words}
        </p>
      ) : (
        <p className="text-xs text-text-subtle">
          This one was sent outside the inbox, so its words were not saved here.
        </p>
      )}
      {send.link ? (
        <p className="mt-1 text-xs text-text-muted [overflow-wrap:anywhere]">
          Its button opened{' '}
          <a
            href={send.link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand hover:underline"
          >
            {linkLabel(send.link)}
          </a>
          . Everyone had their own copy, so each tap is theirs.
        </p>
      ) : null}
    </>
  );
}

/** The four steps, each measured against everyone it was sent to. */
function FunnelCard({ counts: c, isAll }: { counts: WhatsAppResultCounts; isAll: boolean }) {
  const didNotArrive = [
    c.heldBack > 0
      ? `WhatsApp held back ${c.heldBack} — ${c.heldBack === 1 ? 'that person already gets' : 'they already get'} too many promotions. Not charged.`
      : null,
    c.waiting > 0
      ? `${plural(c.waiting, 'is', 'are')} not on the phone yet — usually a phone that is off.`
      : null,
    c.notDelivered > 0
      ? `${c.notDelivered} did not arrive. Hover the person's badge for WhatsApp's reason.`
      : null,
  ].filter(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle>What happened</CardTitle>
        <CardSubtitle>
          Each step out of the{' '}
          {plural(c.sent, isAll ? 'message' : 'person', isAll ? 'messages' : 'people')} it went to.
        </CardSubtitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Meter label="Sent" value={c.sent} limit={c.sent} valueLabel={String(c.sent)} />
        <Meter
          label="Reached the phone"
          value={c.reached}
          limit={c.sent}
          valueLabel={ofLine(c.reached, c.sent)}
          caption={didNotArrive.length > 0 ? didNotArrive.join(' ') : 'Every one arrived.'}
        />
        <Meter
          label="Opened"
          value={c.opened}
          limit={c.sent}
          valueLabel={ofLine(c.opened, c.sent)}
          caption={
            c.opened === 0
              ? 'Nobody has opened it yet, as far as WhatsApp tells us.'
              : `${plural(c.openedByTick, 'showed', 'showed')} blue ticks${
                  c.openedBySign > 0
                    ? ` · ${c.openedBySign} had blue ticks off, but tapped or answered`
                    : ''
                }`
          }
        />
        {c.withLink > 0 ? (
          <Meter
            label="Tapped the link"
            value={c.tappedLink}
            limit={c.sent}
            valueLabel={ofLine(c.tappedLink, c.sent)}
            caption={`${plural(c.tappedLinkTwice, 'person', 'people')} tapped it two times or more · ${plural(c.linkTaps, 'tap', 'taps')} in all`}
          />
        ) : (
          <div className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-text-muted">Tapped the link</span>
              <span className="text-sm font-semibold text-text-muted">—</span>
            </div>
            <p className="text-xs text-text-subtle">This message had no link we can count.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PageSkeleton() {
  return (
    <div className="grid gap-3 md:gap-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-64 w-full" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
