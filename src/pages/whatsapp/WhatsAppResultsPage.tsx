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
  SegmentedControl,
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
  costLabel,
  filmWatchLine,
  inFilter,
  linkLine,
  minutesLabel,
  missedRows,
  namesLine,
  ofLine,
  openedLine,
  outcomeLabel,
  outletsOf,
  plural,
  sendOption,
  sendTitle,
  sentWhen,
  type PeopleFilter,
} from './resultsFormat';

/**
 * Message results — what happened to the promotions we sent on WhatsApp.
 *
 * Built to answer, in order, the questions an owner asks after a send: did it
 * arrive, did they open it, did they open the film or tap the link, who wants a
 * call — and where every message that did not arrive went, so the numbers add
 * up to what was sent. Then one line per person, which opens their chat, with a
 * filter for the ones to act on.
 *
 * The send lives in the URL (`?send=`), so a link to one send's results can be
 * passed on. With none, the server opens the newest.
 */
export function WhatsAppResultsPage() {
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const q = useWhatsAppResultsQuery(search.get('send') ?? undefined);
  const data = q.data;
  const [filter, setFilter] = React.useState<PeopleFilter>('all');

  function pick(send: string) {
    setFilter('all');
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
  const isFilm = send?.kind === 'Film invite';
  const shown = React.useMemo(
    () => (data?.people ?? []).filter((p) => inFilter(p, filter)),
    [data?.people, filter],
  );

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
              <SendLine send={send} counts={data.counts} people={data.people} />
            </CardContent>
          </Card>

          <FunnelCard counts={data.counts} people={data.people} isAll={isAll} isFilm={isFilm} />

          <StatTileGrid columnsAtMd={4}>
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
            <StatTile
              label="Paid for"
              value={costLabel(data.counts.reached)}
              caption={`${plural(data.counts.reached, 'message', 'messages')} reached a phone, about ₹1 each. The rest are free.`}
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
              <div className="px-3 py-3 md:px-4">
                {/* Two by two on a phone: four counts in a row do not fit 375px. */}
                <SegmentedControl
                  aria-label="Show"
                  className="grid grid-cols-2 md:inline-flex"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: `Everyone ${data.counts.sent}` },
                    { value: 'opened', label: `Opened ${data.counts.opened}` },
                    ...(isFilm || data.counts.askedCall > 0
                      ? [{ value: 'call' as const, label: `Wants a call ${data.counts.askedCall}` }]
                      : []),
                    {
                      value: 'missed',
                      label: `Didn't reach ${data.counts.sent - data.counts.reached}`,
                    },
                  ]}
                />
              </div>
              <DataList<WhatsAppResultPerson>
                rows={shown}
                empty={
                  <p className="px-4 py-6 text-sm text-text-muted">
                    Nobody here{filter === 'call' ? ' has pressed "मुझे कॉल करें" yet' : ''}.
                  </p>
                }
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
                        <Badge intent={OUTCOME_WORDS[p.outcome].intent}>{outcomeLabel(p)}</Badge>
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
                          header: isFilm ? 'Film' : 'Link',
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
                      p.askedCall || p.replied || p.stopped ? (
                        <span className="flex flex-wrap gap-1">
                          {p.askedCall ? <Badge intent="info">Wants a call</Badge> : null}
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
  people,
}: {
  send: WhatsAppResultSend | undefined;
  counts: WhatsAppResultCounts;
  people: readonly WhatsAppResultPerson[];
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
  // A list made from an outlet sheet has several numbers for one outlet.
  const outlets = outletsOf(people);
  return (
    <>
      <p className="text-xs text-text-subtle">
        Sent {sentWhen(send)} to {plural(counts.people, 'person', 'people')}
        {send.campaign ? ` · campaign ${send.campaign}` : ''}
      </p>
      {outlets.outlets < counts.people ? (
        <p className="text-xs text-text-subtle">
          Those numbers belong to {plural(outlets.outlets, 'outlet', 'outlets')}:{' '}
          <span className="font-medium text-text">
            {outlets.reached} of {outlets.outlets}
          </span>{' '}
          got it on at least one number.
        </p>
      ) : null}
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

/**
 * Where every message went, measured against everyone it was sent to: the
 * steps of those that reached a phone, then the ones that did not and why — so
 * the figures add up to what was sent.
 */
function FunnelCard({
  counts: c,
  people,
  isAll,
  isFilm,
}: {
  counts: WhatsAppResultCounts;
  people: readonly WhatsAppResultPerson[];
  isAll: boolean;
  isFilm: boolean;
}) {
  const missed = missedRows(c);
  const callers = people.filter((p) => p.askedCall);

  return (
    <Card>
      <CardHeader>
        <CardTitle>What happened</CardTitle>
        <CardSubtitle>
          Out of the {plural(c.sent, isAll ? 'message' : 'person', isAll ? 'messages' : 'people')}{' '}
          it went to.
        </CardSubtitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Meter
          label="Reached the phone"
          value={c.reached}
          limit={c.sent}
          valueLabel={ofLine(c.reached, c.sent)}
          caption={c.reached === c.sent ? 'Every one arrived.' : undefined}
        />
        <Meter
          label="Opened"
          value={c.opened}
          limit={c.sent}
          valueLabel={ofLine(c.opened, c.sent)}
          caption={
            c.opened === 0
              ? 'Nobody has opened it yet, as far as WhatsApp tells us.'
              : `At least this many: ${c.openedByTick} showed blue ticks${
                  c.openedBySign > 0
                    ? `, ${c.openedBySign} had them off but tapped or answered`
                    : ''
                }. Someone with blue ticks off who does nothing never shows.`
          }
        />
        {c.withLink > 0 ? (
          <Meter
            label={
              isFilm ? 'Opened the film' : isAll ? 'Opened the film or link' : 'Tapped the link'
            }
            value={c.tappedLink}
            limit={c.sent}
            valueLabel={ofLine(c.tappedLink, c.sent)}
            caption={
              isFilm
                ? filmWatchLine(people, c)
                : `${plural(c.tappedLinkTwice, 'person', 'people')} tapped it two times or more · ${plural(c.linkTaps, 'tap', 'taps')} in all`
            }
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
        {isFilm || c.askedCall > 0 ? (
          <Meter
            label="Wants a call"
            value={c.askedCall}
            limit={c.sent}
            valueLabel={ofLine(c.askedCall, c.sent)}
            caption={
              c.askedCall === 0
                ? 'Nobody has pressed "मुझे कॉल करें" yet.'
                : `Pressed "मुझे कॉल करें": ${namesLine(callers)}. Call them.`
            }
          />
        ) : null}
        {missed.length > 0 ? (
          <div className="grid gap-3 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-text">Did not reach them</span>
              <span className="text-sm font-semibold text-text">
                {ofLine(c.sent - c.reached, c.sent)}
              </span>
            </div>
            <ul className="grid gap-2.5">
              {missed.map((r) => (
                <li key={r.label} className="grid gap-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-text-muted">{r.label}</span>
                    <span className="text-sm font-semibold tabular-nums text-text">{r.value}</span>
                  </div>
                  <p className="text-xs text-text-subtle">{r.note}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
