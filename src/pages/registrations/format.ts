/**
 * The Registrations page's decisions, kept out of the components so they read
 * as plain rules. This app has no test runner, so the less logic a `.tsx`
 * carries, the less of it can go wrong unseen. Dial links, mail links and
 * India-time stamps are shared with the Grievances page and live in
 * `@/lib/intake`.
 */
import { agoLabel, istStamp } from '@/lib/intake';
import { ageSince } from '@/pages/overview/format';
import type { Enrolment, EnrolmentSource } from '@dk/shared';

/**
 * How long the optional note may be. Mirrors `markEnrolmentContactedSchema` in
 * `@dk/shared`; `scripts/intake.check.ts` fails if the two ever disagree.
 */
export const ENROLMENT_NOTE_MAX = 1000;

/**
 * Where the form was filled in. "Dealer Kavach app" is the app's own name for
 * itself, and the one an admin sees on the dealer's phone.
 */
const SOURCE_LABEL: Record<EnrolmentSource, string> = {
  website: 'Website',
  app: 'Dealer Kavach app',
};

export function sourceLabel(s: Enrolment['source']): string {
  return SOURCE_LABEL[s] ?? s;
}

/** "3h 5m ago" since the form was sent. */
export function sentAgo(e: Pick<Enrolment, 'submittedAt'>, now: number): string {
  return agoLabel(ageSince(e.submittedAt, now));
}

/** "12 Oct, 14:05" in India time. */
export function sentAt(e: Pick<Enrolment, 'submittedAt'>, now: number): string {
  return istStamp(e.submittedAt, now);
}

/** "Contacted by Asha · 12 Oct, 14:05". Either half is left out when it is not known. */
export function contactedLine(
  e: Pick<Enrolment, 'contactedByName' | 'contactedAt'>,
  now: number,
): string {
  const by = e.contactedByName ? `Contacted by ${e.contactedByName}` : 'Contacted';
  const when = istStamp(e.contactedAt, now);
  return when ? `${by} · ${when}` : by;
}

/**
 * Why the note cannot be saved, or `null` when it can. The note is optional, so
 * an empty box is fine; only a note that is too long is a problem. Judged on the
 * TRIMMED text, because that is what the server measures.
 */
export function noteProblem(raw: string): string | null {
  const length = raw.trim().length;
  if (length > ENROLMENT_NOTE_MAX) {
    return `Keep it under ${ENROLMENT_NOTE_MAX.toLocaleString('en-IN')} characters. It is ${length.toLocaleString('en-IN')} now.`;
  }
  return null;
}
