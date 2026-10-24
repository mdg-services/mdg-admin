import * as React from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui';
import { ContactLinks } from '@/features/intake/ContactLinks';
import { cn } from '@/lib/cn';
import {
  DUE_REASON_LABELS,
  STATUS_TONE,
  closedLine,
  dueLine,
  isClosed,
  lastContactLine,
  leadName,
  ownerLine,
  signLine,
  statusLabel,
  watchLine,
  watchPercent,
} from '@/lib/leads';
import { LEAD_ORIGIN_LABELS, type LeadRow, type LeadWatch } from '@dk/shared';

const LINK =
  'inline-flex min-h-11 items-center rounded-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0';

/**
 * A chip that wraps. `Badge` is one nowrap line of fixed height, which is right
 * for a status word and wrong for "Talked to the website assistant · 3 days ago"
 * in a 304px card: it would run out of the card and be clipped.
 */
export function WrapChip({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-block max-w-full rounded-md px-2 py-0.5 text-xs font-medium [overflow-wrap:anywhere]',
        tone === 'info' && 'bg-info-soft text-info-strong md:text-info',
        tone === 'warning' && 'bg-warning-soft text-warning-strong md:text-warning',
        tone === 'danger' && 'bg-danger-soft text-danger-strong md:text-danger',
      )}
    >
      {children}
    </span>
  );
}

/** How much of the film they watched, as the line and a thin bar under it. */
export function WatchBar({ watch }: { watch: LeadWatch }) {
  const percent = watchPercent(watch);
  const text = watchLine(watch);
  // No visit tied to them (a call-back from the film page): an empty bar would
  // read as "watched nothing", which nobody knows.
  if (watch.visits === 0) return <p className="mt-1.5 text-xs text-text-muted">{text}</p>;
  return (
    <div className="mt-1.5">
      <p className="text-xs text-text-muted">{text}</p>
      {/* Hand-drawn, as the slip upload's is: there is no progress-bar primitive yet. */}
      <div
        role="progressbar"
        aria-label="How much of the film they watched"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={text}
        className="mt-1 h-1.5 w-full max-w-[16rem] overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/**
 * The left half of a lead's row: who they are, how to reach them, where they
 * came from and how much of the film they watched. The name opens the drawer;
 * the number is a link that opens the dialler.
 */
export function LeadWhoCell({ lead, openHref }: { lead: LeadRow; openHref: string }) {
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          replace
          to={openHref}
          className={cn(LINK, 'text-sm font-semibold text-text no-underline hover:underline')}
        >
          {leadName(lead)}
        </Link>
        <span className="select-text text-xs tabular-nums text-text-subtle">{lead.ref}</span>
      </div>
      {lead.phone ? (
        <ContactLinks mobile={lead.phone} />
      ) : (
        <p className="text-sm text-text-subtle">No number yet</p>
      )}
      {lead.place ? <p className="mt-0.5 select-text text-sm text-text-muted">{lead.place}</p> : null}
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-muted">
        <Badge>{LEAD_ORIGIN_LABELS[lead.origin]}</Badge>
        {lead.origin === 'share_link' && lead.linkLabel ? <span>“{lead.linkLabel}”</span> : null}
      </p>
      <WatchBar watch={lead.watch} />
    </div>
  );
}

/**
 * The right half: where it stands. The status, how soon the next follow-up is
 * (red once late, amber inside two hours, plain after that, always in words
 * too), the last contact, anything they did since, and who owns it. A closed
 * lead says who closed it and when; a registered one says Onboarding has it.
 */
export function LeadStandsCell({ lead, now }: { lead: LeadRow; now: number }) {
  const closed = isClosed(lead.status);
  const due = dueLine(lead, now);
  const last = lastContactLine(lead.lastContact, now);
  const sign = closed ? null : signLine(lead.lastSign, lead.lastContact, now);
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge intent={STATUS_TONE[lead.status]}>{statusLabel(lead.status)}</Badge>
        {lead.cold && !closed ? (
          <Badge intent="danger">Going cold</Badge>
        ) : null}
        {lead.optedOut ? <Badge intent="danger">On the stop list</Badge> : null}
      </div>

      {closed ? (
        <p className="mt-1 text-xs text-text-muted">{closedLine(lead, now)}</p>
      ) : lead.status === 'registered' && !lead.nextDueAt ? (
        <p className="mt-1 text-sm text-text-muted">
          Onboarding has them.{' '}
          <Link to="/onboarding" className={cn(LINK, 'text-brand')}>
            Open Onboarding
          </Link>
        </p>
      ) : due ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          <span className="text-text-subtle">Next:</span>
          {due.tone === 'neutral' ? (
            <span className="font-medium text-text">{due.text}</span>
          ) : (
            <Badge intent={due.tone}>{due.text}</Badge>
          )}
          {lead.dueReason ? (
            <span className="text-xs text-text-subtle">· {DUE_REASON_LABELS[lead.dueReason]}</span>
          ) : null}
        </p>
      ) : null}

      {last ? <p className="mt-1 text-xs text-text-muted">{last}</p> : null}
      {sign ? (
        <p className="mt-1">
          <WrapChip>{sign}</WrapChip>
        </p>
      ) : null}
      {closed ? null : <p className="mt-1 text-xs text-text-subtle">{ownerLine(lead.owner)}</p>}
    </div>
  );
}
