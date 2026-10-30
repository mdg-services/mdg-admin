/**
 * The ticket desk's decisions, with no JSX in them (ADR 0026, steps 2 and 3).
 *
 * `mdg-admin` has no test runner, so every rule the inbox's two tabs, the Close
 * sheet and the AI answers page's weekly list decide on lives here, where
 * `scripts/inboxDesk.check.ts` can run it outside Vite. Values come from
 * `shared/src` by relative path for that reason (as `lib/leads.ts` does): there,
 * `@dk/shared` resolves to a compiled `dist/` that a pending shared change can
 * leave behind the source.
 *
 * NOTHING HERE INVENTS A STATE. Whether a ticket is New, On it, Waiting, Late,
 * Replied or Closed is `ticketDeskState` in shared, the same function the
 * server's counts use; this file only orders, filters and words what it says.
 */
import {
  TICKET_DESK_STATE_RANK,
  promiseActive,
  promiseTimeText,
  ticketAgeLabel,
  ticketDeskState,
} from '../../../shared/src/lib/ticketView';
import type { InboxTab } from '../../../shared/src/types/conversation';
import {
  TICKET_NOTE_MAX,
  TICKET_SUMMARY_MAX,
  type TicketCloseBody,
  type TicketOpenBody,
  type TicketView,
} from '../../../shared/src/types/ticket';

/* ───────────────────────── The inbox's two tabs ───────────────────────── */

/** The three lists under the Tickets tab. `open` is every open ticket; `mine` the ones this admin is on. */
export type TicketChip = 'open' | 'mine' | 'closed';

export const TICKET_CHIPS: ReadonlyArray<{ key: TicketChip; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'mine', label: 'Mine' },
  { key: 'closed', label: 'Closed' },
];

/** Where the inbox stands: a tab, the chip under Tickets, and the AI guard lens under All chats. */
export interface InboxStart {
  tab: InboxTab;
  chip: TicketChip;
  aiGuard: boolean;
}

const DEFAULT_START: InboxStart = { tab: 'tickets', chip: 'open', aiGuard: false };

/**
 * Where a link lands.
 *
 * The inbox had eight tabs; it has two. Every old `?lens=` value still loads
 * and goes to the closest place, so a pasted link, an alert from last week and
 * a push notification all open something sensible rather than the wrong list:
 *
 * - `tickets`, `open`, `flagged`, `ai`  — the open tickets (a thread nobody had
 *   picked up, or that was dropped, is work for the desk now).
 * - `mine`      — the open tickets this admin is on.
 * - `resolved`  — the closed tickets.
 * - `all`, `chats` — every chat.
 * - `ai-guard`  — every chat, narrowed to the threads the AI guard marked. It
 *   stays its own lens: it is a security observation, not a piece of work, and
 *   only a super-admin clears it.
 *
 * A link to one thread wins over a link to a list. A thread named with a ticket
 * (Today rows, alerts, the AI answers page) opens on Tickets; a bare thread
 * (the members tab, a push) opens on All chats, which holds every conversation
 * whatever its status — so the row is always in the list beside it.
 */
export function inboxStartFor(
  lens: string | null | undefined,
  link: { hasThread: boolean; hasTicket: boolean },
): InboxStart {
  if (lens === 'ai-guard') return { tab: 'chats', chip: 'open', aiGuard: true };
  if (link.hasThread) {
    return link.hasTicket
      ? DEFAULT_START
      : { tab: 'chats', chip: 'open', aiGuard: false };
  }
  switch (lens) {
    case 'all':
    case 'chats':
      return { tab: 'chats', chip: 'open', aiGuard: false };
    case 'mine':
      return { tab: 'tickets', chip: 'mine', aiGuard: false };
    case 'resolved':
      return { tab: 'tickets', chip: 'closed', aiGuard: false };
    default:
      return DEFAULT_START;
  }
}

/** Whether a `?lens=` value is one this build reads (anything else is left alone, not guessed at). */
export function isKnownLens(lens: string | null | undefined): boolean {
  return (
    lens === 'tickets' ||
    lens === 'open' ||
    lens === 'mine' ||
    lens === 'all' ||
    lens === 'chats' ||
    lens === 'resolved' ||
    lens === 'flagged' ||
    lens === 'ai' ||
    lens === 'ai-guard'
  );
}

/* ───────────────────────── The ticket list ───────────────────────── */

/**
 * The same person? By id when the ticket carries one — two admins can share a
 * name — and the forgiving name compare only for a ticket from before ids rode
 * along.
 */
export function isMine(
  t: Pick<TicketView, 'ownerName' | 'ownerId'>,
  myName: string | null | undefined,
  myId?: string | null,
): boolean {
  if (t.ownerId && myId) return t.ownerId === myId;
  const owner = t.ownerName?.trim().toLowerCase();
  const me = myName?.trim().toLowerCase();
  return !!owner && !!me && owner === me;
}

/**
 * What needs a person first, then the one that has waited longest — the order a
 * desk is worked in. Rank is `TICKET_DESK_STATE_RANK` (late, new, waiting, on
 * it, replied); ties go to the older ticket, then the lower number, so two
 * renders of the same list never swap rows.
 */
export function sortDeskTickets(tickets: readonly TicketView[], now: Date): TicketView[] {
  const keyed = tickets.map((t) => ({
    t,
    rank: TICKET_DESK_STATE_RANK[ticketDeskState(t, now)],
    at: new Date(t.raisedAt).getTime(),
  }));
  keyed.sort((a, b) => a.rank - b.rank || a.at - b.at || a.t.number - b.t.number);
  return keyed.map((k) => k.t);
}

/** The open tickets a chip shows: all of them, or the ones this admin is on. */
export function openForChip(
  tickets: readonly TicketView[],
  chip: TicketChip,
  myName: string | null | undefined,
  myId?: string | null,
): TicketView[] {
  if (chip === 'mine') return tickets.filter((t) => isMine(t, myName, myId));
  return [...tickets];
}

/**
 * "Asha · until 6:49 pm" while a person's "on it" time is ahead; "Asha · was due
 * 6:10 pm" once it passed with no update to the dealer; the name alone when
 * somebody has the ticket but made no promise. `null` when nobody has it.
 */
export function ownerLine(t: TicketView, now: Date): string | null {
  if (t.state === 'RESOLVED') return null;
  const who = t.ownerName?.trim() || undefined;
  const promise = t.promise;
  if (promise) {
    const when = promiseTimeText(promise.until, 'en', now);
    if (promiseActive(promise.until, now)) return who ? `${who} · until ${when}` : `until ${when}`;
    const lastPerson = t.lastPersonAt ? new Date(t.lastPersonAt).getTime() : 0;
    if (lastPerson <= new Date(promise.setAt).getTime()) {
      return who ? `${who} · was due ${when}` : `was due ${when}`;
    }
  }
  return who ?? null;
}

/** "Dealer waiting 25 min" — only while the dealer has written and nobody has answered. */
export function waitingLine(t: TicketView, now: Date): string | null {
  if (t.state === 'RESOLVED' || !t.dealerWaitingSince) return null;
  return `Dealer waiting ${ticketAgeLabel(t.dealerWaitingSince, now)}`;
}

/** The age at the end of a row: how long it has been open, or how long ago it was closed. */
export function rowAge(t: TicketView, now: Date): string {
  if (t.state === 'RESOLVED') return `${ticketAgeLabel(t.resolvedAt ?? t.raisedAt, now)} ago`;
  return ticketAgeLabel(t.raisedAt, now);
}

/** "Closed by Asha", or "Closed" when nobody is named. */
export function closedLine(t: Pick<TicketView, 'resolvedByName'>): string {
  const by = t.resolvedByName?.trim();
  return by ? `Closed by ${by}` : 'Closed';
}

/** What an empty list says, by chip. One plain line each. */
export function emptyTickets(chip: TicketChip): { title: string; description: string } {
  switch (chip) {
    case 'mine':
      return {
        title: 'You are not on any ticket',
        description: 'Tickets you put yourself on with "On it until" show here.',
      };
    case 'closed':
      return {
        title: 'Nothing closed yet',
        description: 'Tickets you close are kept here.',
      };
    default:
      return {
        title: 'No open tickets',
        description:
          'When the AI cannot settle a dealer’s question, or you open one by hand, it shows here.',
      };
  }
}

/* ───────────────────────── Close ───────────────────────── */

/** The server's own words for a close refused while the dealer is waiting; the sheet says them too. */
export const DEALER_WAITING_MESSAGE =
  'The dealer wrote since your last reply. Answer first, then close.';

/** "Other" in the service picker: the admin types the name. */
export const OTHER_SERVICE_ID = 'other';

export interface CloseDraft {
  note: string;
  /** The dealer is waiting, so the sheet carries a reply box. */
  waiting: boolean;
  reply: string;
  /** "Add to Services provided" is ticked. */
  addService: boolean;
  serviceId: string;
  serviceName: string;
}

export interface CloseProblems {
  note?: string;
  reply?: string;
  service?: string;
  serviceName?: string;
}

/**
 * What stops Close, field by field; an empty object means it can go. Judged on
 * trimmed text, because that is what the server measures. An unticked "Add to
 * Services provided" is never a problem whatever its boxes hold: they are not
 * sent.
 */
export function closeProblems(d: CloseDraft): CloseProblems {
  const out: CloseProblems = {};
  const note = d.note.trim().length;
  if (note > TICKET_NOTE_MAX) {
    out.note = `Keep it under ${TICKET_NOTE_MAX.toLocaleString('en-IN')} characters. It is ${note.toLocaleString('en-IN')} now.`;
  }
  if (d.waiting && d.reply.trim().length === 0) out.reply = DEALER_WAITING_MESSAGE;
  if (d.addService) {
    if (!d.serviceId) out.service = 'Pick the service, or untick the box.';
    else if (d.serviceId === OTHER_SERVICE_ID && !d.serviceName.trim()) {
      out.serviceName = 'Write what the service was, or pick one from the list.';
    }
  }
  return out;
}

/**
 * The body `POST /tickets/:id/close` takes. Blank boxes are left out rather than
 * sent as "", so the request says only what the admin filled in; "Other" sends
 * the typed name, a catalog service sends its own name.
 */
export function buildCloseBody(
  d: Pick<CloseDraft, 'note' | 'addService' | 'serviceId' | 'serviceName'>,
  catalog: ReadonlyArray<{ id: string; name: string }>,
): TicketCloseBody {
  const note = d.note.trim();
  const body: TicketCloseBody = {};
  if (note) body.note = note;
  if (d.addService && d.serviceId) {
    const name =
      d.serviceId === OTHER_SERVICE_ID
        ? d.serviceName.trim()
        : (catalog.find((s) => s.id === d.serviceId)?.name ?? '');
    body.service = { serviceId: d.serviceId, ...(name ? { serviceName: name } : {}) };
  }
  return body;
}

/** The sheet's lead line when the dealer is waiting, with how long. */
export function waitingHeading(
  t: Pick<TicketView, 'dealerWaitingSince'>,
  now: Date,
): string | null {
  if (!t.dealerWaitingSince) return null;
  return `The dealer wrote since your last reply (${ticketAgeLabel(t.dealerWaitingSince, now)} ago)`;
}

/* ───────────────────────── Open by hand / answered outside ───────────────────────── */

/** Why a one-line summary cannot be saved yet, or `null`. Measured trimmed, as the server does. */
export function summaryProblem(raw: string): string | null {
  const n = raw.trim().length;
  if (n === 0) return 'Write one line about what it is.';
  if (n > TICKET_SUMMARY_MAX) {
    return `Keep it under ${TICKET_SUMMARY_MAX} characters. It is ${n} now.`;
  }
  return null;
}

/** The body `POST /tickets` takes. The on-it time is left out when none was chosen. */
export function buildOpenBody(
  conversationId: string,
  summary: string,
  onItUntil: Date | null,
): TicketOpenBody {
  return {
    conversationId,
    summary: summary.trim(),
    ...(onItUntil ? { onItUntil: onItUntil.toISOString() } : {}),
  };
}

/** Why a note for "answered outside" is too long, or `null`. An empty note is fine. */
export function outsideNoteProblem(raw: string): string | null {
  const n = raw.trim().length;
  if (n > TICKET_NOTE_MAX) {
    return `Keep it under ${TICKET_NOTE_MAX.toLocaleString('en-IN')} characters. It is ${n.toLocaleString('en-IN')} now.`;
  }
  return null;
}

/* ───────────────────────── The AI's weekly gaps ───────────────────────── */

/** How far back "What the AI could not answer" looks. */
export const GAP_DAYS = 7;

/** The `raisedAfter` for the weekly list: whole minutes, so the request does not change every render. */
export function gapSince(now: Date): string {
  const t = now.getTime() - GAP_DAYS * 86_400_000;
  return new Date(Math.floor(t / 60_000) * 60_000).toISOString();
}

/**
 * The open and the closed gap tickets as one list, newest first. Two requests
 * feed it (`GET /tickets` answers one state at a time), and a ticket that closed
 * between them could appear in both, so rows are kept once by id.
 */
export function mergeGapTickets(...lists: ReadonlyArray<readonly TicketView[]>): TicketView[] {
  const seen = new Map<string, TicketView>();
  for (const list of lists) for (const t of list) seen.set(t.id, t);
  return [...seen.values()].sort(
    (a, b) => new Date(b.raisedAt).getTime() - new Date(a.raisedAt).getTime(),
  );
}

/** The dealer's own words, or the one-line summary when the question came through empty. */
export function gapQuestion(t: Pick<TicketView, 'question' | 'summary'>): string {
  return t.question.trim() || t.summary.trim();
}
