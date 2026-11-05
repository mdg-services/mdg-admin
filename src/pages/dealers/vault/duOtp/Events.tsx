import { Badge, DataList, type DataColumn } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatDateTime, formatYmd } from '@/lib/format';
import type { DuOtpEntryView } from '@dk/shared';

import { STATE_VIEW } from './format';

/**
 * One event's OTP date: the portal prints it as "22-OCT-26"; the pane prints the
 * parsed day in the app's one date style, and falls back to the portal's own text
 * when that did not parse — an admin comparing against the portal still sees what
 * the portal said.
 */
function otpDate(e: DuOtpEntryView): string {
  return e.transactionDate ? formatYmd(e.transactionDate) : e.transactionDateText || '-';
}

function StateBadge({ entry }: { entry: DuOtpEntryView }) {
  const view = STATE_VIEW[entry.state];
  return <Badge intent={view.intent}>{view.label}</Badge>;
}

/**
 * An id or code in the portal's own spelling. `keep` stops a short id breaking
 * mid-way in a table column ("EVT-000" over "01" is unreadable); the long system
 * reason is left free to wrap, and on a phone both wrap rather than run off the
 * card.
 */
function Mono({ children, keep = false }: { children: string; keep?: boolean }) {
  if (!children) return <span>-</span>;
  return (
    <span className={keep ? 'break-all font-mono text-xs md:whitespace-nowrap md:break-normal' : 'break-all font-mono text-xs'}>
      {children}
    </span>
  );
}

/** What happened when MDG filed this event: the failure, what IndianOil replied, and when. */
function ResultCell({ entry }: { entry: DuOtpEntryView }) {
  const { failure, portalReply, submittedAt } = entry;
  if (!failure && !portalReply && !submittedAt) return <span className="text-text-subtle">-</span>;
  return (
    <div className="grid gap-0.5 break-words text-sm">
      {failure ? <p className="text-danger">{failure}</p> : null}
      {portalReply ? <p className="text-text">IndianOil replied: “{portalReply}”</p> : null}
      {submittedAt ? <p className="text-text-muted">Filed {formatDateTime(submittedAt)}</p> : null}
    </div>
  );
}

const ENTRY_COLUMNS: DataColumn<DuOtpEntryView>[] = [
  {
    id: 'date',
    header: 'OTP date',
    cell: (e) => <span className="whitespace-nowrap font-medium">{otpDate(e)}</span>,
    mobile: 'primary',
  },
  {
    id: 'state',
    header: 'Our state',
    cell: (e) => <StateBadge entry={e} />,
    mobile: 'primaryRight',
  },
  { id: 'event', header: 'Event id', cell: (e) => <Mono keep>{e.eventId}</Mono> },
  { id: 'txn', header: 'Transaction ids', cell: (e) => <Mono keep>{e.transactionIds}</Mono> },
  {
    id: 'window',
    header: 'Start / finish',
    cell: (e) =>
      e.startText || e.finishText ? `${e.startText || '-'} / ${e.finishText || '-'}` : '-',
  },
  { id: 'nozzle', header: 'Nozzle', cell: (e) => e.nozzleNo || '-' },
  { id: 'reason', header: 'Reason by system', cell: (e) => <Mono>{e.systemReason}</Mono> },
  { id: 'portal', header: 'Portal status', cell: (e) => e.portalStatus || '-' },
  { id: 'result', header: 'Result', cell: (e) => <ResultCell entry={e} />, mobileLabel: 'Result' },
];

/** The events of one open group, as the portal listed them plus where each stands at MDG. */
export function GroupEntries({ entries }: { entries: readonly DuOtpEntryView[] }) {
  // Nine columns need about 62rem. Beside the sidebar that only fits from ~1280px;
  // below it the card stack is the honest shape, not a table a finger has to
  // drag sideways to reach "Result".
  const wide = useMediaQuery('(min-width: 1280px)');
  return (
    <DataList
      rows={entries}
      rowKey={(e) => e.id}
      columns={ENTRY_COLUMNS}
      shape={wide ? 'table' : 'cards'}
      minWidth="62rem"
      cardVariant="rows"
    />
  );
}

/** Closed events — filed by MDG or finished at the outlet — with the unit they were on. */
const RECENT_COLUMNS: DataColumn<DuOtpEntryView>[] = [
  {
    id: 'date',
    header: 'OTP date',
    cell: (e) => <span className="whitespace-nowrap font-medium">{otpDate(e)}</span>,
    mobile: 'primary',
  },
  {
    id: 'state',
    header: 'Outcome',
    cell: (e) => <StateBadge entry={e} />,
    mobile: 'primaryRight',
  },
  {
    id: 'du',
    header: 'Dispensing unit',
    cell: (e) =>
      [e.duSerial ? `DU ${e.duSerial}` : '', [e.duMake, e.duModel].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(' · ') || '-',
  },
  { id: 'event', header: 'Event id', cell: (e) => <Mono keep>{e.eventId}</Mono> },
  {
    id: 'closed',
    header: 'Closed',
    cell: (e) =>
      e.state === 'submitted'
        ? `Filed ${formatDateTime(e.submittedAt ?? e.lastSeenAt)}`
        : `Last on the portal list ${formatDateTime(e.lastSeenAt)}`,
  },
  {
    id: 'reply',
    header: 'IndianOil replied',
    cell: (e) => (e.portalReply ? <span className="break-words">{e.portalReply}</span> : '-'),
  },
];

export function RecentEvents({ entries }: { entries: readonly DuOtpEntryView[] }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  return (
    <DataList
      rows={entries}
      rowKey={(e) => e.id}
      columns={RECENT_COLUMNS}
      shape={wide ? 'table' : 'cards'}
      minWidth="48rem"
      cardVariant="rows"
    />
  );
}
