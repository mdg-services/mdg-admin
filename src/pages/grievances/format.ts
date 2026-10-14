/**
 * The Grievances page's decisions, kept out of the components so they read as
 * plain rules. This app has no test runner, so the less logic a `.tsx` carries,
 * the less of it can go wrong unseen. Dial links, mail links and India-time
 * stamps are shared with the Registrations page and live in `@/lib/intake`.
 */
import { agoLabel, istStamp } from '@/lib/intake';
import { ageSince } from '@/pages/overview/format';
import type { Grievance } from '@dk/shared';

/**
 * How long a resolving note may be. Mirrors `resolveGrievanceSchema` in
 * `@dk/shared`; `scripts/intake.check.ts` fails if the two ever disagree, which
 * is why these are not simply read from it — a zod schema carries its limits in
 * a form that cannot be printed in a message or counted against a text box.
 */
export const GRIEVANCE_NOTE_MIN = 3;
export const GRIEVANCE_NOTE_MAX = 2000;

/** "3h 5m ago" since it was sent from the website. */
export function sentAgo(g: Pick<Grievance, 'openedAt'>, now: number): string {
  return agoLabel(ageSince(g.openedAt, now));
}

/** "12 Oct, 14:05" in India time. */
export function sentAt(g: Pick<Grievance, 'openedAt'>, now: number): string {
  return istStamp(g.openedAt, now);
}

/** "Resolved by Asha · 12 Oct, 14:05". Either half is left out when it is not known. */
export function resolvedLine(
  g: Pick<Grievance, 'resolvedByName' | 'resolvedAt'>,
  now: number,
): string {
  const by = g.resolvedByName ? `Resolved by ${g.resolvedByName}` : 'Resolved';
  const when = istStamp(g.resolvedAt, now);
  return when ? `${by} · ${when}` : by;
}

/** Hindi is the only language worth flagging: it tells the admin which language to answer in. */
export function languageNote(g: Pick<Grievance, 'lang'>): string | null {
  return g.lang === 'hi' ? 'Written in Hindi' : null;
}

/** What the Reply by email link puts on the subject line. */
export function replySubject(g: Pick<Grievance, 'ref'>): string {
  return `Your grievance ${g.ref}`;
}

/**
 * Why a note cannot be saved yet, or `null` when it can.
 *
 * Judged on the TRIMMED text, because that is what the server measures: a note
 * of spaces is empty, and two thousand characters followed by a trailing space
 * is not too long.
 */
export function noteProblem(raw: string): string | null {
  const length = raw.trim().length;
  if (length === 0) return 'Write what was done before you resolve it.';
  if (length < GRIEVANCE_NOTE_MIN) return 'Write a few more words about what was done.';
  if (length > GRIEVANCE_NOTE_MAX) {
    return `Keep it under ${GRIEVANCE_NOTE_MAX.toLocaleString('en-IN')} characters. It is ${length.toLocaleString('en-IN')} now.`;
  }
  return null;
}
