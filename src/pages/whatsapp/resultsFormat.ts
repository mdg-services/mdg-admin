import { formatDateTime, formatInrWhole } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import type {
  WhatsAppResultCounts,
  WhatsAppResultOutcome,
  WhatsAppResultPerson,
  WhatsAppResultSend,
} from '@dk/shared';

/**
 * The words the Message results page prints. Kept apart from the page so the
 * page reads as layout; the admin has no test runner, and these are the parts
 * that would want one.
 */

/** "2 of 3 · 67%". A whole of 0 prints just the part. */
export function ofLine(part: number, whole: number): string {
  if (whole <= 0) return String(part);
  return `${part} of ${whole} · ${Math.round((part / whole) * 100)}%`;
}

/** "1 person", "1,101 people" — Indian grouping. */
export const plural = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

export const OUTCOME_WORDS: Record<WhatsAppResultOutcome, { label: string; intent: Intent }> = {
  opened: { label: 'Opened', intent: 'success' },
  reached: { label: 'Reached, not opened', intent: 'neutral' },
  waiting: { label: 'Not on the phone yet', intent: 'info' },
  held_back: { label: 'Held back by WhatsApp', intent: 'warning' },
  not_delivered: { label: 'Did not arrive', intent: 'danger' },
};

/** Meta's "message undeliverable": most often a number that is not on WhatsApp. */
const UNDELIVERABLE_CODE = 131026;

/** The person's badge: "Did not arrive" says why when WhatsApp's reason is the usual one. */
export function outcomeLabel(p: WhatsAppResultPerson): string {
  if (p.outcome === 'not_delivered' && p.failureCode === UNDELIVERABLE_CODE)
    return 'Not on WhatsApp?';
  return OUTCOME_WORDS[p.outcome].label;
}

/**
 * What one promotion costs once it reaches a phone: Meta's ₹0.8631 for a
 * marketing message in India, plus 18% GST. Read off published rate pages in
 * October 2026, not Meta's own rate card, so the page says "about". Held back
 * and undelivered messages are not charged.
 */
export const RUPEES_PER_PROMOTION = 1.02;

export const costLabel = (reached: number): string =>
  `≈ ${formatInrWhole(reached * RUPEES_PER_PROMOTION)}`;

/**
 * Outlets, when one has several numbers: a list made from an outlet sheet
 * names every number after its outlet, so people who share a name are one
 * outlet. An outlet is reached when any of its numbers is. Nameless people
 * count one each.
 */
export function outletsOf(people: readonly WhatsAppResultPerson[]): {
  outlets: number;
  reached: number;
} {
  const reached = new Map<string, boolean>();
  for (const p of people) {
    const key = p.name?.trim().toLowerCase() || `person:${p.person}`;
    const got = p.outcome === 'opened' || p.outcome === 'reached';
    reached.set(key, (reached.get(key) ?? false) || got);
  }
  return { outlets: reached.size, reached: [...reached.values()].filter(Boolean).length };
}

/** "Modak Automobiles, Gem Motors and 3 more". */
export function namesLine(people: readonly WhatsAppResultPerson[], max = 3): string {
  const names = people.map((p) => p.name ?? p.phone ?? 'Someone');
  if (names.length <= max) {
    return names.length <= 1
      ? (names[0] ?? '')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/** The film meter's caption: who watched, and for how long, while that is a few people. */
export function filmWatchLine(
  people: readonly WhatsAppResultPerson[],
  c: WhatsAppResultCounts,
): string {
  const tapped = people.filter((p) => p.linkTaps > 0);
  if (tapped.length === 0) return 'Nobody has opened it yet.';
  const twice =
    c.tappedLinkTwice > 0
      ? ` · ${plural(c.tappedLinkTwice, 'person', 'people')} opened it 2+ times`
      : '';
  if (tapped.length > 3) return `${plural(c.linkTaps, 'open', 'opens')} in all${twice}`;
  const who = tapped
    .map((p) => {
      const name = p.name ?? p.phone ?? 'Someone';
      return p.watchedSeconds ? `${name} watched ${secondsLabel(p.watchedSeconds)}` : name;
    })
    .join(' · ');
  return `${who}${twice}`;
}

/** One line of "Did not reach them": what, how many, and what it means. */
export interface MissedRow {
  label: string;
  value: number;
  note: string;
}

/** Where the messages that did not reach a phone went, largest cause first; empty rows left out. */
export function missedRows(c: WhatsAppResultCounts): MissedRow[] {
  const otherReason = c.notDelivered - c.notOnWhatsApp;
  const rows: MissedRow[] = [
    {
      label: 'Held back by WhatsApp',
      value: c.heldBack,
      note: 'Its limit on promotions per person. Not charged. The film tool sends it again 6 days later.',
    },
    {
      label: 'Could not be delivered',
      value: c.notDelivered,
      note:
        otherReason === 0
          ? 'Probably not on WhatsApp. Not charged.'
          : c.notOnWhatsApp === 0
            ? "Not charged. Hover the person's badge for WhatsApp's reason."
            : `${c.notOnWhatsApp} probably not on WhatsApp, ${otherReason} for another reason. Not charged.`,
    },
    {
      label: 'Not on the phone yet',
      value: c.waiting,
      note: 'Usually a phone that is off. It can still arrive.',
    },
  ];
  return rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
}

/** The people list's filter. */
export type PeopleFilter = 'all' | 'opened' | 'call' | 'missed';

export function inFilter(p: WhatsAppResultPerson, f: PeopleFilter): boolean {
  if (f === 'opened') return p.outcome === 'opened';
  if (f === 'call') return p.askedCall;
  if (f === 'missed') return p.outcome !== 'opened' && p.outcome !== 'reached';
  return true;
}

/** How long a typical open took: "Under a minute", "12 min", "3 h 5 min". */
export function minutesLabel(min: number | null): string {
  if (min === null) return '—';
  if (min < 1) return 'Under a minute';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  if (h >= 48) return `${Math.round(h / 24)} days`;
  const m = Math.round(min - h * 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** A film invite, Hindi or Hinglish: the film is what it carries, not words. */
export const isFilmSend = (s: WhatsAppResultSend): boolean => s.kind.startsWith('Film invite');

const DAY_FMT = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Kolkata',
});
/** "4 Nov", in Indian time. */
export const shortDay = (iso: string): string => DAY_FMT.format(new Date(iso));

/** 1,553 — Indian grouping. */
export const count = (n: number): string => n.toLocaleString('en-IN');

/**
 * Which day of its campaign a send was, or what it was when it is not one:
 * "First send · 29 Oct", "Sent again · 31 Oct", "More of the list · 4 Nov",
 * “Aapke request…”, "Account ready". No place and no count.
 */
export function partTitle(s: WhatsAppResultSend): string {
  const day = shortDay(s.firstSentAt);
  switch (s.part) {
    case 'first':
      return `First send · ${day}`;
    case 'later':
      return `${s.sentAgain === 0 ? 'More of the list' : 'Sent again'} · ${day}`;
    case 'total':
      // A campaign that went on one day is its own total: that day names it.
      if (!s.campaign) return 'All messages';
      return day === shortDay(s.lastSentAt) ? day : 'All tries';
    default:
      if (s.hasWords) return `“${s.label.length > 48 ? `${s.label.slice(0, 47).trimEnd()}…` : s.label}”`;
      return s.label.startsWith('Words not saved') ? 'Words not saved' : s.kind;
  }
}

/**
 * A send in a few words: a campaign's place first ("Noida · sent again · 31
 * Oct"), the app's own messages by their kind ("Account ready"), a message the
 * team wrote by its day and words.
 */
export function sendTitle(s: WhatsAppResultSend): string {
  const part = partTitle(s);
  if (s.campaign) return `${s.group} · ${part.charAt(0).toLowerCase()}${part.slice(1)}`;
  if (s.part === 'total') return s.group;
  return part === s.group ? part : `${shortDay(s.firstSentAt)} · ${part}`;
}

/** Who a send reached, by count: numbers for a campaign, people for the rest. */
export function audienceLine(s: WhatsAppResultSend): string {
  const c = s.counts;
  const who = s.campaign ? plural(c.people, 'number', 'numbers') : plural(c.people, 'person', 'people');
  return c.sent > c.people ? `${plural(c.sent, 'message', 'messages')} to ${who}` : who;
}

/** One line in the message picker. The closed picker shows only this, so it names its group. */
export function sendOption(s: WhatsAppResultSend): string {
  const c = s.counts;
  if (s.campaign) {
    const head = `${sendTitle(s)} · ${count(c.people)} ${c.people === 1 ? 'number' : 'numbers'}`;
    if (s.part === 'first' && s.sentAgain > 0) return `${head} · ${count(s.sentAgain)} tried twice that day`;
    if (s.part === 'later' && s.sentAgain > 0 && s.sentAgain < c.sent)
      return `${head} · ${count(c.sent - s.sentAgain)} of them new`;
    if (s.part === 'total' && s.sentAgain > 0) return `${head} · ${count(s.sentAgain)} re-sends`;
    return head;
  }
  if (s.part === 'total') return `${s.group} · all ${plural(c.sent, 'message', 'messages')}`;
  return `${sendTitle(s)} · ${audienceLine(s)}`;
}

/** The heading a send's group gets in the picker: a place says when it began. */
export function groupLabel(s: WhatsAppResultSend): string {
  return s.campaign ? `${s.group} — from ${shortDay(s.firstSentAt)}` : s.group;
}

/** When a send went: one time, or the span it took. */
export function sentWhen(s: WhatsAppResultSend): string {
  const first = formatDateTime(s.firstSentAt);
  if (Date.parse(s.lastSentAt) - Date.parse(s.firstSentAt) < 60_000) return first;
  return `${first} to ${formatDateTime(s.lastSentAt)}`;
}

/** The Opened column: when, or how we know. */
export function openedLine(p: WhatsAppResultPerson): string {
  if (p.openedBy === 'tick') return formatDateTime(p.readAt);
  if (p.openedBy === 'sign') return 'Blue ticks off — known from what they did';
  return '—';
}

/** The Link column. */
export function linkLine(p: WhatsAppResultPerson): string {
  if (!p.hasLink) return 'No link';
  if (p.linkTaps === 0) return 'Not tapped';
  const taps = plural(p.linkTaps, 'time', 'times');
  return p.watchedSeconds ? `${taps} · watched ${secondsLabel(p.watchedSeconds)}` : taps;
}

function secondsLabel(s: number): string {
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return r ? `${m} min ${r} s` : `${m} min`;
}
