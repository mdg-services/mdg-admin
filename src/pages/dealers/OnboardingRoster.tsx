import { CheckCircle2, ClipboardList, MessageCircle, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { ActionRow, Badge, Button, DataList, EmptyState } from '@/components/ui';
import { ContactLinks } from '@/features/intake/ContactLinks';
import { ApproveDialog } from '@/features/onboarding/ApproveDialog';
import { LogCallDialog, type CallTarget } from '@/features/onboarding/LogCallDialog';
import { StageActions } from '@/features/onboarding/StageActions';
import { cn } from '@/lib/cn';
import {
  boardRowKey,
  companyChipText,
  daysInStage,
  daysLabel,
  type MainActionId,
  type RegistrationRow,
} from '@/lib/onboarding';
import {
  inboxChatHref,
  rosterCounts,
  trackOf,
  trackPosition,
  type NextKind,
  type RosterRow,
  type TrackState,
} from '@/lib/onboardingNext';
import { dealerCodeLabel, type OnboardingBoardRow } from '@dk/shared';

/** The buttons a row's next step needs beyond the stage's primary one. */
const ALSO_SHOW: Partial<Record<NextKind, readonly MainActionId[]>> = {
  watch_decide: ['extend_watch'],
  not_interested: ['close'],
};

/** Next steps that are a phone call: Log call is the row's blue button. */
const CALL_FIRST: ReadonlySet<NextKind> = new Set(['call', 'chase_payment', 'not_me']);

/**
 * The Dealers page's Onboarding view: every outlet still being set up (and every
 * registration still waiting for a yes), each with the one thing to do next.
 *
 * Two lists, because they are two questions. "Needs you now" is the to-do list:
 * the dealer waiting on MDG first, then the dealers MDG has to chase, the
 * longest-waiting first. "Nothing to do yet" is everybody whose move it is, or
 * who is being watched, each saying what goes out by itself and when the team is
 * next needed, the soonest first. A row moves from the second list to the first
 * the moment that time comes (the page re-reads the clock every minute).
 *
 * The rules are `lib/onboardingNext.ts`. The buttons are the Onboarding page's
 * own (`StageActions`, compact), so this view never offers anything that page
 * does not.
 */
export function OnboardingRoster({
  rows,
  loading,
  failed,
  onRetry,
  filtered,
  now,
}: {
  /** Already in the view's order (`rosterRows`) and narrowed by the search box. */
  rows: readonly RosterRow[];
  /** The clock the rows were worked out against, so the day counts agree with them. */
  now: number;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  /** The search box has text in it: an empty list means "no match", not "nothing to do". */
  filtered: boolean;
}) {
  const [approving, setApproving] = React.useState<RegistrationRow | null>(null);
  const [calling, setCalling] = React.useState<CallTarget | null>(null);

  const toDo = rows.filter((r) => r.next.urgency === 'now');
  const later = rows.filter((r) => r.next.urgency === 'wait');
  const counts = rosterCounts(rows);

  if (failed) {
    return (
      <EmptyState
        icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
        title="Could not load onboarding"
        description="This does not mean nothing is waiting. Check the connection and try again."
        cta={
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList width={24} height={24} strokeWidth={1.75} />}
        title={filtered ? 'No outlet being set up matches' : 'Nobody is being set up'}
        description={
          filtered
            ? 'Search looks at the code, the owner, the phone and the SAP code.'
            : 'A new registration, and every outlet until its first days are watched, appears here.'
        }
      />
    );
  }

  const registrationActions = (r: RegistrationRow, stacked: boolean) => (
    <ActionRow below="wrap" align="start" className={stacked ? 'flex-col !items-stretch' : undefined}>
      <Button size="sm" onClick={() => setApproving(r)}>
        {r.alreadyClient ? 'Approve…' : 'Approve'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          setCalling({ kind: 'registration', registrationId: r.registrationId, name: r.name, sapCode: r.sapCode })
        }
      >
        Log call…
      </Button>
    </ActionRow>
  );

  const actions = (r: RosterRow, stacked: boolean) =>
    r.row.kind === 'registration' ? (
      registrationActions(r.row as RegistrationRow, stacked)
    ) : (
      <StageActions
        outlet={r.row.outlet}
        layout={stacked ? 'stack' : 'wrap'}
        compact
        alsoShow={ALSO_SHOW[r.next.kind] ?? []}
        callFirst={CALL_FIRST.has(r.next.kind)}
        withoutPrimary={r.next.kind === 'held_messages'}
      />
    );

  const list = (items: readonly RosterRow[]) => (
    <DataList<RosterRow>
      rows={items}
      rowKey={(r) => boardRowKey(r.row)}
      loading={loading}
      skeletonRows={3}
      cardVariant="rows"
      minWidth="52rem"
      columns={[
        {
          id: 'outlet',
          header: 'Outlet',
          width: '13rem',
          mobile: 'primary',
          cell: (r) => <OutletCell row={r.row} />,
        },
        {
          id: 'next',
          header: 'What to do next',
          mobile: 'secondary',
          cell: (r) => <NextCell item={r} />,
        },
        {
          id: 'step',
          header: 'Where it stands',
          width: '11rem',
          mobile: 'meta',
          cell: (r) => <StepCell row={r.row} now={now} />,
        },
      ]}
      rowActions={(r) => <div className="hidden w-44 md:block">{actions(r, true)}</div>}
      cardActions={(r) => actions(r, false)}
    />
  );

  return (
    <div>
      <Section
        title="Needs you now"
        count={toDo.length}
        tone="warning"
        hint="The owner is waiting on us first, then the owners we have to chase. Longest waiting first."
      >
        {toDo.length === 0 && !loading ? (
          <p className="flex items-center gap-2 px-3 pb-3 text-sm text-text-muted md:px-0">
            <CheckCircle2 width={16} height={16} strokeWidth={1.75} className="text-success" />
            Nothing to do right now. A row moves up here the moment it needs you.
          </p>
        ) : (
          list(toDo)
        )}
      </Section>

      {later.length > 0 ? (
        <Section
          title="Nothing to do yet"
          count={later.length}
          tone="info"
          hint={`${counts.dealer} waiting on the owner${
            counts.watching > 0 ? `, ${counts.watching} being watched` : ''
          }. Each row says when you will be needed, soonest first.`}
        >
          {list(later)}
        </Section>
      ) : null}

      <LogCallDialog target={calling} onClose={() => setCalling(null)} />
      <ApproveDialog row={approving} onClose={() => setApproving(null)} />
    </div>
  );
}

function Section({
  title,
  count,
  tone,
  hint,
  children,
}: {
  title: string;
  count: number;
  tone: 'warning' | 'info';
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 first-of-type:mt-3 md:first-of-type:mt-0">
      <div className="px-3 pb-2 md:px-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          <span
            aria-hidden
            className={cn('inline-block h-2 w-2 rounded-full', tone === 'warning' ? 'bg-warning' : 'bg-info')}
          />
          {title}
          <span className="font-normal text-text-subtle">{count}</span>
        </h2>
        <p className="mt-0.5 text-xs text-text-subtle">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/** Who: the code (a link to the outlet) and the owner, or a registration's name. */
function OutletCell({ row }: { row: OnboardingBoardRow }) {
  if (row.kind === 'registration') {
    return (
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="select-text font-medium text-text">{row.name}</span>
          <Badge intent="warning">New</Badge>
        </div>
        <p className="mt-0.5 select-text text-xs text-text-subtle">
          SAP code <span className="font-mono">{row.sapCode}</span>
        </p>
        <div className="mt-0.5">
          <ContactLinks mobile={row.mobile} />
        </div>
        <ChatLink mobile={row.mobile} />
      </div>
    );
  }
  const o = row.outlet;
  const company = companyChipText(o.company);
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Link
          to={`/dealers/${o.dealerId}?tab=info`}
          className="font-semibold text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {dealerCodeLabel(o.code)}
        </Link>
        {company ? <Badge>{company}</Badge> : null}
      </div>
      {o.ownerName ? <p className="mt-0.5 select-text text-sm text-text">{o.ownerName}</p> : null}
      {o.mobile ? (
        <div className="mt-0.5">
          <ContactLinks mobile={o.mobile} />
        </div>
      ) : null}
      <ChatLink mobile={o.mobile} />
    </div>
  );
}

/**
 * "WhatsApp chat": our inbox, open at this person's chat — the one of our two
 * numbers they last wrote on or have unread on (`inboxChatHref`). Drawn as a
 * small button, not a plain link: it is the other way to reach them beside the
 * phone, and the row's whole point is getting in touch. Nothing for a number
 * WhatsApp could not have.
 */
function ChatLink({ mobile }: { mobile: string | null | undefined }) {
  const href = inboxChatHref(mobile);
  if (!href) return null;
  return (
    <Link
      to={href}
      className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border-strong px-2.5 text-sm font-medium text-text hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0 md:py-1"
    >
      <MessageCircle width={14} height={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-success" />
      WhatsApp chat
    </Link>
  );
}

/** The one thing to do, why, and — for a step done somewhere else — where. */
function NextCell({ item }: { item: RosterRow }) {
  const { next, row } = item;
  const elsewhere =
    next.kind === 'held_messages'
      ? { to: '/onboarding', label: 'Open the held messages' }
      : (next.kind === 'not_me' || next.kind === 'other' || next.kind === 'send_welcome') &&
          row.kind === 'outlet'
        ? { to: `/dealers/${row.outlet.dealerId}?tab=info`, label: 'Open the outlet' }
        : null;
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <p
        className={cn(
          'text-sm font-medium',
          next.urgency === 'now' ? 'text-warning-strong' : 'text-text',
        )}
      >
        {next.title}
      </p>
      <p className="mt-0.5 text-sm text-text-muted">{next.why}</p>
      {elsewhere ? (
        <Link
          to={elsewhere.to}
          className="mt-1 inline-block text-xs font-medium text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {elsewhere.label}
        </Link>
      ) : null}
    </div>
  );
}

const SEGMENT: Record<TrackState, string> = {
  done: 'bg-success',
  current: 'bg-warning',
  todo: 'bg-border-strong',
  skipped: 'border border-border-strong bg-transparent',
};

const STATE_WORD: Record<TrackState, string> = {
  done: 'done',
  current: 'now',
  todo: 'to do',
  skipped: 'skipped',
};

/** The way from registration to live as eight short bars, and which one this row is on. */
function StepCell({ row, now }: { row: OnboardingBoardRow; now: number }) {
  const track = trackOf(row);
  const { step, of } = trackPosition(row);
  const current = track.find((s) => s.state === 'current');
  const watching = row.kind === 'outlet' && row.outlet.stage === 'watch';
  const days = row.kind === 'outlet' ? daysLabel(daysInStage(row.outlet.stageSince, now)) : '';
  const label = [watching ? 'Services running, watched' : current?.label, days]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="min-w-0">
      <div
        className="flex gap-0.5"
        role="img"
        aria-label={track.map((s) => `${s.label}: ${STATE_WORD[s.state]}`).join(', ')}
      >
        {track.map((s) => (
          <span
            key={s.key}
            title={`${s.label}: ${STATE_WORD[s.state]}`}
            className={cn('h-1.5 w-4 rounded-sm md:w-3.5', SEGMENT[s.state])}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-text-subtle">
        {watching ? label : `Step ${step} of ${of}${label ? ` · ${label}` : ''}`}
      </p>
    </div>
  );
}
