import { AlertCircle, ChartColumn } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

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
import { AddAsLeadButton } from '@/features/leads/AddAsLeadButton';
import { linkLabel, phoneLabel } from '@/features/whatsapp/format';
import { useWhatsAppResultsQuery } from '@/hooks/api/useWhatsAppResults';
import { ApiError } from '@/lib/api';
import { leadHref, resultLeadAction } from '@/lib/leads';
import {
  WHATSAPP_LINE_INFO,
  WHATSAPP_RESULTS_ALL,
  isWhatsAppLine,
  type WhatsAppLine,
  type WhatsAppResultCounts,
  type WhatsAppResultPerson,
  type WhatsAppResultSend,
} from '@dk/shared';

import {
  OUTCOME_WORDS,
  audienceLine,
  costLabel,
  count,
  filmWatchLine,
  groupLabel,
  inFilter,
  isFilmSend,
  linkLine,
  minutesLabel,
  missedRows,
  namesLine,
  ofLine,
  openedLine,
  outcomeLabel,
  outletsOf,
  partTitle,
  plural,
  sendOption,
  sendTitle,
  sentWhen,
  shortDay,
  type PeopleFilter,
} from './resultsFormat';

/** The two numbers, as the tabs and the line under them name them. */
const LINE_WORDS: Record<WhatsAppLine, { tab: string; all: string; about: string }> = {
  marketing: {
    tab: 'Marketing',
    all: 'All marketing messages together',
    about: 'film invites, by the place each list was for, and messages to new leads',
  },
  clients: {
    tab: 'Dealer Kavach',
    all: 'All Dealer Kavach messages together',
    about: "the app's own messages to dealers, and messages the team wrote to them",
  },
};

/** A group's sends, in the order the server lists them, its total first. */
interface SendGroup {
  key: string;
  label: string;
  sends: WhatsAppResultSend[];
}

function groupsOf(sends: readonly WhatsAppResultSend[]): SendGroup[] {
  const out: SendGroup[] = [];
  for (const s of sends) {
    const key = s.campaign ? `campaign:${s.campaign}` : `group:${s.group}`;
    const last = out[out.length - 1];
    if (last?.key === key) last.sends.push(s);
    else out.push({ key, label: groupLabel(s), sends: [s] });
  }
  return out;
}

/**
 * Message results — what happened to the promotions we sent on WhatsApp.
 *
 * Built to answer, in order, the questions an owner asks after a send: did it
 * arrive, did they open it, did they open the film or tap the link, who wants a
 * call — and where every message that did not arrive went, so the numbers add
 * up to what was sent. Then one line per person, which opens their chat, with a
 * filter for the ones to act on and, on each, the way to make them a lead.
 *
 * Our two numbers are kept apart, as the inbox keeps them: the marketing
 * number's film invites and the Dealer's Kavach number's messages to dealers
 * are different jobs. A campaign is listed under the place its list was for,
 * with each day it went — its first send, then the numbers it missed sent
 * again — so a place can be followed from the first evening to the last retry.
 *
 * The send lives in the URL (`?send=`), so a link to one send's results can be
 * passed on; `?line=` names the number when no one send is. With neither, the
 * server opens the marketing number's newest place.
 */
export function WhatsAppResultsPage() {
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const lineParam = search.get('line');
  const q = useWhatsAppResultsQuery(
    search.get('send') ?? undefined,
    isWhatsAppLine(lineParam) ? lineParam : undefined,
  );
  const data = q.data;
  const [filter, setFilter] = React.useState<PeopleFilter>('all');

  /** Open one send, or (`all`) every send from `line`. */
  function pick(send: string, line?: WhatsAppLine) {
    setFilter('all');
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('send', send);
        // A send knows its own number; only "all" needs telling which.
        if (send === WHATSAPP_RESULTS_ALL && line) next.set('line', line);
        else next.delete('line');
        return next;
      },
      { replace: true },
    );
  }

  /** The other number: the server opens its newest send. */
  function pickLine(line: WhatsAppLine) {
    setFilter('all');
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('send');
        next.set('line', line);
        return next;
      },
      { replace: true },
    );
  }

  const sendById = React.useMemo(
    () => new Map((data?.sends ?? []).map((s) => [s.id, s])),
    [data?.sends],
  );
  const lineSends = React.useMemo(
    () => (data?.sends ?? []).filter((s) => s.line === data?.line),
    [data?.sends, data?.line],
  );
  const groups = React.useMemo(() => groupsOf(lineSends), [lineSends]);
  const isAll = data?.selected === WHATSAPP_RESULTS_ALL;
  const send = data && !isAll ? sendById.get(data.selected) : undefined;
  const isFilm = send ? isFilmSend(send) : false;
  const isMarketing = data?.line !== 'clients';
  // The rows under the picker: every group's headline for "all", a total's own days or messages.
  const parts = isAll
    ? groups.map((g) => g.sends[0]!)
    : send?.part === 'total'
      ? (groups.find((g) => g.sends[0]?.id === send.id)?.sends.slice(1) ?? [])
      : [];
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
            <CardContent className="grid gap-3">
              <div className="grid gap-1">
                <SegmentedControl
                  aria-label="Which number"
                  value={data.line}
                  onChange={pickLine}
                  options={(['marketing', 'clients'] as const).map((l) => ({
                    value: l,
                    label: `${LINE_WORDS[l].tab} ${count(data.totals[l].sent)}`,
                  }))}
                />
                <p className="text-xs text-text-subtle">
                  Sent from {WHATSAPP_LINE_INFO[data.line].phone} ·{' '}
                  {WHATSAPP_LINE_INFO[data.line].name}: {LINE_WORDS[data.line].about}.
                </p>
              </div>
              {lineSends.length === 0 ? (
                <p className="text-sm text-text-muted">Nothing has been sent from this number yet.</p>
              ) : (
                <div className="grid gap-1">
                  <label htmlFor="results-send" className="text-xs font-medium text-text-muted">
                    Message
                  </label>
                  <Select
                    id="results-send"
                    value={data.selected}
                    onChange={(e) => pick(e.target.value, data.line)}
                  >
                    <option value={WHATSAPP_RESULTS_ALL}>
                      {LINE_WORDS[data.line].all} ·{' '}
                      {plural(data.totals[data.line].sent, 'message', 'messages')} to{' '}
                      {plural(data.totals[data.line].people, 'person', 'people')}
                    </option>
                    {groups.map((g) => (
                      <optgroup key={g.key} label={g.label}>
                        {g.sends.map((s) => (
                          <option key={s.id} value={s.id}>
                            {sendOption(s)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                  <SendLine send={send} counts={data.counts} people={data.people} />
                </div>
              )}
            </CardContent>
          </Card>

          {parts.length > 0 ? (
            <PartsCard
              title={
                isAll
                  ? isMarketing
                    ? 'By place'
                    : 'By kind of message'
                  : send?.campaign
                    ? 'Each day it went'
                    : 'Each message'
              }
              subtitle={
                isAll
                  ? isMarketing
                    ? 'Each place counts every number on its list once, at its latest try. Tap one to see its days and people.'
                    : 'Tap one to see who it went to.'
                  : send?.campaign
                    ? 'The first send, then each later day: the numbers it missed sent again, or more of its list.'
                    : 'Tap one to see who it went to.'
              }
              sends={parts}
              byGroup={isAll}
              nameHeader={isAll ? (isMarketing ? 'Place' : 'Kind') : send?.campaign ? 'Day' : 'Message'}
              onPick={(id) => pick(id)}
            />
          ) : null}

          <FunnelCard
            counts={data.counts}
            people={data.people}
            isAll={isAll || (send?.part === 'total' && !send.campaign)}
            isFilm={isFilm}
          />

          <StatTileGrid columnsAtMd={isMarketing ? 4 : 3}>
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
            {/* The ₹1 is a promotion's price; the app's own messages are charged far less, so no figure for them. */}
            {isMarketing ? (
              <StatTile
                label="Paid for"
                value={costLabel(data.counts.reached)}
                caption={`${plural(data.counts.reached, 'message', 'messages')} reached a phone, about ₹1 each. The rest are free.`}
              />
            ) : null}
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
                // The chat is in the inbox of the number the message went from.
                onRowClick={(p) =>
                  navigate(
                    `/whatsapp?line=${sendById.get(p.sendId)?.line ?? data.line}&chat=${encodeURIComponent(p.person)}`,
                  )
                }
                cardVariant="rows"
                // Null when a row has nothing to offer, so its phone card stays one tap target.
                rowActions={(p) =>
                  resultLeadAction(p).kind === 'none' ? null : <LeadAction person={p} />
                }
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
                        {/* Which send, when the open one holds several: a place's day, or the message itself. */}
                        {p.sendId !== data.selected && sendById.get(p.sendId) ? (
                          <p className="text-xs text-text-subtle">
                            {isAll
                              ? sendTitle(sendById.get(p.sendId)!)
                              : partTitle(sendById.get(p.sendId)!)}
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

/**
 * A row's way to the Leads page: the lead's own link when the person is one,
 * "Add as lead" when they have an Indian mobile and have not said stop, nothing
 * otherwise. Adding does not leave the page; the results refresh and the button
 * turns into the link.
 */
function LeadAction({ person }: { person: WhatsAppResultPerson }) {
  const action = resultLeadAction(person);
  if (action.kind === 'link') {
    return (
      <Link
        to={leadHref(action.id)}
        className="inline-flex min-h-11 items-center whitespace-nowrap rounded-sm px-1 text-sm font-medium text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
      >
        Lead {action.ref}
      </Link>
    );
  }
  if (action.kind === 'add')
    return <AddAsLeadButton person={action.person} className="whitespace-nowrap" />;
  return null;
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
        Every message from this number so far: {plural(counts.sent, 'message', 'messages')} to{' '}
        {plural(counts.people, 'person', 'people')}. A person who got two counts twice.
      </p>
    );
  }
  // A list made from an outlet sheet has several numbers for one outlet.
  const outlets = outletsOf(people);
  const resends =
    send.campaign && send.sentAgain > 0
      ? send.part === 'total'
        ? ` · ${plural(send.sentAgain, 're-send', 're-sends')} to numbers it missed, each counted at its latest try`
        : send.part === 'first'
          ? ` · ${count(send.sentAgain)} of them tried twice that day`
          : send.sentAgain < counts.sent
            ? ` · ${count(send.sentAgain)} sent again, ${count(counts.sent - send.sentAgain)} new`
            : ''
      : '';
  return (
    <>
      <p className="text-xs text-text-subtle">
        Sent {sentWhen(send)} to {audienceLine({ ...send, counts })}
        {send.campaign ? ` · campaign ${send.campaign}` : ''}
        {resends}
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
      {isFilmSend(send) || send.hasWords ? (
        <p className="mt-1 select-text whitespace-pre-wrap rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text">
          {isFilmSend(send) ? 'The Dealer Kavach film, with a button to watch it' : send.label}
        </p>
      ) : (
        <p className="text-xs text-text-subtle">
          {send.part === 'total'
            ? 'Every message in this group. Pick one above to read its words.'
            : send.label.startsWith('Words not saved')
              ? 'This one was sent outside the inbox, so its words were not saved here.'
              : `${send.label}: the app sends it by itself, in the words WhatsApp approved for it.`}
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

/** When a group went: "4 Nov", "29 Oct to 3 Nov · 129 re-sends". */
function spanLine(s: WhatsAppResultSend): string {
  const first = shortDay(s.firstSentAt);
  const last = shortDay(s.lastSentAt);
  const span = first === last ? first : `${first} to ${last}`;
  return s.sentAgain > 0 ? `${span} · ${plural(s.sentAgain, 're-send', 're-sends')}` : span;
}

/**
 * The sends inside what is open, one row each: every place (or kind of
 * message) when the whole number is open, a place's days when the place is.
 * A row opens that send.
 */
function PartsCard({
  title,
  subtitle,
  sends,
  byGroup,
  nameHeader,
  onPick,
}: {
  title: string;
  subtitle: string;
  sends: readonly WhatsAppResultSend[];
  /** Rows are whole groups: named by their group, with when they began. */
  byGroup: boolean;
  nameHeader: string;
  onPick: (id: string) => void;
}) {
  const withLink = sends.some((s) => s.counts.withLink > 0);
  const film = sends.some(isFilmSend);
  const withCall = film || sends.some((s) => s.counts.askedCall > 0);
  const share = (n: number, s: WhatsAppResultSend) =>
    s.counts.sent > 0 ? `${count(n)} · ${Math.round((n / s.counts.sent) * 100)}%` : count(n);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardSubtitle>{subtitle}</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent padding="none">
        <DataList<WhatsAppResultSend>
          rows={sends}
          rowKey={(s) => s.id}
          onRowClick={(s) => onPick(s.id)}
          cardVariant="rows"
          minWidth={withLink ? '50rem' : '40rem'}
          columns={[
            {
              id: 'name',
              header: nameHeader,
              mobile: 'primary',
              width: '15rem',
              cell: (s) => (
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-text">
                    {byGroup ? s.group : partTitle(s)}
                  </p>
                  <p className="text-xs text-text-subtle">
                    {byGroup ? spanLine(s) : audienceLine(s)}
                  </p>
                </div>
              ),
            },
            {
              id: 'sent',
              header: byGroup ? 'Sent to' : 'Sent',
              numeric: true,
              width: '6rem',
              cell: (s) => count(s.counts.people),
            },
            {
              id: 'reached',
              header: 'Reached',
              mobile: 'hidden',
              numeric: true,
              width: '7.5rem',
              cell: (s) => share(s.counts.reached, s),
            },
            // A phone row's figure on the right needs its word; the table has the column header.
            {
              id: 'reachedPhone',
              header: 'Reached',
              mobile: 'primaryRight',
              desktop: false,
              cell: (s) => (
                <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-text">
                  {count(s.counts.reached)} reached
                </span>
              ),
            },
            {
              id: 'opened',
              header: 'Opened',
              numeric: true,
              width: '7.5rem',
              cell: (s) => share(s.counts.opened, s),
            },
            ...(withLink
              ? [
                  {
                    id: 'link',
                    header: film ? 'Opened the film' : 'Tapped the link',
                    numeric: true,
                    width: '8rem',
                    cell: (s: WhatsAppResultSend) => count(s.counts.tappedLink),
                  },
                ]
              : []),
            ...(withCall
              ? [
                  {
                    id: 'call',
                    header: 'Wants a call',
                    numeric: true,
                    width: '7rem',
                    cell: (s: WhatsAppResultSend) => count(s.counts.askedCall),
                  },
                ]
              : []),
            {
              id: 'missed',
              header: 'Did not reach',
              numeric: true,
              width: '7.5rem',
              cell: (s) => count(s.counts.sent - s.counts.reached),
            },
          ]}
        />
      </CardContent>
    </Card>
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
        <div>
          <CardTitle>What happened</CardTitle>
          <CardSubtitle>
            {c.sent === c.people
              ? `Out of the ${plural(c.sent, 'person', 'people')} it went to.`
              : `Out of the ${plural(c.sent, 'message', 'messages')} sent to ${plural(c.people, 'person', 'people')}.`}
          </CardSubtitle>
        </div>
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
