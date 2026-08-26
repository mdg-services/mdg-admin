import { AlertCircle, MessageSquare, Phone } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  MobileCardList,
  Pagination,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  useToast,
} from '@/components/ui';
import { useAssistSessionsQuery, useUpdateAssistFollowup } from '@/hooks/api/useAssist';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { ASSIST_FOLLOWUP_STATUSES } from '@dk/shared';
import type { AssistFollowupStatus, AssistSessionSummary } from '@dk/shared';
import type { AssistSessionListQuery } from '@dk/shared/schemas';

import {
  channelLabel,
  costSplitTitle,
  flagChipText,
  flagReasonText,
  followupLabel,
  formatPaise,
  langLabel,
} from './assistFormat';
import { sessionLength } from './assistParams';

/**
 * One page of conversations, in both shapes.
 *
 * The nine-column table is real work on a laptop and impossible on a phone, so
 * it lives inside `hidden md:block` and a card stack carries the same rows
 * below md. On the Leads tab the card carries its own buttons — a `tel:` link
 * and the follow-up control — so it is deliberately NOT a single tap target: a
 * button inside a button is not a thing.
 */
export function SessionListTab({
  tab,
  params,
  onOpen,
  onPage,
}: {
  tab: 'conversations' | 'leads' | 'flagged';
  params: AssistSessionListQuery;
  onOpen: (id: string) => void;
  onPage: (page: number) => void;
}) {
  const listQ = useAssistSessionsQuery(params);
  const items = listQ.data?.items ?? [];

  if (listQ.isLoading) {
    return (
      <Card>
        <CardContent className="grid gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (listQ.isError) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title="Could not load the conversations"
            description={
              listQ.error instanceof ApiError ? listQ.error.message : 'Please try again.'
            }
            cta={
              <Button variant="secondary" size="sm" onClick={() => void listQ.refetch()}>
                Retry
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<MessageSquare width={28} height={28} strokeWidth={1.75} />}
            title={
              tab === 'leads'
                ? 'Nobody has left a number yet'
                : tab === 'flagged'
                  ? 'Nothing has been flagged'
                  : 'No conversations here'
            }
            description="Try widening the date range or clearing a filter."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Desktop table (≥ md) */}
        <div className="hidden md:block">
          <SessionTable tab={tab} items={items} onOpen={onOpen} />
        </div>

        {/* Mobile card-stack (< md). On the Leads tab the card carries its own
            buttons — a tel: link and the follow-up control — so it is NOT a
            single tap target; a button inside a button is not a thing. */}
        <MobileCardList
          className="p-3"
          cards={items.map((s) => ({
            key: s.id,
            onClick: tab === 'leads' ? undefined : () => onOpen(s.id),
            primary: (
              // `break-words` beside the clamp: `line-clamp-2` is
              // `overflow: hidden`, so a pasted URL in the opening line was cut
              // mid-token with no ellipsis and no way to recover it.
              <span className="line-clamp-2 break-words font-medium text-text">
                {s.opening || 'Said nothing'}
              </span>
            ),
            primaryRight: (
              <Badge intent={s.channel === 'call' ? 'info' : 'neutral'}>
                {channelLabel(s.channel)}
              </Badge>
            ),
            secondary: (
              <>
                <LeadCell session={s} showMobile={false} emptyAs="words" />
                <span className="mt-1 block text-xs text-text-subtle">
                  {formatDateTime(s.startedAt)} · {sessionLength(s)} · {s.turnCount}{' '}
                  {s.turnCount === 1 ? 'turn' : 'turns'} · {langLabel(s.lang)} ·{' '}
                  {formatPaise(s.estPaise)}
                </span>
              </>
            ),
            meta:
              tab === 'flagged' ? (
                <FlagReasons session={s} />
              ) : (
                <div className="flex flex-wrap items-start gap-1.5">
                  <FlagChips session={s} />
                  <Badge intent={s.followupStatus === 'new' ? 'warning' : 'neutral'}>
                    {followupLabel(s.followupStatus)}
                  </Badge>
                </div>
              ),
            actions:
              tab === 'leads' ? (
                <div className="grid gap-2">
                  <FollowupSelect session={s} />
                  <div className="flex items-center gap-2">
                    {s.lead.mobile ? (
                      <a
                        href={`tel:+91${s.lead.mobile}`}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium tabular-nums text-brand"
                      >
                        <Phone width={14} height={14} strokeWidth={1.75} aria-hidden />
                        {s.lead.mobile}
                      </a>
                    ) : null}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => onOpen(s.id)}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              ) : undefined,
          }))}
        />

        <div className="border-t border-border">
          <Pagination
            page={listQ.data?.page ?? params.page}
            pageSize={listQ.data?.pageSize ?? params.pageSize}
            total={listQ.data?.total ?? items.length}
            onPageChange={onPage}
          />
        </div>
        {listQ.isFetching ? (
          <p className="px-3 pb-2 text-xs text-text-subtle">Refreshing...</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * How wide each column is, per tab.
 *
 * The table is `table-fixed`, so these ARE the widths — not a hint the browser
 * weighs against the content. Auto layout is what broke this table: it hands
 * width to whoever has the longest unbreakable content, which meant a chip
 * column and a timestamp elbowed "Opened with" — the one column anybody
 * actually reads — down to a few characters, while `truncate` on a cell with no
 * settled width did nothing at all.
 *
 * "Opened with" is the only column left unset: in fixed layout it takes
 * everything the others do not, so it grows with the window. `minW` is the
 * width at which the wrapper starts scrolling sideways instead, chosen so the
 * opening line always keeps about 14rem. These are safely past a phone's reach
 * because the whole table is inside `hidden md:block` — the card stack above is
 * the phone's shape, not a narrowed version of this one.
 */
const SESSION_COLUMNS = {
  conversations: { who: '9.5rem', flags: '10rem', followup: '8.5rem', minW: 'min-w-[74rem]' },
  leads: { who: '12rem', flags: '10rem', followup: '10.5rem', minW: 'min-w-[78rem]' },
  // The Flagged tab prints the reasons in full — that is the entire job of the
  // tab — so its flag column is paid for out of the table's overall width.
  flagged: { who: '9.5rem', flags: '17rem', followup: '8.5rem', minW: 'min-w-[80rem]' },
} as const;

/** One page of conversations, as the desktop table. */
function SessionTable({
  tab,
  items,
  onOpen,
}: {
  tab: 'conversations' | 'leads' | 'flagged';
  items: AssistSessionSummary[];
  onOpen: (id: string) => void;
}) {
  const cols = SESSION_COLUMNS[tab];
  return (
    <Table className={cn('table-fixed', cols.minW)}>
      <colgroup>
        <col style={{ width: '6.5rem' }} />
        <col style={{ width: '11rem' }} />
        <col style={{ width: '5rem' }} />
        <col style={{ width: '4.25rem' }} />
        {/* Opened with — deliberately unset; it takes what is left. */}
        <col />
        <col style={{ width: cols.who }} />
        <col style={{ width: cols.flags }} />
        <col style={{ width: cols.followup }} />
        <col style={{ width: '6rem' }} />
      </colgroup>
      <THead>
        <TRow>
          <TH>How</TH>
          <TH>When</TH>
          <TH className="text-right">Length</TH>
          <TH className="text-right">Turns</TH>
          <TH>Opened with</TH>
          <TH>{tab === 'leads' ? 'Who, and their number' : 'Who'}</TH>
          <TH>{tab === 'flagged' ? 'Why it was flagged' : 'Flags'}</TH>
          <TH>Follow-up</TH>
          <TH className="text-right">Cost</TH>
        </TRow>
      </THead>
      <TBody>
        {items.map((s) => (
          <TRow key={s.id} clickable onClick={() => onOpen(s.id)}>
            {/* Channel and language share one column. Nine columns of real data
                do not fit a laptop, and of the two the language is the one a
                reader glances at rather than scans down — so it rides under the
                badge instead of buying 5rem of its own. */}
            <TD>
              <Badge
                className="whitespace-nowrap"
                intent={s.channel === 'call' ? 'info' : 'neutral'}
              >
                {channelLabel(s.channel)}
              </Badge>
              <span className="mt-0.5 block truncate text-xs text-text-subtle">
                {langLabel(s.lang)}
              </span>
            </TD>
            <TD className="truncate text-text-muted">{formatDateTime(s.startedAt)}</TD>
            <TD className="truncate text-right tabular-nums">{sessionLength(s)}</TD>
            <TD className="text-right tabular-nums">{s.turnCount}</TD>
            <TD>
              <span className="block truncate text-text-muted" title={s.opening}>
                {s.opening || '—'}
              </span>
            </TD>
            <TD>
              <LeadCell session={s} showMobile={tab === 'leads'} emptyAs="dash" />
            </TD>
            <TD>
              {tab === 'flagged' ? <FlagReasons session={s} /> : <FlagChips session={s} />}
            </TD>
            <TD onClick={(e) => e.stopPropagation()}>
              {tab === 'leads' ? (
                <FollowupSelect session={s} />
              ) : (
                <Badge
                  className="max-w-full truncate whitespace-nowrap"
                  intent={s.followupStatus === 'new' ? 'warning' : 'neutral'}
                >
                  {followupLabel(s.followupStatus)}
                </Badge>
              )}
            </TD>
            {/* Money right, tabular, one line — a column of rupees is only a
                column if the decimal points line up. The total is all that
                fits; the vendor split is on the tooltip and in the drawer. */}
            <TD
              className="truncate text-right tabular-nums text-text-muted"
              title={costSplitTitle(s)}
            >
              {formatPaise(s.estPaise)}
            </TD>
          </TRow>
        ))}
      </TBody>
    </Table>
  );
}

/**
 * Name and place, plus the number only where ringing it is the job.
 *
 * `showMobile` and `emptyAs` are passed explicitly at every call site rather
 * than derived inside, so adding a sixth place that renders a lead is a
 * decision somebody has to make on purpose.
 */
function LeadCell({
  session,
  showMobile,
  emptyAs,
}: {
  session: AssistSessionSummary;
  showMobile: boolean;
  /** What "they told us nothing" looks like where there is no room for words. */
  emptyAs: 'dash' | 'words';
}) {
  const { name, place, mobile, mobileConfirmed } = session.lead;
  if (!name && !place && !mobile) {
    if (emptyAs === 'words') {
      return <span className="text-sm text-text-subtle">Did not say</span>;
    }
    // In a table column sized for names, those three words broke across three
    // lines and made every empty row taller than the rows that DID say
    // something. A placeholder is not data and must not set the row height —
    // so it is a dash, with the words kept for the tooltip and the screen
    // reader, which is where a placeholder belongs.
    return (
      <span className="text-sm text-text-subtle" title="Did not say">
        <span aria-hidden>—</span>
        <span className="sr-only">Did not say</span>
      </span>
    );
  }
  return (
    <span className="block min-w-0 text-sm">
      {/* `truncate` at md — the table column is a settled width and a wrapped
          name would set the row height. Below md the same node sits in a card
          with room to wrap, and a clipped name there is just a lost name. */}
      <span className="block break-words text-text md:truncate">
        {[name, place].filter(Boolean).join(' · ') || '—'}
      </span>
      {showMobile && mobile ? (
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <a
            href={`tel:+91${mobile}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex min-h-11 items-center gap-1 rounded-sm tabular-nums text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
          >
            <Phone width={13} height={13} strokeWidth={1.75} aria-hidden />
            {mobile}
          </a>
          {!mobileConfirmed ? <Badge intent="warning">Not confirmed</Badge> : null}
        </span>
      ) : null}
    </span>
  );
}

/** Chips shown on a row before the rest are folded into "+N more". */
const VISIBLE_FLAG_CHIPS = 2;

/**
 * The flags on a row, stacked one per line.
 *
 * Two separate things made the old version overlap itself, and both are worth
 * naming so they do not come back:
 *
 *  - the chip carried a whole SENTENCE ("Turned up and left again without
 *    asking anything, more than once"), and `<Badge>` is a pill of fixed height
 *    (`h-[22px]`). Text that wraps to three lines inside a box that cannot grow
 *    spills straight out of it — which is why the yellow ran over the rows above
 *    and below. The fix is the label, not a taller box: a chip gets two words
 *    (`flagChipText`) and the sentence goes on the tooltip.
 *  - they were laid out with `flex-wrap`, so a second chip sat BESIDE the first
 *    in a column too narrow for it, and the two overflows painted across each
 *    other. Stacked in a grid, each chip has its own line and its own gap.
 *
 * Capped at two, because a visit with five flags must not set the height of the
 * whole table. The rest are counted, and listed in full in the drawer — which
 * the "+N more" line now says out loud below md, because a `title` naming them
 * fires on no touch device and left the count looking like a dead tappable.
 */
function FlagChips({ session }: { session: AssistSessionSummary }) {
  const chips: Array<{
    key: string;
    label: string;
    title: string;
    intent: 'danger' | 'warning';
  }> = [];
  if (session.blocked) {
    chips.push({
      key: 'blocked',
      label: 'Blocked',
      title: 'This visitor is blocked — see the Blocked tab',
      intent: 'danger',
    });
  }
  for (const f of session.flags) {
    chips.push({
      key: `${f.kind}-${f.at}`,
      label: flagChipText(f),
      title: flagReasonText(f),
      intent: 'warning',
    });
  }

  if (chips.length === 0) {
    return <span className="text-sm text-text-subtle">—</span>;
  }

  const shown = chips.slice(0, VISIBLE_FLAG_CHIPS);
  const rest = chips.slice(VISIBLE_FLAG_CHIPS);
  return (
    <span className="grid justify-items-start gap-1 py-1">
      {shown.map((c) => (
        <Badge
          key={c.key}
          intent={c.intent}
          title={c.title}
          className="max-w-full truncate whitespace-nowrap"
        >
          {c.label}
        </Badge>
      ))}
      {rest.length > 0 ? (
        <span
          className="text-xs text-text-subtle"
          title={rest.map((c) => c.title).join(' · ')}
        >
          +{rest.length} more
          <span className="md:hidden"> — open to see</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * The Flagged tab spells the reasons out; an enum name is not a reason.
 *
 * Spans rather than a `<ul>`: below `md` this same node is rendered inside a
 * `MobileCardList` card, which is a `<button>`, and a list inside a button is
 * not valid markup.
 */
function FlagReasons({ session }: { session: AssistSessionSummary }) {
  if (session.flags.length === 0) {
    return <span className="text-sm text-text-subtle">—</span>;
  }
  return (
    <span className="grid gap-1">
      {session.flags.map((f) => (
        <span
          key={`${f.kind}-${f.at}`}
          className="block break-words text-xs leading-snug text-text-muted"
        >
          {flagReasonText(f)}
        </span>
      ))}
    </span>
  );
}

/** Follow-up, changed straight from the row — the Leads tab is a work list. */
function FollowupSelect({ session }: { session: AssistSessionSummary }) {
  const toast = useToast();
  const save = useUpdateAssistFollowup();
  return (
    <Select
      // No minimum width: the select sits in a table column of a settled width
      // now, and a 10rem floor inside a narrower cell overhangs its neighbour.
      aria-label="Follow-up"
      value={session.followupStatus}
      disabled={save.isPending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value as AssistFollowupStatus;
        save.mutate(
          { id: session.id, input: { followupStatus: next } },
          {
            // No name and no number in the toast — it is read over shoulders.
            onSuccess: () => toast.success(`Follow-up set to "${followupLabel(next)}"`),
            onError: (err) =>
              toast.error(
                err instanceof ApiError ? err.message : 'Could not save the follow-up',
              ),
          },
        );
      }}
    >
      {ASSIST_FOLLOWUP_STATUSES.map((s) => (
        <option key={s} value={s}>
          {followupLabel(s)}
        </option>
      ))}
    </Select>
  );
}
