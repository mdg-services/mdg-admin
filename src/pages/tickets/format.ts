/**
 * The wording around a ticket, kept out of the components so it reads as plain
 * rules. This app has no test runner, so the less logic a `.tsx` carries, the
 * less of it can go wrong unseen. Labels and colours that the dealer app shares
 * live in `@dk/shared`'s `ticketView`; only the admin's own wording is here. What
 * the inbox's two tabs and the Close sheet DECIDE lives in `features/inbox/desk`,
 * which the check script can run.
 */
import { promiseActive, promiseTimeText } from '@dk/shared';
import type { TicketView } from '@dk/shared';

/** "Owner" or "Manager" — the two people at an outlet who can raise a ticket. */
export function askedByRole(t: Pick<TicketView, 'askedBy'>): string {
  const role = t.askedBy.role;
  if (role === 'dealer-owner') return 'Owner';
  if (role === 'dealer-staff') return 'Manager';
  return '';
}

/** "Asha · Owner", or whichever half is known. */
export function askedByLabel(t: Pick<TicketView, 'askedBy'>): string {
  const name = t.askedBy.name?.trim();
  const role = askedByRole(t);
  if (name && role) return `${name} · ${role}`;
  return name || role || 'The dealer';
}

/** The thread a ticket lives in, with the ticket named so it can be picked out (the inbox opens it on its strip). */
export function ticketThreadHref(t: Pick<TicketView, 'conversationId' | 'id'>): string {
  return `/inbox?c=${t.conversationId}&ticket=${t.id}`;
}

/** "12 Oct, 14:05" in the dealers' time zone. */
export function whenLabel(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Whether somebody at MDG has opened the ticket. `null` when nobody has — the
 * caller decides whether that is worth a line (it is, on an open ticket).
 */
export function seenLabel(t: Pick<TicketView, 'seenAt' | 'seenByName'>): string | null {
  if (!t.seenAt) return null;
  return t.seenByName ? `Seen by ${t.seenByName}` : 'Seen';
}

/** "1 follow-up", "3 follow-ups"; `null` when nothing was added after the first question. */
export function followUpLabel(t: Pick<TicketView, 'followUps'>): string | null {
  const n = t.followUps.length;
  if (n === 0) return null;
  return n === 1 ? '1 follow-up' : `${n} follow-ups`;
}

/**
 * The facts under a row, joined: "Seen by Asha · 2 follow-ups".
 *
 * An OPEN ticket nobody has looked at says so in words — that is the one state
 * on this page that is a problem on its own. A resolved one says nothing about
 * it: whether it was ever "seen" no longer matters once it is closed.
 */
export function statusLine(
  t: Pick<TicketView, 'state' | 'seenAt' | 'seenByName' | 'followUps'>,
): string {
  const seen = seenLabel(t) ?? (t.state === 'OPEN' ? 'Not opened yet' : null);
  return [seen, followUpLabel(t)].filter(Boolean).join(' · ');
}

/** "Closed by Asha · 12 Oct, 14:05". */
export function resolvedLine(
  t: Pick<TicketView, 'resolvedByName' | 'resolvedAt'>,
): string {
  const by = t.resolvedByName ? `Closed by ${t.resolvedByName}` : 'Closed';
  const when = whenLabel(t.resolvedAt);
  return when ? `${by} · ${when}` : by;
}

/** What the urgency item in a thread's "⋯" menu says it will do. */
export function urgentActionLabel(t: Pick<TicketView, 'urgent'>): string {
  return t.urgent ? 'Mark not urgent' : 'Mark urgent';
}

/**
 * The line on an open ticket that says a person is "on it" — or that the time
 * they promised has gone by with nothing sent. `null` when nobody has put
 * themselves on it, when the ticket is closed (closing takes the promise off, and
 * a stale one on a closed row would say something that is no longer true), and
 * when the time has passed but a person wrote to the dealer since the promise
 * was made: the promise was kept, so there is nothing left to warn about.
 *
 * `active` is the one fact the screen needs to choose between a quiet line with
 * "Let AI handle it" and a warning with nothing to press: once the time passes
 * the AI is already answering again by itself, so there is nothing left to hand
 * back, and the person is left to say something to the dealer.
 */
export function onItLine(
  t: Pick<TicketView, 'state' | 'promise' | 'ownerName' | 'lastPersonAt'>,
  now: Date,
): { active: boolean; text: string } | null {
  if (t.state !== 'OPEN' || !t.promise) return null;
  const when = promiseTimeText(t.promise.until, 'en', now);
  if (!promiseActive(t.promise.until, now)) {
    const lastPerson = t.lastPersonAt ? new Date(t.lastPersonAt).getTime() : 0;
    if (lastPerson > new Date(t.promise.setAt).getTime()) return null;
    return { active: false, text: `Update was due ${when}, none sent` };
  }
  const who = (t.ownerName ?? t.promise.byName)?.trim();
  return { active: true, text: who ? `On it until ${when} · ${who}` : `On it until ${when}` };
}
