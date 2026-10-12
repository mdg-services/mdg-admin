/**
 * The Tickets page's decisions, kept out of the components so they read as
 * plain rules. This app has no test runner, so the less logic a `.tsx` carries,
 * the less of it can go wrong unseen. Labels and colours that the dealer app
 * shares live in `@dk/shared`'s `ticketView`; only the admin's own wording is
 * here.
 */
import { TICKET_NOTE_MAX } from '@dk/shared';
import type { TicketCounts, TicketView } from '@dk/shared';

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

/** The thread a ticket lives in, with the ticket named so it can be picked out. */
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

/** "Resolved by Asha · 12 Oct, 14:05". */
export function resolvedLine(
  t: Pick<TicketView, 'resolvedByName' | 'resolvedAt'>,
): string {
  const by = t.resolvedByName ? `Resolved by ${t.resolvedByName}` : 'Resolved';
  const when = whenLabel(t.resolvedAt);
  return when ? `${by} · ${when}` : by;
}

/** What the urgency button on a row says it will do. */
export function urgentActionLabel(t: Pick<TicketView, 'urgent'>): string {
  return t.urgent ? 'Not urgent' : 'Mark urgent';
}

/**
 * Why a note cannot be saved yet, or `null` when it can.
 *
 * Judged on the TRIMMED text, because that is what the server measures: a note
 * of spaces is empty, and a thousand characters followed by a trailing space
 * is not too long.
 */
export function noteProblem(raw: string): string | null {
  const length = raw.trim().length;
  if (length === 0) return 'Write what was done before you resolve it.';
  if (length > TICKET_NOTE_MAX) {
    return `Keep it under ${TICKET_NOTE_MAX.toLocaleString('en-IN')} characters. It is ${length.toLocaleString('en-IN')} now.`;
  }
  return null;
}

/**
 * The line above the Open list: how much of it nobody has looked at, and how
 * much is time-critical. `null` when there is nothing to add to the tab's own
 * count.
 */
export function openSummary(counts: TicketCounts | undefined): string | null {
  if (!counts || counts.open === 0) return null;
  const parts: string[] = [];
  if (counts.unseen > 0) parts.push(`${counts.unseen} not opened yet`);
  if (counts.urgent > 0) parts.push(`${counts.urgent} urgent`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
