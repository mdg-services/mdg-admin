import { formatDate, formatDateTime } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import type { WhatsAppResultOutcome, WhatsAppResultPerson, WhatsAppResultSend } from '@dk/shared';

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

export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

export const OUTCOME_WORDS: Record<WhatsAppResultOutcome, { label: string; intent: Intent }> = {
  opened: { label: 'Opened', intent: 'success' },
  reached: { label: 'Reached, not opened', intent: 'neutral' },
  waiting: { label: 'Not on the phone yet', intent: 'info' },
  held_back: { label: 'Held back by WhatsApp', intent: 'warning' },
  not_delivered: { label: 'Did not arrive', intent: 'danger' },
};

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

/** What a send was, in a few words: its own words, or the kind of message. */
export function sendTitle(s: WhatsAppResultSend): string {
  const words = s.label.startsWith('Words not saved')
    ? 'Words not saved'
    : s.kind === 'Film invite'
      ? 'Film invite'
      : `“${s.label.length > 48 ? `${s.label.slice(0, 47).trimEnd()}…` : s.label}”`;
  return s.campaign ? `${words} (${s.campaign})` : words;
}

/** One line in the message picker. */
export function sendOption(s: WhatsAppResultSend): string {
  return `${formatDate(s.firstSentAt)} · ${sendTitle(s)} · ${plural(s.counts.people, 'person', 'people')}`;
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
