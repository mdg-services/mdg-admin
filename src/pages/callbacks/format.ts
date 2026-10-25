/**
 * The Call-backs page's decisions, kept out of the components so they read as
 * plain rules (this app has no test runner; `scripts/intake.check.ts` checks
 * these). Dial links and India-time stamps are shared with the other intake
 * pages and live in `@/lib/intake`.
 */
import { agoLabel, istStamp } from '@/lib/intake';
import { ageSince } from '@/pages/overview/format';
import type { CallbackFilm, CallbackRequest } from '@dk/shared';

/**
 * How long the optional note may be. Mirrors `markCallbackCalledSchema` in
 * `@dk/shared`; `scripts/intake.check.ts` fails if the two ever disagree.
 */
export const CALLBACK_NOTE_MAX = 1000;

const FILM_LABEL: Record<CallbackFilm, string> = {
  kavach: 'the full film',
  'kavach-short': 'the 40-second film',
};

/** Where they asked: "Film page · the full film", or "Website". */
export function whereLine(c: Pick<CallbackRequest, 'source' | 'film'>): string {
  if (c.source !== 'film') return 'Website';
  return c.film ? `Film page · ${FILM_LABEL[c.film] ?? c.film}` : 'Film page';
}

/**
 * What brought them, when the film link carried a code: the WhatsApp message it
 * went out in, or the share link made on the Films page. `null` when there is
 * nothing to say (no code, or a code we never handed out).
 */
export function refLine(
  c: Pick<CallbackRequest, 'ref' | 'refSend' | 'refLabel'>,
  now: number,
): string | null {
  if (!c.ref) return null;
  if (c.refSend) {
    const when = c.refSend.sentAt ? istStamp(c.refSend.sentAt, now) : '';
    const on = when ? ` on ${when}` : '';
    // A forwarded link carries the first person's code: a friend of theirs is asking.
    return c.refSend.sameNumber
      ? `From the WhatsApp film message sent to ${c.refSend.name}${on}`
      : `Opened from a link first sent to ${c.refSend.name}${on} — a different number is asking`;
  }
  if (c.refLabel) return `From the share link "${c.refLabel}"`;
  return `Link code ${c.ref}`;
}

/**
 * The admin WhatsApp inbox's address for this person's chat: only when the film
 * message went to the very number that is asking, never the forwarder's. The film
 * message is a promotion, so the chat is in the MDG Services (marketing) inbox.
 */
export function chatHref(c: Pick<CallbackRequest, 'refSend'>): string | null {
  return c.refSend?.sameNumber
    ? `/whatsapp?line=marketing&chat=${encodeURIComponent(c.refSend.phone)}`
    : null;
}

/** "3h 5m ago" since they asked. */
export function askedAgo(c: Pick<CallbackRequest, 'submittedAt'>, now: number): string {
  return agoLabel(ageSince(c.submittedAt, now));
}

/** "12 Oct, 14:05" in India time. */
export function askedAt(c: Pick<CallbackRequest, 'submittedAt'>, now: number): string {
  return istStamp(c.submittedAt, now);
}

/** "Called by Asha · 12 Oct, 14:05". Either half is left out when it is not known. */
export function calledLine(
  c: Pick<CallbackRequest, 'calledByName' | 'calledAt'>,
  now: number,
): string {
  const by = c.calledByName ? `Called by ${c.calledByName}` : 'Called';
  const when = istStamp(c.calledAt, now);
  return when ? `${by} · ${when}` : by;
}

/** Why the note cannot be saved, or `null`. Optional, so only a note that is too long is a problem; judged trimmed, as the server does. */
export function noteProblem(raw: string): string | null {
  const length = raw.trim().length;
  if (length > CALLBACK_NOTE_MAX) {
    return `Keep it under ${CALLBACK_NOTE_MAX.toLocaleString('en-IN')} characters. It is ${length.toLocaleString('en-IN')} now.`;
  }
  return null;
}
