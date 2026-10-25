import {
  ArrowDownLeft,
  ArrowUpRight,
  AudioLines,
  BadgeCheck,
  BellOff,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  ClipboardPen,
  Headset,
  PenLine,
  Phone,
  PhoneCall,
  PhoneIncoming,
  Send,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { Button, ClampedText } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  actorPrefix,
  clockOf,
  fillOf,
  firstRows,
  foldLine,
  isWaitingForUs,
  storyRows,
  teamName,
  timelineActor,
  visitMeta,
  visitOf,
  visitPercent,
  type StoryRow,
} from '@/lib/leads';
import type { LeadContactSummary, LeadTimelineItem, LeadVisit } from '@dk/shared';

import { FilmBar, WrapChip } from './LeadCells';

/** One glyph per kind of thing that can happen, so the eye can run down the list before it reads it. */
const ICONS: Record<LeadTimelineItem['kind'], LucideIcon> = {
  film_visit: Clapperboard,
  campaign_sent: Send,
  whatsapp_in: ArrowDownLeft,
  whatsapp_out: ArrowUpRight,
  call_me: PhoneCall,
  callback: PhoneIncoming,
  registration: ClipboardPen,
  registration_call: Phone,
  client: BadgeCheck,
  assistant: Headset,
  opted_out: BellOff,
  activity: PenLine,
  call_recording: AudioLines,
};

/**
 * Shown first, counted in rows after the invite's steps are folded. The server
 * sends up to 150, newest first, and a phone does not want them all at once.
 */
const FIRST_ROWS = 10;

const ICON = { width: 13, height: 13, strokeWidth: 1.75 } as const;

/**
 * How a row looks, from who did it and what it was. Four of them are not about
 * who: a thing that did not go through, a stop request and an outlet are the
 * three the eye must catch, whoever did them.
 */
type Look = 'lead' | 'team' | 'failed' | 'stop' | 'outlet';

function lookOf(item: LeadTimelineItem): Look | 'system' {
  if (item.failed) return 'failed';
  if (item.kind === 'opted_out') return 'stop';
  if (item.kind === 'client') return 'outlet';
  return timelineActor(item);
}

/** The disc and the title of each look. The lead's is the loudest: a solid blue disc and a bold title. */
const LOOKS: Record<Look, { disc: string; title: string }> = {
  lead: { disc: 'bg-brand text-white', title: 'font-semibold text-text' },
  team: {
    disc: 'border border-border-strong bg-surface text-text-muted',
    title: 'font-medium text-text',
  },
  failed: { disc: 'bg-danger-soft text-danger-strong', title: 'font-medium text-text' },
  stop: { disc: 'bg-danger-soft text-danger-strong', title: 'font-semibold text-text' },
  outlet: { disc: 'bg-success text-white', title: 'font-semibold text-text' },
};

/**
 * The 24px column every row keeps, so the rail runs straight and the titles
 * line up. `relative` puts it above the rail, which is drawn by the row.
 */
function Disc({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The small grey dot an automatic row has in place of a disc: it keeps the column and the rail. */
function Dot() {
  return (
    <Disc>
      <span className="h-2 w-2 rounded-full bg-border-strong" />
    </Disc>
  );
}

function Time({ at }: { at: string }) {
  return (
    <time dateTime={at} className="shrink-0 pt-1 text-xs tabular-nums leading-4 text-text-subtle">
      {clockOf(at)}
    </time>
  );
}

/** The link to the page behind a row, for those that have one. Only an address inside the app. */
function OpenLink({ href }: { href: string | null }) {
  if (!href || !href.startsWith('/')) return null;
  return (
    <Link
      to={href}
      className="inline-flex min-h-11 items-center rounded-sm text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
    >
      Open
    </Link>
  );
}

/**
 * What happened with this person, as a story in days, newest first: what they
 * did in blue, what the team did in grey with a name, and what the system did by
 * itself small and quiet. The three that need an eye are red or green whoever
 * did them: something that did not go through, a stop request, an outlet. A row
 * for what they asked or wrote that nobody has answered says "Waiting for us".
 *
 * The server words each row and says who acted; this draws it. A film visit is
 * drawn from the visit behind it (its bar, its sound, its place and device),
 * found by its start time, and falls back to the server's words when none
 * matches. The team's notes arrive whole in `detail` and are read here: the
 * drawer has no other place for them.
 *
 * A row that has a page behind it links there. Every row starts, for a screen
 * reader, with who did it, because the colour says it only to those who can see.
 * `closed` leaves out "Waiting for us": a lead that is closed has been dealt with.
 */
export function LeadTimeline({
  items,
  visits,
  lastContact,
  now,
  closed = false,
}: {
  items: readonly LeadTimelineItem[];
  visits: readonly LeadVisit[];
  lastContact: LeadContactSummary | null;
  now: number;
  closed?: boolean;
}) {
  const [all, setAll] = React.useState(false);
  const days = React.useMemo(() => storyRows(items, now), [items, now]);
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">Nothing has happened yet.</p>;
  }
  const cut = firstRows(days, FIRST_ROWS);
  const shown = all ? days : cut.days;
  return (
    <div>
      <div className="grid gap-4">
        {shown.map((day, i) => (
          <div key={`${i}-${day.heading}`}>
            {day.heading ? (
              <h4 className="mb-2 text-xs font-semibold text-text-muted">{day.heading}</h4>
            ) : null}
            <ol>
              {day.rows.map((row, j) => (
                <li
                  key={rowKey(row, j)}
                  // The rail is each row's own line, from the middle of its disc to the
                  // middle of the next row's: continuous through the gap, and ending at the
                  // first and last discs instead of running past them.
                  className="relative flex min-w-0 gap-2.5 pb-3 before:absolute before:bottom-0 before:left-[11px] before:top-0 before:w-0.5 before:bg-border first:before:top-3 last:pb-0 last:before:bottom-auto last:before:h-3 only:before:hidden"
                >
                  {row.type === 'fold' ? (
                    <FoldRow items={row.items} />
                  ) : (
                    <ItemRow
                      item={row.item}
                      visits={visits}
                      lastContact={lastContact}
                      closed={closed}
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {cut.hidden > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          tone="brand"
          padding="none"
          align="start"
          className="mt-2"
          onClick={() => setAll((v) => !v)}
        >
          {all ? 'Show fewer' : `Show ${cut.hidden} earlier`}
        </Button>
      ) : null}
    </div>
  );
}

function rowKey(row: StoryRow, index: number): string {
  const first = row.type === 'fold' ? row.items[0] : row.item;
  return `${first?.at}-${first?.kind}-${index}`;
}

/** One thing that happened. The system's own steps are the quiet kind; every other look has a disc. */
function ItemRow({
  item,
  visits,
  lastContact,
  closed,
}: {
  item: LeadTimelineItem;
  visits: readonly LeadVisit[];
  lastContact: LeadContactSummary | null;
  closed: boolean;
}) {
  const look = lookOf(item);
  if (look === 'system') {
    return (
      <>
        <Dot />
        <AutoLine item={item} />
      </>
    );
  }
  const Icon = look === 'failed' ? TriangleAlert : (ICONS[item.kind] ?? PenLine);
  const visit = visitOf(item, visits);
  const waiting = !closed && isWaitingForUs(item, lastContact);
  const chip =
    look === 'failed' ? (
      <WrapChip tone="danger" strong>
        Did not go through
      </WrapChip>
    ) : look === 'stop' ? (
      <WrapChip tone="danger" strong>
        Stop list
      </WrapChip>
    ) : look === 'outlet' ? (
      <WrapChip tone="success" strong>
        Outlet
      </WrapChip>
    ) : waiting ? (
      <WrapChip tone="warning" strong>
        Waiting for us
      </WrapChip>
    ) : null;
  // What they wrote is quoted; everything else the server worded is plain detail.
  const quoted = item.kind === 'whatsapp_in' && !!item.detail;
  // Who on the team did it. A row that is red or green for what it is (a message that did
  // not go through) still says whose it was; one with no name kept says nothing, apart
  // from a plain team row, which reads "Someone at MDG".
  const byTeam = timelineActor(item) === 'team' && (look === 'team' || !!item.by?.trim());
  return (
    <>
      <Disc className={LOOKS[look].disc}>
        <Icon {...ICON} />
      </Disc>
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('min-w-0 pt-0.5 text-sm leading-5', LOOKS[look].title)}>
            <span className="sr-only">{actorPrefix(item)}</span>
            {item.title}
            {chip ? <span className="ml-1.5 inline-block align-middle">{chip}</span> : null}
          </p>
          <Time at={item.at} />
        </div>

        {byTeam ? (
          <p className="mt-0.5 text-xs text-text-muted">
            {teamName(item.by)}
            {item.href ? (
              <>
                {' · '}
                <OpenLink href={item.href} />
              </>
            ) : null}
          </p>
        ) : null}

        {visit ? (
          <div className="mt-1">
            <FilmBar
              percent={visitPercent(visit)}
              fill={fillOf(visitPercent(visit), visit.completed)}
              size="mini"
              showPercent
              valueText={`${visitPercent(visit)}% of the film`}
            />
            <p className="mt-1 text-xs text-text-muted">{visitMeta(visit)}</p>
          </div>
        ) : quoted ? (
          <p className="mt-1 select-text whitespace-pre-wrap border-l-2 border-info pl-2 text-sm text-text">
            {item.detail}
          </p>
        ) : item.detail && look === 'team' ? (
          // The padding and the tint sit on a wrapper: a clamp on a padded paragraph
          // lets the first line past the cut show in the padding. "Read more" is brand blue
          // elsewhere; on this tint that is under 4.5:1 in the dark theme, so it takes the
          // text colour here.
          <div className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 [&_button]:text-text [&_button]:underline">
            <ClampedText
              lines={3}
              moreLabel="Read more"
              lessLabel="Show less"
              className="select-text whitespace-pre-wrap text-sm text-text [overflow-wrap:anywhere]"
            >
              {item.detail}
            </ClampedText>
          </div>
        ) : item.detail ? (
          <p className="mt-0.5 select-text whitespace-pre-wrap text-sm text-text-muted">
            {item.detail}
          </p>
        ) : null}

        {!byTeam && item.href ? (
          <p className="text-xs text-text-muted">
            <OpenLink href={item.href} />
          </p>
        ) : null}
      </div>
    </>
  );
}

/** The system's own step: small and grey, its time on the right, what it carried (a campaign, a preview) beneath. */
function AutoLine({ item }: { item: LeadTimelineItem }) {
  return (
    <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 pt-0.5 text-xs leading-5 text-text-muted">
          <span className="sr-only">{actorPrefix(item)}</span>
          {item.title}
          <span aria-hidden> · Automatic</span>
        </p>
        <Time at={item.at} />
      </div>
      {item.detail ? (
        <p className="line-clamp-2 select-text whitespace-pre-wrap text-xs text-text-muted">
          {item.detail}
        </p>
      ) : null}
      {item.href ? (
        <p className="text-xs text-text-muted">
          <OpenLink href={item.href} />
        </p>
      ) : null}
    </div>
  );
}

/**
 * The invite's steps, sent, delivered and read, as the one line they amount to:
 * the newest, and how many came before it. It opens in place to show each, with
 * no animation.
 */
function FoldRow({ items }: { items: readonly LeadTimelineItem[] }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const Chevron = open ? ChevronDown : ChevronRight;
  const newest = items[0];
  return (
    <>
      <Dot />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-start justify-between gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0"
        >
          <span className="min-w-0 pt-0.5 text-xs leading-5 text-text-muted [overflow-wrap:anywhere]">
            <span className="sr-only">Automatic: </span>
            {foldLine(items)}
            <Chevron {...ICON} aria-hidden className="ml-1 inline-block align-[-2px]" />
          </span>
          {newest ? <Time at={newest.at} /> : null}
        </button>
        {open ? (
          <ul id={id} className="mt-1 grid gap-1.5">
            {items.map((it, i) => (
              <li key={`${it.at}-${i}`} className="flex min-w-0">
                <AutoLine item={it} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}
