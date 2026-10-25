import { Headphones, MessageCircle, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui';
import { ContactLinks } from '@/features/intake/ContactLinks';
import { cn } from '@/lib/cn';
import { phoneLabel } from '@/lib/intake';
import {
  DUE_REASON_LABELS,
  STATUS_TONE,
  chatHref,
  closedLine,
  dueLine,
  inviteLine,
  isClosed,
  lastCallLine,
  lastContactLine,
  leadName,
  noteLine,
  ownerLine,
  reachOutLine,
  sinceLine,
  statusLabel,
  triesLine,
  visitsLine,
  watchFill,
  watchLine,
  watchPercent,
} from '@/lib/leads';
import { LEAD_ORIGIN_LABELS, type LeadRow, type LeadWatch } from '@dk/shared';

import { IconLink } from './shared';

const LINK =
  'inline-flex min-h-11 items-center rounded-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0';

/**
 * A click on a link or button inside a row belongs to that control. The whole
 * row opens the lead's drawer, so without this the name, the number and the
 * WhatsApp icon would each open it as well as doing their own job.
 */
const stop = (e: React.MouseEvent) => e.stopPropagation();

/** Amber text for a thing the team should notice: the same pair `WrapChip` and `Badge` use. */
const WARN_TEXT = 'text-warning-strong md:text-warning';

/**
 * The chip colours. `table` is the shipped pairing: dark text below md, the plain
 * colour from md up. That pairing measures only 3.1 to 4.2:1 on its soft
 * background, so the drawer asks for `strong`, the dark text at every width.
 * `success` has the dark text in both: nothing in the table uses it.
 */
const CHIP_TONES = {
  info: {
    table: 'bg-info-soft text-info-strong md:text-info',
    strong: 'bg-info-soft text-info-strong',
  },
  warning: {
    table: 'bg-warning-soft text-warning-strong md:text-warning',
    strong: 'bg-warning-soft text-warning-strong',
  },
  danger: {
    table: 'bg-danger-soft text-danger-strong md:text-danger',
    strong: 'bg-danger-soft text-danger-strong',
  },
  success: {
    table: 'bg-success-soft text-success-strong',
    strong: 'bg-success-soft text-success-strong',
  },
} as const;

/**
 * A chip that wraps. `Badge` is one nowrap line of fixed height, which is right
 * for a status word and wrong for "Talked to the website assistant · 3 days ago"
 * in a 304px card: it would run out of the card and be clipped.
 *
 * `strong` is the drawer's: dark text at every width (see `CHIP_TONES`). `icon`
 * puts a small glyph before the words, for a chip that must not rest on colour
 * alone.
 */
export function WrapChip({
  tone = 'info',
  strong = false,
  icon: Icon,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  strong?: boolean;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'max-w-full rounded-md px-2 py-0.5 text-xs font-medium [overflow-wrap:anywhere]',
        Icon ? 'inline-flex items-start gap-1' : 'inline-block',
        CHIP_TONES[tone][strong ? 'strong' : 'table'],
      )}
    >
      {Icon ? (
        <Icon width={13} height={13} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
      ) : null}
      {Icon ? <span className="min-w-0">{children}</span> : children}
    </span>
  );
}

/** How tall and how long a film bar is, for the three places one is drawn. */
const BAR_SIZES = {
  /** A visit's own row on the timeline. */
  mini: 'h-1.5 max-w-[12rem]',
  /** The table: thin, and no wider than a column holds. */
  sm: 'h-1.5 max-w-[16rem]',
  /** The drawer's card: the whole width there is. */
  lg: 'h-2',
} as const;

/**
 * The bar itself: a track and a fill, green once most of the film was watched
 * and blue before that, with the figure beside it when asked. Hand-drawn, as the
 * slip upload's is: there is no progress-bar primitive yet. The figure is always
 * plain text, so the fill's colour is never the only thing that says how far.
 */
export function FilmBar({
  percent,
  fill,
  size,
  showPercent = false,
  valueText,
  className,
}: {
  percent: number;
  fill: 'success' | 'brand';
  size: keyof typeof BAR_SIZES;
  showPercent?: boolean;
  valueText: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        role="progressbar"
        aria-label="How much of the film they watched"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={valueText}
        className={cn(
          'w-full min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2',
          BAR_SIZES[size],
        )}
      >
        <div
          className={cn('h-full rounded-full', fill === 'success' ? 'bg-success' : 'bg-brand')}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showPercent ? (
        <span
          aria-hidden
          className={cn(
            'shrink-0 tabular-nums text-text',
            size === 'lg' ? 'text-sm font-semibold' : 'text-xs font-medium',
          )}
        >
          {percent}%
        </span>
      ) : null}
    </div>
  );
}

/**
 * How much of the film they watched, as the line and a thin bar under it.
 * `withVisits` false leaves the visit count out of the line, for the table,
 * which prints it on the next line with when they last watched. `size` `lg` is
 * the drawer's: the line in body text, a thicker bar across the whole width and
 * (with `showPercent`) the figure beside it; `sm`, the default, is the table's.
 */
export function WatchBar({
  watch,
  withVisits = true,
  size = 'sm',
  showPercent = false,
  className,
}: {
  watch: LeadWatch;
  withVisits?: boolean;
  size?: 'sm' | 'lg';
  showPercent?: boolean;
  className?: string;
}) {
  const percent = watchPercent(watch);
  const text = watchLine(watch, withVisits);
  const textClass = size === 'lg' ? 'text-sm text-text' : 'text-xs text-text-muted';
  // No visit tied to them (a call-back from the film page): an empty bar would
  // read as "watched nothing", which nobody knows.
  if (watch.visits === 0) return <p className={cn(textClass, className)}>{text}</p>;
  return (
    <div className={className}>
      <p className={textClass}>{text}</p>
      <FilmBar
        percent={percent}
        fill={watchFill(watch)}
        size={size}
        showPercent={showPercent}
        valueText={text}
        className="mt-1"
      />
    </div>
  );
}

/**
 * The first column of a lead's row: who they are, how to reach them, where they
 * are and when they became a lead, and how they came to us.
 *
 * On a desktop row the name is a link into the drawer (what a keyboard reaches;
 * the rest of the row is a mouse's), the number dials, and a small WhatsApp icon
 * opens their chat when there is one. A phone card is one big button that opens
 * the drawer, and a link or button cannot sit inside a button: there the name
 * and the number are plain text, and the drawer has every way to reach them.
 */
export function LeadWhoCell({
  lead,
  openHref,
  now,
  onPhone,
}: {
  lead: LeadRow;
  openHref: string;
  now: number;
  onPhone: boolean;
}) {
  const name = leadName(lead);
  const since = sinceLine(lead.firstSeenAt, now);
  const chat = lead.hasChat ? chatHref(lead.waId) : null;
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {onPhone ? (
          <span className="text-sm font-semibold text-text">{name}</span>
        ) : (
          <Link
            replace
            to={openHref}
            onClick={stop}
            className={cn(LINK, 'text-sm font-semibold text-text no-underline hover:underline')}
          >
            {name}
          </Link>
        )}
        <span className="select-text text-xs tabular-nums text-text-subtle">{lead.ref}</span>
      </div>
      {lead.phone ? (
        onPhone ? (
          <p className="select-text text-sm tabular-nums text-text-subtle">
            {phoneLabel(lead.phone)}
          </p>
        ) : (
          // Shrink-wrapped, so a click beside the number still opens the row.
          <div className="flex w-fit max-w-full items-center gap-1" onClick={stop}>
            <ContactLinks mobile={lead.phone} />
            {chat ? (
              <IconLink to={chat} label={`WhatsApp ${name}`} onClick={stop}>
                <MessageCircle width={16} height={16} strokeWidth={1.75} aria-hidden />
              </IconLink>
            ) : null}
          </div>
        )
      ) : (
        <p className="text-sm text-text-subtle">No number yet</p>
      )}
      {lead.place ? <p className="mt-0.5 select-text text-sm text-text-muted">{lead.place}</p> : null}
      {since ? <p className="mt-0.5 text-xs text-text-subtle">{since}</p> : null}
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-muted">
        <Badge>{LEAD_ORIGIN_LABELS[lead.origin]}</Badge>
        {lead.origin === 'share_link' && lead.linkLabel ? <span>“{lead.linkLabel}”</span> : null}
      </p>
    </div>
  );
}

/**
 * The second column: how interested they are. How much of the film they
 * watched, how often and when last, what became of the WhatsApp invite, and the
 * newest thing they did to reach us. A lead that was never sent an invite (a
 * call-back from the film page) shows only what it did.
 */
export function LeadInterestCell({ lead, now }: { lead: LeadRow; now: number }) {
  const visits = visitsLine(lead.watch, now);
  const invite = inviteLine(lead, now);
  // A closed lead has been dealt with: a chip saying "they are waiting" is wrong.
  const sign = isClosed(lead.status) ? null : reachOutLine(lead, now);
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <WatchBar watch={lead.watch} withVisits={false} />
      {visits ? <p className="mt-1 text-xs text-text-muted">{visits}</p> : null}
      {invite ? (
        <p
          className={cn(
            'mt-1 text-xs',
            lead.invite?.delivery === 'failed' ? WARN_TEXT : 'text-text-muted',
          )}
        >
          {invite}
        </p>
      ) : null}
      {sign ? (
        <p className="mt-1.5">
          <WrapChip>{sign}</WrapChip>
        </p>
      ) : null}
    </div>
  );
}

/**
 * The third column: where it stands. The status, how soon the next follow-up is
 * (red once late, amber inside two hours, plain after that, always in words
 * too), the last contact and the tries that got no answer, the newest note the
 * team wrote, how the last recorded call went (its gist in two lines, with a
 * badge for how keen they sounded), and who owns it. A lead nobody has been in touch with says so in
 * amber. A closed lead says who closed it and when; a registered one says
 * Onboarding has it.
 *
 * On a phone card there is no link to Onboarding (a button cannot hold one);
 * the drawer has it.
 */
export function LeadStandsCell({
  lead,
  now,
  onPhone,
}: {
  lead: LeadRow;
  now: number;
  onPhone: boolean;
}) {
  const closed = isClosed(lead.status);
  const due = dueLine(lead, now);
  const last = lastContactLine(lead.lastContact, now);
  const tries = triesLine(lead.unanswered);
  const note = noteLine(lead.lastNote, now);
  // A server one release behind sends no `lastCall`; there is then nothing to say.
  const call = lastCallLine(lead.lastCall);
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
          Onboarding has them.
          {onPhone ? null : (
            <>
              {' '}
              <Link to="/onboarding" onClick={stop} className={cn(LINK, 'text-brand')}>
                Open Onboarding
              </Link>
            </>
          )}
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

      {last ? (
        <p className="mt-1 text-xs text-text-muted">{last}</p>
      ) : closed || lead.status === 'registered' ? (
        // Grey, not the warning colour: a closed lead is over, and a registered one
        // is Onboarding's to call — the line above already says so.
        <p className="mt-1 text-xs text-text-subtle">Never contacted</p>
      ) : (
        <p className={cn('mt-1 text-xs font-medium', WARN_TEXT)}>Not contacted yet</p>
      )}
      {tries ? <p className="mt-1 text-xs text-text-muted">{tries}</p> : null}
      {note ? (
        <div className="mt-1.5 text-xs">
          {/* Two lines of the words, and the name and the time always whole under
              them: a long note is read in the drawer, but who wrote it is not. */}
          <p className="line-clamp-2 select-text text-text">{note.quote}</p>
          {note.by ? <p className="mt-0.5 text-text-subtle">— {note.by}</p> : null}
        </div>
      ) : null}
      {call ? (
        <div className="mt-1.5 flex items-start gap-1.5 text-xs">
          <Headphones
            width={13}
            height={13}
            strokeWidth={1.75}
            aria-hidden
            className="mt-0.5 shrink-0 text-text-subtle"
          />
          {/* Two lines of what the call came to; the badge beside it is how keen they sounded. */}
          <p className="line-clamp-2 min-w-0 flex-1 select-text text-text">{call.text}</p>
          <Badge intent={call.tone}>{call.label}</Badge>
        </div>
      ) : null}
      {closed ? null : <p className="mt-1 text-xs text-text-subtle">{ownerLine(lead.owner)}</p>}
    </div>
  );
}
