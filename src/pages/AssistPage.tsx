import {
  AlertCircle,
  BookOpen,
  MessageSquare,
  Phone,
  RefreshCw,
  ShieldOff,
} from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  ColumnChart,
  Meter,
  StatTile,
  type ColumnDatum,
  type MeterTone,
} from '@/components/charts';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  DateRangeFilter,
  Dialog,
  EmptyState,
  Input,
  Label,
  MobileCardList,
  Pagination,
  Select,
  Skeleton,
  Table,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  DATE_RANGE_PRESETS,
  dateRangeForPreset,
  isValidDateRange,
  useToast,
  type DateRangeValue,
} from '@/components/ui';
import {
  channelLabel,
  flagReasonText,
  flagShortText,
  followupLabel,
  formatPaise,
  langLabel,
  sessionStatusLabel,
} from '@/features/assist/assistFormat';
import { SessionDrawer } from '@/features/assist/SessionDrawer';
import {
  useAssistBlocksQuery,
  useAssistKbQuery,
  useAssistSessionsQuery,
  useAssistUsageQuery,
  useDeleteAssistBlock,
  useReloadAssistKb,
  useUpdateAssistFollowup,
} from '@/hooks/api/useAssist';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatDuration, formatYmd, isYmd } from '@/lib/format';
import {
  ASSIST_CHANNELS,
  ASSIST_FOLLOWUP_STATUSES,
  ASSIST_SESSION_STATUSES,
} from '@dk/shared';
import type {
  AssistBlockView,
  AssistChannel,
  AssistFollowupStatus,
  AssistSessionStatus,
  AssistSessionSummary,
} from '@dk/shared';
import type { AssistSessionListQuery } from '@dk/shared/schemas';

/**
 * The landing-page assistant, as a super-admin sees it (ADR 0009 §2).
 *
 * Five tabs over one dataset: every conversation, the ones that left a number,
 * the ones the spam pass wants a human to look at, the visitors we have turned
 * away, and what the whole thing is costing. Tab and every filter live in the
 * query string, so "the escalated calls from last week that nobody has rung
 * back" is a link somebody can paste to a colleague.
 *
 * The privacy rule that shapes the layout: a super-admin reading these
 * transcripts is reading strangers' phone numbers. A number is printed on the
 * Leads tab and in the drawer's lead panel, where ringing it is the job, and
 * nowhere else — never in a page title, never in a toast, never in a URL we put
 * there ourselves.
 */

const PAGE_SIZE = 25;
const USAGE_DAYS = 30;

const TAB_IDS = ['conversations', 'leads', 'flagged', 'blocked', 'usage'] as const;
type AssistTab = (typeof TAB_IDS)[number];

const TABS: Array<{ id: AssistTab; label: string }> = [
  { id: 'conversations', label: 'Conversations' },
  { id: 'leads', label: 'Leads' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'usage', label: 'Usage' },
];

function isTab(v: string | null): v is AssistTab {
  return !!v && (TAB_IDS as readonly string[]).includes(v);
}

function isChannel(v: string | null): v is AssistChannel {
  return !!v && (ASSIST_CHANNELS as readonly string[]).includes(v);
}

function isStatus(v: string | null): v is AssistSessionStatus {
  return !!v && (ASSIST_SESSION_STATUSES as readonly string[]).includes(v);
}

function isFollowup(v: string | null): v is AssistFollowupStatus {
  return !!v && (ASSIST_FOLLOWUP_STATUSES as readonly string[]).includes(v);
}

export function AssistPage() {
  const [search, setSearch] = useSearchParams();

  const tabParam = search.get('tab');
  const tab: AssistTab = isTab(tabParam) ? tabParam : 'conversations';

  const channelParam = search.get('channel');
  const channel = isChannel(channelParam) ? channelParam : undefined;
  const statusParam = search.get('status');
  const status = isStatus(statusParam) ? statusParam : undefined;
  const followupParam = search.get('followup');
  const followupStatus = isFollowup(followupParam) ? followupParam : undefined;
  const q = search.get('q')?.trim() || undefined;
  const sessionId = search.get('session');

  // A date window is optional — the list opens on every date on record, so a
  // lead from last month is never quietly hidden behind a default window.
  // When one IS set both ends must be real days in order, or there is no window
  // at all: a half-typed `?from=0002-08-1` must never reach the API.
  const fromParam = search.get('from');
  const toParam = search.get('to');
  const presetParam = search.get('preset');
  const range: DateRangeValue | null =
    isYmd(fromParam) && isYmd(toParam) && isValidDateRange({ from: fromParam, to: toParam })
      ? {
          preset: DATE_RANGE_PRESETS.some((p) => p.id === presetParam)
            ? (presetParam as DateRangeValue['preset'])
            : 'custom',
          from: fromParam,
          to: toParam,
        }
      : null;

  const page = Math.max(1, Number(search.get('page') ?? '1') || 1);
  /** What to write back for `page` when a patch must preserve it (1 = omit). */
  const pageParam = page === 1 ? undefined : String(page);

  /**
   * Write a patch of query params. Anything set to `undefined` is removed, and
   * any change other than paging itself sends the reader back to page 1 — a
   * filter applied on page 4 of the old result set otherwise lands on a page
   * that may not exist.
   */
  const update = React.useCallback(
    (patch: Record<string, string | undefined>) => {
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '') next.delete(k);
            else next.set(k, v);
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearch],
  );

  const onSearchCommit = React.useCallback(
    (value: string) => update({ q: value.trim() || undefined }),
    [update],
  );

  const listParams: AssistSessionListQuery = {
    page,
    pageSize: PAGE_SIZE,
    channel,
    status,
    followupStatus,
    // On, or absent. There is no "only the ones that were NOT flagged".
    flagged: tab === 'flagged' ? true : undefined,
    hasLead: tab === 'leads' ? true : undefined,
    q,
    from: range?.from,
    to: range?.to,
  };

  const isListTab = tab === 'conversations' || tab === 'leads' || tab === 'flagged';

  return (
    <div>
      <PageHeader
        title="Assistant"
        subtitle="Every conversation the landing-page assistant has had — what was asked, what we answered, and who is waiting for a call back."
      />

      <Tabs
        className="mb-4"
        items={TABS.map((t) => ({ id: t.id, label: t.label }))}
        value={tab}
        onChange={(id) =>
          update({
            // The default tab carries no param, so a link to it stays clean.
            tab: id === 'conversations' ? undefined : id,
            // A drawer left open across a tab change is a panel with no row.
            session: undefined,
          })
        }
      />

      {isListTab ? (
        <FiltersCard
          channel={channel}
          status={status}
          followupStatus={followupStatus}
          q={search.get('q') ?? ''}
          range={range}
          onChange={update}
          onSearchCommit={onSearchCommit}
        />
      ) : null}

      {isListTab ? (
        <SessionListTab
          tab={tab}
          params={listParams}
          // `page` is repeated into the patch on purpose: opening a row must
          // not throw the reader back to page 1 of the list behind the drawer.
          onOpen={(id) => update({ session: id, page: pageParam })}
          onPage={(p) => update({ page: p === 1 ? undefined : String(p) })}
        />
      ) : tab === 'blocked' ? (
        <BlockedTab />
      ) : (
        <UsageTab />
      )}

      <SessionDrawer
        sessionId={sessionId}
        onClose={() => update({ session: undefined, page: pageParam })}
      />
    </div>
  );
}

/* ─────────────────────────────── Filters ─────────────────────────────────── */

function FiltersCard({
  channel,
  status,
  followupStatus,
  q,
  range,
  onChange,
  onSearchCommit,
}: {
  channel?: AssistChannel;
  status?: AssistSessionStatus;
  followupStatus?: AssistFollowupStatus;
  q: string;
  range: DateRangeValue | null;
  onChange: (patch: Record<string, string | undefined>) => void;
  onSearchCommit: (value: string) => void;
}) {
  return (
    <Card className="mb-4">
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div>
          <Label htmlFor="assist-channel">How they got in touch</Label>
          <Select
            id="assist-channel"
            value={channel ?? ''}
            onChange={(e) => onChange({ channel: e.target.value || undefined })}
          >
            <option value="">Any way</option>
            {ASSIST_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {channelLabel(c)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="assist-status">Where the visit got to</Label>
          <Select
            id="assist-status"
            value={status ?? ''}
            onChange={(e) => onChange({ status: e.target.value || undefined })}
          >
            <option value="">Any</option>
            {ASSIST_SESSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {sessionStatusLabel(s)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="assist-followup-filter">What we have done about it</Label>
          <Select
            id="assist-followup-filter"
            value={followupStatus ?? ''}
            onChange={(e) => onChange({ followup: e.target.value || undefined })}
          >
            <option value="">Any</option>
            {ASSIST_FOLLOWUP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {followupLabel(s)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label
            htmlFor="assist-q"
            hint="a number typed here shows in the address bar"
          >
            Search
          </Label>
          <SearchBox value={q} onCommit={onSearchCommit} />
        </div>

        <div className="md:col-span-4">
          {range ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <DateRangeFilter
                label="Date range"
                value={range}
                className="min-w-0"
                onChange={(next) =>
                  onChange({ preset: next.preset, from: next.from, to: next.to })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({ preset: undefined, from: undefined, to: undefined })
                }
              >
                Show all dates
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-text-muted">
                Showing every date on record.
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const w = dateRangeForPreset('last7');
                  onChange({ preset: w.preset, from: w.from, to: w.to });
                }}
              >
                Narrow to a date range
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The free-text box, committed to the URL 350 ms after the last keystroke.
 *
 * The ref is what keeps typing and the address bar from fighting: it remembers
 * the last value we ourselves pushed, so a change arriving on the props is
 * adopted only when it came from somewhere else — the back button, a tab
 * switch, a pasted link — and never when it is the echo of what is already in
 * the box.
 */
function SearchBox({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  const emittedRef = React.useRef(value);

  React.useEffect(() => {
    if (value === emittedRef.current) return;
    emittedRef.current = value;
    // What lands in the URL is trimmed; what is in the box is what was typed.
    // Adopting the trimmed form would eat the space the moment it was typed,
    // which reads as the box deleting your keystrokes.
    setDraft((cur) => (cur.trim() === value ? cur : value));
  }, [value]);

  React.useEffect(() => {
    if (draft === emittedRef.current) return;
    const t = window.setTimeout(() => {
      emittedRef.current = draft;
      onCommit(draft);
    }, 350);
    return () => window.clearTimeout(t);
  }, [draft, onCommit]);

  return (
    <Input
      id="assist-q"
      type="search"
      maxLength={80}
      value={draft}
      placeholder="Name, place, number, or the opening line"
      onChange={(e) => setDraft(e.target.value)}
    />
  );
}

/* ─────────────────────────────── Session list ────────────────────────────── */

function SessionListTab({
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
          <Table>
            <THead>
              <TRow>
                <TH>How</TH>
                <TH>When</TH>
                <TH>Language</TH>
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
                  <TD className="whitespace-nowrap">
                    <Badge intent={s.channel === 'call' ? 'info' : 'neutral'}>
                      {channelLabel(s.channel)}
                    </Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-text-muted">
                    {formatDateTime(s.startedAt)}
                  </TD>
                  <TD className="whitespace-nowrap text-text-muted">
                    {langLabel(s.lang)}
                  </TD>
                  <TD className="whitespace-nowrap text-right tabular-nums">
                    {formatDuration(s.durationMs)}
                  </TD>
                  <TD className="text-right tabular-nums">{s.turnCount}</TD>
                  <TD className="max-w-[22rem]">
                    <span className="block truncate text-text-muted" title={s.opening}>
                      {s.opening || '—'}
                    </span>
                  </TD>
                  <TD className="max-w-[14rem]">
                    <LeadCell session={s} showMobile={tab === 'leads'} />
                  </TD>
                  <TD className="max-w-[20rem]">
                    {tab === 'flagged' ? (
                      <FlagReasons session={s} />
                    ) : (
                      <FlagBadges session={s} />
                    )}
                  </TD>
                  <TD onClick={(e) => e.stopPropagation()}>
                    {tab === 'leads' ? (
                      <FollowupSelect session={s} />
                    ) : (
                      <Badge intent={s.followupStatus === 'new' ? 'warning' : 'neutral'}>
                        {followupLabel(s.followupStatus)}
                      </Badge>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-right tabular-nums text-text-muted">
                    {formatPaise(s.estPaise)}
                  </TD>
                </TRow>
              ))}
            </TBody>
          </Table>
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
              <span className="line-clamp-2 font-medium text-text">
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
                <LeadCell session={s} showMobile={false} />
                <span className="mt-1 block text-xs text-text-subtle">
                  {formatDateTime(s.startedAt)} · {formatDuration(s.durationMs)} ·{' '}
                  {s.turnCount} {s.turnCount === 1 ? 'turn' : 'turns'} ·{' '}
                  {langLabel(s.lang)} · {formatPaise(s.estPaise)}
                </span>
              </>
            ),
            meta:
              tab === 'flagged' ? (
                <FlagReasons session={s} />
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  <FlagBadges session={s} />
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
 * Name and place, plus the number only where ringing it is the job.
 *
 * `showMobile` is passed explicitly at every call site rather than derived
 * inside, so adding a sixth place that renders a lead is a decision somebody
 * has to make on purpose.
 */
function LeadCell({
  session,
  showMobile,
}: {
  session: AssistSessionSummary;
  showMobile: boolean;
}) {
  const { name, place, mobile, mobileConfirmed } = session.lead;
  if (!name && !place && !mobile) {
    return <span className="text-sm text-text-subtle">Did not say</span>;
  }
  return (
    <span className="block min-w-0 text-sm">
      <span className="block truncate text-text">
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

function FlagBadges({ session }: { session: AssistSessionSummary }) {
  if (session.flags.length === 0 && !session.blocked) {
    return <span className="text-sm text-text-subtle">—</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {session.blocked ? <Badge intent="danger">Blocked</Badge> : null}
      {session.flags.map((f) => (
        <Badge key={`${f.kind}-${f.at}`} intent="warning" title={flagReasonText(f)}>
          {flagShortText(f)}
        </Badge>
      ))}
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
          className="block text-xs leading-snug text-text-muted"
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
      aria-label="Follow-up"
      className="min-w-[10rem]"
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

/* ─────────────────────────────── Blocked ─────────────────────────────────── */

function BlockedTab() {
  const blocksQ = useAssistBlocksQuery();
  const [confirming, setConfirming] = React.useState<AssistBlockView | null>(null);
  const items = blocksQ.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Visitors we have turned away</CardTitle>
          <CardSubtitle>
            A block is on a fingerprint — a hash of the number, or of the network
            when there was no number. The raw value is never stored, so a block
            can never be turned back into a phone number.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {blocksQ.isLoading ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : blocksQ.isError ? (
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title="Could not load the block list"
            description={
              blocksQ.error instanceof ApiError
                ? blocksQ.error.message
                : 'Please try again.'
            }
            cta={
              <Button variant="secondary" size="sm" onClick={() => void blocksQ.refetch()}>
                Retry
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ShieldOff width={28} height={28} strokeWidth={1.75} />}
            title="Nobody is blocked"
            description="Flags never block anyone by themselves — a block is always somebody's decision."
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <TRow>
                    <TH>Who</TH>
                    <TH>Reaches</TH>
                    <TH>Why</TH>
                    <TH>Blocked by</TH>
                    <TH>When</TH>
                    <TH>Until</TH>
                    <TH className="text-right">Action</TH>
                  </TRow>
                </THead>
                <TBody>
                  {items.map((b) => (
                    <TRow key={b.id}>
                      <TD className="whitespace-nowrap font-medium tabular-nums">
                        {b.hint}
                      </TD>
                      <TD className="whitespace-nowrap text-text-muted">
                        {b.basis === 'mobile'
                          ? 'That number only'
                          : 'Everyone on that connection'}
                      </TD>
                      <TD className="max-w-[22rem]">
                        <span className="block truncate" title={b.reason}>
                          {b.reason}
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap text-text-muted">
                        {b.createdByEmail ?? '—'}
                      </TD>
                      <TD className="whitespace-nowrap text-text-muted">
                        {formatDateTime(b.createdAt)}
                      </TD>
                      <TD className="whitespace-nowrap text-text-muted">
                        {b.expiresAt ? formatDateTime(b.expiresAt) : 'Until lifted'}
                      </TD>
                      <TD className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirming(b)}
                        >
                          Unblock
                        </Button>
                      </TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            </div>

            <MobileCardList
              className="p-3"
              cards={items.map((b) => ({
                key: b.id,
                primary: (
                  <span className="font-medium tabular-nums text-text">{b.hint}</span>
                ),
                primaryRight: (
                  <Badge intent={b.basis === 'mobile' ? 'neutral' : 'warning'}>
                    {b.basis === 'mobile' ? 'One number' : 'A whole connection'}
                  </Badge>
                ),
                secondary: <span>{b.reason}</span>,
                meta: (
                  <span>
                    Blocked {formatDateTime(b.createdAt)}
                    {b.createdByEmail ? ` by ${b.createdByEmail}` : ''} ·{' '}
                    {b.expiresAt ? `until ${formatDateTime(b.expiresAt)}` : 'until lifted'}
                  </span>
                ),
                actions: (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => setConfirming(b)}
                  >
                    Unblock
                  </Button>
                ),
              }))}
            />
          </>
        )}
      </CardContent>

      <UnblockDialog block={confirming} onClose={() => setConfirming(null)} />
    </Card>
  );
}

function UnblockDialog({
  block,
  onClose,
}: {
  block: AssistBlockView | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const unblock = useDeleteAssistBlock();

  async function submit() {
    if (!block) return;
    try {
      await unblock.mutateAsync(block.id);
      toast.success('Unblocked. The assistant will answer them again.');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not unblock');
    }
  }

  return (
    <Dialog
      open={!!block}
      onClose={onClose}
      size="sm"
      title="Lift this block?"
      description={
        block?.basis === 'mobile'
          ? 'That number will be able to use the assistant again straight away.'
          : 'Everyone on that connection will be able to use the assistant again straight away.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep the block
          </Button>
          <Button onClick={() => void submit()} loading={unblock.isPending}>
            Unblock
          </Button>
        </>
      }
    >
      <div className="grid gap-1.5 text-sm">
        <p className="text-text">
          <span className="font-medium tabular-nums">{block?.hint}</span>
        </p>
        <p className="text-text-muted">Blocked because: {block?.reason}</p>
      </div>
    </Dialog>
  );
}

/* ─────────────────────────────── Usage ───────────────────────────────────── */

function toneForSpend(todayPaise: number, budgetPaise: number): MeterTone {
  if (budgetPaise <= 0) return 'brand';
  const pct = (todayPaise / budgetPaise) * 100;
  if (pct >= 100) return 'danger';
  if (pct >= 80) return 'warning';
  return 'brand';
}

function UsageTab() {
  const usageQ = useAssistUsageQuery(USAGE_DAYS);
  // Memoised so the empty-array fallback is not a fresh array every render —
  // the totals below fold over it and would recompute on every keystroke elsewhere.
  const days = React.useMemo(() => usageQ.data?.days ?? [], [usageQ.data]);

  const totals = React.useMemo(
    () =>
      days.reduce(
        (acc, d) => ({
          sessions: acc.sessions + d.sessions,
          calls: acc.calls + d.calls,
          leads: acc.leads + d.leads,
          escalations: acc.escalations + d.escalations,
          paise: acc.paise + d.estPaise,
        }),
        { sessions: 0, calls: 0, leads: 0, escalations: 0, paise: 0 },
      ),
    [days],
  );

  const chartData: ColumnDatum[] = days.map((d) => ({
    key: d.date,
    tick: d.date.slice(8),
    label: formatYmd(d.date, { weekday: true }),
    value: d.estPaise,
    note: `${d.sessions} ${d.sessions === 1 ? 'visit' : 'visits'} · ${d.calls} ${
      d.calls === 1 ? 'call' : 'calls'
    } · ${d.leads} ${d.leads === 1 ? 'lead' : 'leads'}`,
  }));

  const todayPaise = usageQ.data?.todayPaise ?? 0;
  const budgetPaise = usageQ.data?.budgetPaise ?? 0;
  const tone = toneForSpend(todayPaise, budgetPaise);
  const peak = days.reduce<(typeof days)[number] | null>(
    (best, d) => (best === null || d.estPaise > best.estPaise ? d : best),
    null,
  );

  if (usageQ.isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (usageQ.isError) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title="Could not load usage"
            description={
              usageQ.error instanceof ApiError
                ? usageQ.error.message
                : 'Please try again.'
            }
            cta={
              <Button variant="secondary" size="sm" onClick={() => void usageQ.refetch()}>
                Retry
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Visits"
          value={totals.sessions.toLocaleString('en-IN')}
          caption={`Last ${USAGE_DAYS} days`}
        />
        <StatTile
          label="Calls"
          value={totals.calls.toLocaleString('en-IN')}
          caption="Visitors who tapped Call and talked"
        />
        <StatTile
          label="Leads"
          value={totals.leads.toLocaleString('en-IN')}
          caption="Left a name, a place or a number"
        />
        <StatTile
          label="Asked for a person"
          value={totals.escalations.toLocaleString('en-IN')}
          caption="We owe these a call back"
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Today&apos;s spend</CardTitle>
            <CardSubtitle>
              What the assistant has cost since midnight, against the daily cap
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent>
          <Meter
            label="Spent today"
            value={todayPaise}
            limit={budgetPaise}
            tone={tone}
            valueLabel={`${formatPaise(todayPaise)} of ${formatPaise(budgetPaise)}`}
            caption={
              budgetPaise <= 0
                ? 'No daily cap is set, so nothing switches itself off.'
                : todayPaise >= budgetPaise
                  ? 'The cap is reached: calls are off and the chat is offering a callback instead. It clears at midnight.'
                  : tone === 'warning'
                    ? 'Close to the cap. When it is reached, calls switch off on their own and the chat offers a callback.'
                    : 'When the cap is reached, calls switch off on their own and the chat offers a callback.'
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>What it costs, day by day</CardTitle>
            <CardSubtitle>
              Last {USAGE_DAYS} days · {formatPaise(totals.paise)} in total
            </CardSubtitle>
          </div>
        </CardHeader>
        <CardContent>
          {/* The daily cap is deliberately NOT drawn as a threshold line here.
              The cap is sized for a busy day, so on an ordinary one it is many
              times the tallest column — and a scale stretched to reach it turns
              every real day into a stub. The cap has its own meter above; this
              chart's job is the shape of the days against each other. The
              busiest day is named in words underneath instead. */}
          <ColumnChart
            data={chartData}
            formatValue={formatPaise}
            idleReadout="Hover or tab through a day to read it."
            tableCaption="Show every day as a table"
            tableValueHeader="Spend"
          />
          {peak && budgetPaise > 0 ? (
            <p className="mt-2 text-xs text-text-subtle">
              Busiest day was {formatYmd(peak.date, { weekday: true })} at{' '}
              {formatPaise(peak.estPaise)} — {Math.round((peak.estPaise / budgetPaise) * 100)}%
              of one day&apos;s cap.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <KnowledgeBaseCard />
    </div>
  );
}

/**
 * What the assistant is answering FROM.
 *
 * The pack is loaded lazily on the first question and cached in the process, so
 * "loaded" here is a statement about this server since its last restart, not
 * about S3. Reload re-reads it without a deploy — that is the whole reason the
 * knowledge base lives in a bucket rather than in the build.
 */
function KnowledgeBaseCard() {
  const toast = useToast();
  const kbQ = useAssistKbQuery();
  const reload = useReloadAssistKb();
  const kb = kbQ.data;

  async function onReload() {
    try {
      const status = await reload.mutateAsync();
      toast.success(
        status.loaded
          ? `Reloaded — ${status.count.toLocaleString('en-IN')} passages, version ${status.version ?? 'unknown'}`
          : 'Reload finished, but nothing loaded. See the error on the card.',
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not reload');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>What it answers from</CardTitle>
          <CardSubtitle>
            The packed guidelines the assistant reads. Nothing else is used.
          </CardSubtitle>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void onReload()}
          loading={reload.isPending}
          disabled={kbQ.isLoading}
          leftIcon={<RefreshCw width={14} height={14} strokeWidth={1.75} />}
        >
          Reload
        </Button>
      </CardHeader>
      <CardContent>
        {kbQ.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : kbQ.isError || !kb ? (
          <EmptyState
            icon={<BookOpen width={28} height={28} strokeWidth={1.75} />}
            title="Could not read the knowledge-base status"
            description={
              kbQ.error instanceof ApiError ? kbQ.error.message : 'Please try again.'
            }
            cta={
              <Button variant="secondary" size="sm" onClick={() => void kbQ.refetch()}>
                Retry
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge intent={kb.loaded ? 'success' : 'warning'}>
                {kb.loaded ? 'Loaded' : 'Not loaded yet'}
              </Badge>
              {kb.error ? <Badge intent="danger">Last try failed</Badge> : null}
            </div>
            <dl className="grid gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-text-muted">Version</dt>
                <dd className="mt-0.5 truncate text-sm text-text">
                  {kb.version ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Passages</dt>
                <dd className="mt-0.5 text-sm tabular-nums text-text">
                  {kb.count ? kb.count.toLocaleString('en-IN') : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Read at</dt>
                <dd className="mt-0.5 text-sm text-text">
                  {kb.loadedAt ? formatDateTime(kb.loadedAt) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Came from</dt>
                <dd className="mt-0.5 text-sm text-text">
                  {kb.source === 's3'
                    ? 'The bucket'
                    : kb.source === 'disk'
                      ? "This server's own copy"
                      : '—'}
                </dd>
              </div>
            </dl>
            {kb.error ? (
              <p className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">
                {kb.error}
              </p>
            ) : null}
            {!kb.loaded && !kb.error ? (
              <p className="text-xs text-text-subtle">
                Nothing has been asked since the last restart. The pack is read on
                the first question, never at boot — a bucket having a bad morning
                must not stop the API starting.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
