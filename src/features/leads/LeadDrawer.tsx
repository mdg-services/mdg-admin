import {
  AlarmClock,
  AlertCircle,
  Archive,
  BellOff,
  BellRing,
  CheckCircle2,
  Clapperboard,
  ClipboardPen,
  Headset,
  MessageCircle,
  PhoneCall,
  PhoneIncoming,
  Send,
  Snowflake,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  ClampedText,
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
  STATUS_TONE,
  devicesNote,
  doNowDetail,
  doNowTone,
  drawerSubtitle,
  inviteLine,
  isClosed,
  lastContactLine,
  lastWatchedLine,
  leadName,
  noteByLine,
  noteLine,
  originText,
  ownerLine,
  registrationWords,
  statusLabel,
  theyDid,
  triesLine,
  type DoNowTone,
} from '@/lib/leads';
import { dealerCodeLabel } from '@dk/shared';
import type { LeadDetail, LeadRow, LeadSignKind } from '@dk/shared';

import { CallRecordings } from './CallRecordings';
import { LeadDrawerActions } from './LeadActions';
import { WatchBar, WrapChip } from './LeadCells';
import { LeadTimeline } from './LeadTimeline';
import type { LeadActionHandler } from './shared';

const LINK =
  'inline-flex min-h-11 select-text items-center rounded-sm text-brand underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-0';

/** The glyph in front of what they did, so the chip says it in a shape as well as in words. */
const SIGN_ICONS: Record<LeadSignKind, LucideIcon> = {
  watched: Clapperboard,
  replied: MessageCircle,
  call_me: PhoneCall,
  callback: PhoneIncoming,
  assistant: Headset,
  registered: ClipboardPen,
};

/**
 * The "do this now" panel's look for each tone, and what each one means:
 * red is late, amber is waiting on us, blue is on track, grey is nothing to do.
 * Words inside a tinted panel are the dark `-strong` shade (the soft fills do
 * not change in the dark theme, so a lighter shade would not read on them).
 */
const DO_NOW: Record<DoNowTone, { box: string; sub: string; icon: LucideIcon }> = {
  danger: {
    box: 'border-danger bg-danger-soft text-danger-strong',
    sub: '',
    icon: AlarmClock,
  },
  warning: {
    box: 'border-warning bg-warning-soft text-warning-strong',
    sub: '',
    icon: BellRing,
  },
  // `text-text` all through: the muted grey on this blue fill is under 4.5:1 in the dark theme.
  brand: { box: 'border-brand bg-brand-soft text-text', sub: '', icon: PhoneCall },
  quiet: {
    box: 'border-border-strong bg-surface-2 text-text',
    sub: 'text-text-muted',
    icon: CheckCircle2,
  },
};

/**
 * One lead in full: where it stands and what to do next, every action as a
 * button, a card of how they watched the film and who has been in touch, the
 * recordings of the team's calls with their summaries, what we know about them,
 * and the story of everything that has happened, from every source.
 *
 * Opened by `?lead=<id>` on the Leads page, so the link the three lead alerts
 * carry lands here. It fetches the lead itself rather than being handed a row
 * from the list, because that lead need not be on the tab the list is showing.
 * `id` is the lead to show; `null` is closed.
 *
 * The actions sit near the top, as buttons that wrap: the phone shell has no
 * address bar and no right click, so nothing here waits behind a gesture. Every
 * form they open is mounted by the page (`LeadDialogs`) and stacks over this
 * drawer.
 *
 * Colour means one thing wherever it appears here. Blue is something THEY did.
 * Amber is waiting on US. Red is a problem: late, going cold, failed, stopped.
 * Green is going well. A grey ring and a name is the team; a small grey dot is
 * the system by itself. No colour is the only signal: each carries a word or a
 * shape.
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
      description={d ? drawerSubtitle(d.lead, now) : undefined}
    >
      {q.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : d ? (
        // One body per lead: the page can swap the open lead without closing the drawer, and
        // what was unfolded for the last one (earlier steps, a long note) must not carry over.
        <LeadBody key={d.lead.id} detail={d} now={now} onAction={onAction} />
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

/** A section below the card: a plain heading with an optional count, set off by a rule. */
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-2 text-sm font-semibold text-text">
        {title}
        {count === undefined ? null : (
          <span className="font-normal text-text-muted"> · {count}</span>
        )}
      </h3>
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
  const { lead, visits, timeline, nextStep } = detail;
  const closed = isClosed(lead.status);
  const aboutThem = facts(lead, now);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Badge intent={STATUS_TONE[lead.status]}>{statusLabel(lead.status)}</Badge>
        {lead.cold && !closed ? (
          <Badge intent="danger">
            <Snowflake width={12} height={12} strokeWidth={1.75} aria-hidden className="mr-1" />
            Going cold
          </Badge>
        ) : null}
        {lead.optedOut ? (
          <Badge intent="danger">
            <BellOff width={12} height={12} strokeWidth={1.75} aria-hidden className="mr-1" />
            On the stop list
          </Badge>
        ) : null}
        <span className="inline-flex items-center gap-1.5 text-sm text-text-muted md:ml-auto">
          <UserRound width={14} height={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
          {ownerLine(lead.owner)}
        </span>
      </div>

      <DoNowPanel lead={lead} nextStep={nextStep} now={now} />

      <LeadDrawerActions lead={lead} onAction={onAction} />

      <WhereItStands lead={lead} now={now} />

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
        {/* Stacked below md, not `inlineBelowMd`: that puts label and value on one line, and
            a long value (the registration sentence, a campaign name) crushes the label. */}
        <div className="grid gap-2 md:gap-3">
          <KeyValueList items={aboutThem.short} columnsAtMd={2} labelWidth="96px" />
          {aboutThem.long.length > 0 ? (
            <KeyValueList items={aboutThem.long} labelWidth="96px" />
          ) : null}
        </div>
      </Section>

      <Section title="What happened" count={timeline.length}>
        <LeadTimeline
          items={timeline}
          visits={visits}
          lastContact={lead.lastContact}
          now={now}
          closed={closed}
        />
      </Section>
    </div>
  );
}

/**
 * What to do about this lead now, in the colour of how urgent it is. The
 * sentence is the server's (so the alert, the digest and this say the same);
 * under it, when the next follow-up is, who closed it, or that Onboarding has it.
 */
function DoNowPanel({ lead, nextStep, now }: { lead: LeadRow; nextStep: string; now: number }) {
  const tone = DO_NOW[doNowTone(lead, now)];
  const line = doNowDetail(lead, nextStep, now);
  // A tick says "done well", which is not what "not interested" or "wrong number" is:
  // only an outlet keeps it, and the other closed leads take a plain archive box.
  const Icon = isClosed(lead.status) && lead.status !== 'client' ? Archive : tone.icon;
  return (
    <div className={cn('flex gap-2.5 rounded-md border-l-4 px-3 py-2.5', tone.box)}>
      <Icon width={18} height={18} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <p className="text-sm font-semibold leading-snug md:text-base">{nextStep}</p>
        {line ? <p className={cn('mt-0.5 text-xs', tone.sub)}>{line}</p> : null}
      </div>
    </div>
  );
}

/** A labelled row of the "Where it stands" card: the label beside the value from md, above it below. */
function StandRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 md:grid-cols-[3.5rem_minmax(0,1fr)] md:gap-3">
      <dt className="text-xs font-semibold text-text-muted md:pt-0.5">{label}</dt>
      <dd className="grid min-w-0 gap-1.5 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/**
 * Where it stands, in three rows. THEY: what they did to reach us that nobody
 * has answered, and how much of the film they watched, with the figure. WE: who
 * was last in touch, whether anybody has been, and how the WhatsApp invite
 * fared. NOTE: the newest note the team wrote, so a call starts from what was
 * agreed. A fact that is not known is left out, never printed as "none".
 */
function WhereItStands({ lead, now }: { lead: LeadRow; now: number }) {
  const they = theyDid(lead, now);
  const SignIcon = they ? SIGN_ICONS[they.kind] : null;
  const lastWatched = lastWatchedLine(lead.watch, now);
  const devices = devicesNote(lead.watch.devices);
  const last = lastContactLine(lead.lastContact, now);
  const tries = triesLine(lead.unanswered);
  const invite = inviteLine(lead, now);
  const inviteFailed = lead.invite?.delivery === 'failed';
  const note = noteLine(lead.lastNote, now);
  // Amber says "waiting on us": not true of a lead that is closed, or that Onboarding has.
  const waiting = doNowTone(lead, now) !== 'quiet';
  return (
    <dl className="grid gap-3 rounded-md border border-border bg-surface p-3">
      <StandRow label="They">
        {they && SignIcon ? (
          <p>
            <WrapChip tone={they.tone} strong icon={SignIcon}>
              {they.text}
            </WrapChip>
          </p>
        ) : null}
        <WatchBar watch={lead.watch} size="lg" showPercent />
        {lastWatched ? <p className="text-xs text-text-muted">{lastWatched}</p> : null}
        {devices ? <p className="text-xs text-text-muted">{devices}</p> : null}
      </StandRow>

      <StandRow label="We">
        {last ? (
          <p className="text-sm text-text">{last}</p>
        ) : waiting ? (
          // Plain, not a chip: the panel above is already amber or red for this very reason.
          <p className="flex items-start gap-1.5 text-sm font-semibold text-text">
            <AlertCircle
              width={14}
              height={14}
              strokeWidth={1.75}
              aria-hidden
              className="mt-1 shrink-0 text-text-muted"
            />
            <span className="min-w-0">Nobody has been in touch yet</span>
          </p>
        ) : (
          <p className="text-sm text-text">Nobody has been in touch yet</p>
        )}
        {tries ? <p className="text-xs text-text-muted">{tries}</p> : null}
        {invite ? (
          inviteFailed ? (
            <p>
              <WrapChip tone="danger" strong icon={TriangleAlert}>
                {invite}
              </WrapChip>
            </p>
          ) : (
            <p className="flex items-start gap-1.5 text-xs text-text-muted">
              <Send
                width={14}
                height={14}
                strokeWidth={1.75}
                aria-hidden
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0">{invite}</span>
            </p>
          )
        ) : null}
      </StandRow>

      {note && lead.lastNote ? (
        <StandRow label="Note">
          <ClampedText
            lines={3}
            moreLabel="Read more"
            lessLabel="Show less"
            className="select-text whitespace-pre-wrap border-l-2 border-border-strong pl-2.5 text-sm text-text [overflow-wrap:anywhere]"
          >
            {lead.lastNote.text.trim()}
          </ClampedText>
          <p className="text-xs text-text-muted">{noteByLine(lead.lastNote, now)}</p>
        </StandRow>
      ) : null}
    </dl>
  );
}

/**
 * "About them": only the facts that do not change from one hour to the next.
 * What they did and when, and when to call next, are in the card and the panel
 * above, where they are read first.
 *
 * In two lists: the short facts sit two to a row at md, and the ones that run to
 * a sentence (where they came from, the registration, the stop-list note) take
 * the whole width, because squeezed into half of it they wrap to four or five lines.
 */
function facts(lead: LeadRow, now: number): { short: KeyValueItem[]; long: KeyValueItem[] } {
  const short: KeyValueItem[] = [];
  const long: KeyValueItem[] = [];

  short.push({
    key: 'number',
    label: 'Number',
    value: lead.phone ? (
      <ContactLinks mobile={lead.phone} />
    ) : (
      <span className="text-text-muted">None yet. Add it from the buttons above.</span>
    ),
  });
  if (lead.place) short.push({ key: 'place', label: 'Place', value: lead.place });
  long.push({
    key: 'origin',
    label: 'Came from',
    value: [originText(lead), lead.campaign].filter(Boolean).join(' · '),
  });
  short.push({
    key: 'first',
    label: 'First seen',
    value: istStamp(lead.firstSeenAt, now) || '—',
  });

  if (lead.registration) {
    long.push({
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
    short.push({
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
    long.push({
      key: 'stop',
      label: 'WhatsApp',
      value: 'On the stop list. No promotion goes to them.',
    });
  }
  return { short, long };
}
