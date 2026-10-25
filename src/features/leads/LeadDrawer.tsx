import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  KeyValueList,
  type KeyValueItem,
  Skeleton,
} from '@/components/ui';
import { ContactLinks } from '@/features/intake/ContactLinks';
import { useLeadQuery } from '@/hooks/api/useLeads';
import { cn } from '@/lib/cn';
import { istStamp } from '@/lib/intake';
import {
  DUE_REASON_LABELS,
  STATUS_TONE,
  activityLine,
  closedLine,
  devicesNote,
  dueLine,
  isClosed,
  lastContactLine,
  leadName,
  originText,
  ownerLine,
  registrationWords,
  signLine,
  statusLabel,
  visitLine,
} from '@/lib/leads';
import { dealerCodeLabel } from '@dk/shared';
import type { LeadActivity, LeadDetail, LeadRow, LeadVisit } from '@dk/shared';

import { CallRecordings } from './CallRecordings';
import { LeadDrawerActions } from './LeadActions';
import { WatchBar, WrapChip } from './LeadCells';
import { LeadTimeline } from './LeadTimeline';
import type { LeadActionHandler } from './shared';

const LINK =
  'inline-flex min-h-11 select-text items-center rounded-sm text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0';

/** The team's log shows this many before "Show all". */
const LOG_FIRST = 8;

/**
 * One lead in full: where it stands and what to do next, every action as a
 * button, the recordings of the team's calls with their summaries, what we know
 * about them, how they watched the film, everything that has happened with them
 * from every source, and what the team has logged.
 *
 * Opened by `?lead=<id>` on the Leads page, so the link the three lead alerts
 * carry lands here. It fetches the lead itself rather than being handed a row
 * from the list, because that lead need not be on the tab the list is showing.
 * `id` is the lead to show; `null` is closed.
 *
 * The actions sit at the top, as buttons that wrap: the phone shell has no
 * address bar and no right click, so nothing here waits behind a gesture. Every
 * form they open is mounted by the page (`LeadDialogs`) and stacks over this
 * drawer.
 */
export function LeadDrawer({
  id,
  now,
  onClose,
  onAction,
}: {
  id: string | null;
  now: number;
  onClose: () => void;
  onAction: LeadActionHandler;
}) {
  const q = useLeadQuery(id);
  const d = q.data;
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={d ? leadName(d.lead) : 'Lead'}
      description={d ? `${d.lead.ref} · ${statusLabel(d.lead.status)}` : undefined}
    >
      {q.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : d ? (
        <LeadBody detail={d} now={now} onAction={onAction} />
      ) : (
        // Not "gone": a lead that cannot be read is not a lead that does not exist.
        <EmptyState
          title="Could not open this lead"
          description={
            q.error instanceof Error && q.error.message
              ? q.error.message
              : 'It may have been removed, or the connection dropped. Try again.'
          }
          cta={
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
              Try again
            </Button>
          }
        />
      )}
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtle">{title}</h3>
      {children}
    </section>
  );
}

function LeadBody({
  detail,
  now,
  onAction,
}: {
  detail: LeadDetail;
  now: number;
  onAction: LeadActionHandler;
}) {
  const { lead, visits, activity, timeline, nextStep } = detail;
  const closed = isClosed(lead.status);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge intent={STATUS_TONE[lead.status]}>{statusLabel(lead.status)}</Badge>
        {lead.cold && !closed ? (
          <Badge intent="danger">Going cold</Badge>
        ) : null}
        {lead.optedOut ? <Badge intent="danger">On the stop list</Badge> : null}
        <span className="text-sm text-text-muted">{ownerLine(lead.owner)}</span>
      </div>

      {/* The one sentence a person needs: what to do about this lead now. */}
      <p className="rounded-md border border-brand bg-brand-soft px-3 py-2 text-sm text-text [overflow-wrap:anywhere]">
        {nextStep}
      </p>

      <LeadDrawerActions lead={lead} onAction={onAction} />

      <Section title="Call recordings">
        <CallRecordings
          // One per lead: an upload under way belongs to the lead it was started on.
          key={lead.id}
          lead={lead}
          // A server one release behind sends none, and a lead then has nothing to show.
          recordings={detail.recordings ?? []}
          now={now}
          onLogCall={(prefill) => onAction('contact', lead, prefill)}
        />
      </Section>

      <Section title="About them">
        <KeyValueList items={facts(lead, now)} />
      </Section>

      <Section title="Film visits">
        <Visits visits={visits} now={now} />
      </Section>

      <Section title="Everything that happened">
        <LeadTimeline items={timeline} now={now} />
      </Section>

      <Section title="The team's log">
        <TeamLog entries={activity} now={now} />
      </Section>
    </div>
  );
}

/** The facts under "About them": only the ones this lead has. */
function facts(lead: LeadRow, now: number): KeyValueItem[] {
  const due = dueLine(lead, now);
  const last = lastContactLine(lead.lastContact, now);
  const sign = signLine(lead.lastSign, lead.lastContact, now);
  const note = devicesNote(lead.watch.devices);
  const items: KeyValueItem[] = [];

  items.push({
    key: 'number',
    label: 'Number',
    value: lead.phone ? (
      <ContactLinks mobile={lead.phone} />
    ) : (
      <span className="text-text-muted">None yet. Add it from the buttons above.</span>
    ),
  });
  if (lead.place) items.push({ key: 'place', label: 'Place', value: lead.place });
  items.push({
    key: 'origin',
    label: 'Came from',
    value: [originText(lead), lead.campaign].filter(Boolean).join(' · '),
  });
  items.push({
    key: 'first',
    label: 'First seen',
    value: istStamp(lead.firstSeenAt, now) || '—',
  });
  items.push({
    key: 'watched',
    label: 'Watched',
    block: true,
    // The bar prints its own line ("Watched 12:30 of 26:29 · …"), so the fact adds only the bar and the note.
    value: (
      <>
        <WatchBar watch={lead.watch} className="mt-1.5" />
        {note ? <span className="mt-1 block text-xs text-text-subtle">{note}</span> : null}
      </>
    ),
  });
  if (lead.watch.lastAt) {
    items.push({
      key: 'last-visit',
      label: 'Last visit',
      value: [istStamp(lead.watch.lastAt, now), lead.watch.city].filter(Boolean).join(' · '),
    });
  }

  if (isClosed(lead.status)) {
    items.push({ key: 'closed', label: 'Closed', value: closedLine(lead, now) });
  } else if (lead.status === 'registered' && !lead.nextDueAt) {
    items.push({ key: 'due', label: 'Next follow-up', value: 'Onboarding has them' });
  } else if (due) {
    items.push({
      key: 'due',
      label: 'Next follow-up',
      value: (
        <>
          {due.text}
          {lead.dueReason ? (
            <span className="text-text-subtle"> · {DUE_REASON_LABELS[lead.dueReason]}</span>
          ) : null}
        </>
      ),
    });
  }
  items.push({ key: 'last', label: 'Last contact', value: last ?? 'Nobody has been in touch yet' });
  if (sign) items.push({ key: 'sign', label: 'They did', value: <WrapChip>{sign}</WrapChip> });

  if (lead.registration) {
    items.push({
      key: 'registration',
      label: 'Registration',
      value: (
        <>
          {registrationWords(lead.registration.state)}.{' '}
          <Link to="/onboarding" className={LINK}>
            Open Onboarding
          </Link>
        </>
      ),
    });
  }
  if (lead.dealer) {
    items.push({
      key: 'outlet',
      label: 'Outlet',
      value: (
        <Link to={`/dealers/${lead.dealer.id}`} className={cn(LINK, 'font-medium')}>
          {lead.dealer.code ? dealerCodeLabel(lead.dealer.code) : 'Open the outlet'}
        </Link>
      ),
    });
  }
  if (lead.optedOut) {
    items.push({
      key: 'stop',
      label: 'WhatsApp',
      value: 'On the stop list. No promotion goes to them.',
    });
  }
  return items;
}

function Visits({ visits, now }: { visits: readonly LeadVisit[]; now: number }) {
  if (visits.length === 0) {
    return <p className="text-sm text-text-muted">No film visits recorded.</p>;
  }
  return (
    <ul className="grid gap-2.5">
      {visits.map((v, i) => (
        <li key={`${v.at}-${i}`} className="min-w-0 text-sm [overflow-wrap:anywhere]">
          <p className="text-text">
            <span className="font-medium">{istStamp(v.at, now)}</span> · {visitLine(v)}
          </p>
          <p className="mt-0.5 text-xs text-text-subtle">
            {[v.city, v.device, v.viaLink ? null : 'opened later, without the link']
              .filter(Boolean)
              .join(' · ') || 'Where from is not known'}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * What the team did, newest first, with each note in full. The history above
 * carries these too, in order with everything else; this is the place to read a
 * note without the rest around it.
 */
function TeamLog({ entries, now }: { entries: readonly LeadActivity[]; now: number }) {
  const [all, setAll] = React.useState(false);
  const sorted = React.useMemo(
    () => [...entries].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    [entries],
  );
  if (sorted.length === 0) {
    return <p className="text-sm text-text-muted">Nobody has logged anything yet.</p>;
  }
  const shown = all ? sorted : sorted.slice(0, LOG_FIRST);
  return (
    <div>
      <ul className="grid gap-3">
        {shown.map((a) => (
          <li key={a.id} className="min-w-0 text-sm [overflow-wrap:anywhere]">
            <p className="font-medium text-text">{activityLine(a, now)}</p>
            {a.note ? (
              <p className="mt-0.5 select-text whitespace-pre-wrap text-text-muted">{a.note}</p>
            ) : null}
            <p className="mt-0.5 text-xs text-text-subtle">
              {istStamp(a.at, now)}
              {a.byName ? ` · ${a.byName}` : ''}
            </p>
          </li>
        ))}
      </ul>
      {sorted.length > LOG_FIRST ? (
        <Button
          variant="ghost"
          size="sm"
          tone="brand"
          padding="none"
          align="start"
          className="mt-2"
          onClick={() => setAll((v) => !v)}
        >
          {all ? 'Show fewer' : `Show all ${sorted.length}`}
        </Button>
      ) : null}
    </div>
  );
}
