import type { DealerOpenRequest, Message } from '@dk/shared';

/**
 * The decisions behind the inbox's "asks in the chat" screens (ADR 0019), kept
 * out of the components so they can be read, and checked, on their own — this
 * app has no test runner, and which request a photo should be marked against is
 * exactly the kind of thing that goes quietly wrong.
 */

/** The floor the backend enforces on a send-back reason (`sendBackChatAttachmentSchema`). */
export const SEND_BACK_REASON_MIN = 4;
/** The ceiling, from the same schema. */
export const SEND_BACK_REASON_MAX = 500;

/** What each state of a request reads as, for the person at MDG. */
export const OPEN_REQUEST_STATUS_LABEL: Record<DealerOpenRequest['status'], string> = {
  open: 'Waiting for the dealer',
  sent: 'Dealer sent it — check it',
};

/** "Fire NOC · 12 Oct" — what the request is and, when it has one, the day it is for. */
export function requestLabel(r: Pick<DealerOpenRequest, 'titleEn' | 'periodLabel'>): string {
  return r.periodLabel ? `${r.titleEn} · ${r.periodLabel}` : r.titleEn;
}

/**
 * Can this message be the answer to a request? A dealer's own message with a
 * picture or a file on it. Not MDG's (admin or system), not a bare voice note,
 * not a message still being sent (`tmp-` ids have no server row to act on).
 */
export function isAnswerableMessage(message: Message): boolean {
  if (message.system) return false;
  if (message.senderRole === 'admin') return false;
  if (message.id.startsWith('tmp-')) return false;
  return message.attachments.some((a) => a.kind === 'image' || a.kind === 'file');
}

/** Positions of the attachments that can be filed (pictures and files, never a voice note). */
export function answerableAttachmentIndexes(message: Message): number[] {
  const out: number[] = [];
  message.attachments.forEach((a, i) => {
    if (a.kind === 'image' || a.kind === 'file') out.push(i);
  });
  return out;
}

/**
 * The requests one attachment can answer. A register page and a Kavach task take
 * a photo only — the backend refuses a PDF for them (`PHOTO_CONTENT_TYPES`) — so a
 * file offers papers alone; a picture can answer any of them. Offering a choice
 * the server will refuse only moves the "no" to after the button.
 */
export function requestsForAttachment(
  requests: readonly DealerOpenRequest[],
  attachmentKind: Message['attachments'][number]['kind'] | undefined,
): DealerOpenRequest[] {
  if (attachmentKind !== 'file') return [...requests];
  return requests.filter((r) => r.kind === 'document');
}

/**
 * Ids of the dealer messages a PERSON at MDG has already answered in this
 * thread — an admin's own reply quoting them ("Received", "Sent back", or words).
 *
 * A machine reply does not count, and neither does the AI's: the notice that a
 * file could not be opened quotes the very photo a person must rescue, and the
 * AI's "which paper is this?" is not a verdict. Only the loaded part of the
 * thread can be read, so an answer in another chat is simply not in the set.
 */
export function mdgRepliedMessageIds(messages: readonly Message[]): Set<string> {
  const out = new Set<string>();
  for (const m of messages) {
    if (m.senderRole !== 'admin' || m.system || m.ai) continue;
    if (m.replyTo?.messageId) out.add(m.replyTo.messageId);
  }
  return out;
}

/**
 * Has the dealer answered this request in the chat with something MDG has yet to
 * look at?
 *
 * `sent` always: it is waiting on MDG by definition. `open` too, when it names a
 * message — the dealer answered but the answer was never filed (a HEIC picture,
 * a failed copy), and "Mark received" is how a person rescues it. An `open`
 * request also names the photo MDG has just SENT BACK (the server reads the
 * latest message that answered it), so an answer a person has already replied to
 * is not a thing to check again.
 */
export function hasAnswerToCheck(
  request: DealerOpenRequest,
  repliedMessageIds: ReadonlySet<string>,
): boolean {
  if (!request.answeredBy) return false;
  return request.status === 'sent' || !repliedMessageIds.has(request.answeredBy.messageId);
}

/**
 * Requests the dealer has answered and MDG has not yet checked, keyed by the
 * message that carried the answer. The thread reads this once and hands each
 * bubble its own entry, so a bubble never fetches anything itself.
 */
export function pendingAnswersByMessage(
  requests: readonly DealerOpenRequest[],
  repliedMessageIds: ReadonlySet<string>,
): Map<string, DealerOpenRequest> {
  const out = new Map<string, DealerOpenRequest>();
  for (const r of requests) {
    if (!r.answeredBy || !hasAnswerToCheck(r, repliedMessageIds)) continue;
    // One message answers one request. Should the server ever list two against
    // the same message, the first wins: the picker still offers both.
    if (!out.has(r.answeredBy.messageId)) out.set(r.answeredBy.messageId, r);
  }
  return out;
}

/**
 * Is the photo that answered this request on screen, so "Mark received" can be
 * pressed on what the admin has seen? True only when the answering message is in
 * the thread that is open and loaded. From the card it often is not — the answer
 * is in the outlet's other chat, or on an older page — and then the way forward
 * is "Show message" / "Open chat", which brings it into view.
 */
export function isAnswerShown(
  request: DealerOpenRequest,
  openConversationId: string | null | undefined,
  loadedMessageIds: ReadonlySet<string>,
): boolean {
  const a = request.answeredBy;
  return !!a && a.conversationId === openConversationId && loadedMessageIds.has(a.messageId);
}

/**
 * Does this arriving message move what the Open requests card shows?
 *
 *  - an ask notice, or a dealer's answer: the request is new or has moved;
 *  - an admin's reply under a dealer's picture or file: another admin's
 *    "Received" or "Sent back". It carries neither `ask` nor `answersAsk`, so
 *    without this the "Answer to…" chip stayed up for a photo someone else had
 *    already dealt with.
 */
export function movesOpenRequests(message: Message): boolean {
  if (message.ask || message.answersAsk) return true;
  const quoted = message.replyTo?.attachmentKind;
  return message.senderRole === 'admin' && (quoted === 'image' || quoted === 'file');
}

/** The status of each request by ref, for the small label on an ask notice in the thread. */
export function statusByRef(
  requests: readonly DealerOpenRequest[],
): Map<string, DealerOpenRequest['status']> {
  return new Map(requests.map((r) => [r.ref, r.status]));
}

/**
 * The order the "Mark received" picker lists requests in: the one this very
 * message answered first, then the others the dealer has sent (MDG's turn),
 * then those still waiting on the dealer. The server's order is kept inside
 * each group.
 */
export function orderForPicker(
  requests: readonly DealerOpenRequest[],
  messageId: string | undefined,
  answeredRef: string | undefined,
): DealerOpenRequest[] {
  const rank = (r: DealerOpenRequest): number => {
    if (messageId && r.answeredBy?.messageId === messageId) return 0;
    if (answeredRef && r.ref === answeredRef) return 0;
    return r.status === 'sent' ? 1 : 2;
  };
  return requests
    .map((r, i) => ({ r, i, rank: rank(r) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.r);
}

/**
 * Which request to start selected.
 *
 * The one this message answered, if the list has it. Failing that, the only
 * request there is — an admin who pressed "Mark received" on a dealer's photo
 * and has a single thing outstanding has already said what they mean. With
 * several and no match, nothing: a guess here files a photo against the wrong
 * paper, and the dealer is told it was received.
 */
export function defaultPickerRef(
  requests: readonly DealerOpenRequest[],
  messageId: string | undefined,
  answeredRef: string | undefined,
): string | null {
  const byMessage = messageId
    ? requests.find((r) => r.answeredBy?.messageId === messageId)
    : undefined;
  if (byMessage) return byMessage.ref;
  const byRef = answeredRef ? requests.find((r) => r.ref === answeredRef) : undefined;
  if (byRef) return byRef.ref;
  return requests.length === 1 ? requests[0]!.ref : null;
}

/**
 * Whether the request already holds a different photo from the dealer — it is
 * `sent`, and the message that answered is not the one being marked. Choosing
 * it may be refused by the server (the request already has an answer); the
 * picker says so beside the option rather than hiding it.
 */
export function holdsAnotherAnswer(
  request: DealerOpenRequest,
  messageId: string | undefined,
): boolean {
  return (
    request.status === 'sent' &&
    !!request.answeredBy &&
    !!messageId &&
    request.answeredBy.messageId !== messageId
  );
}

/**
 * Requests this message can be sent back on.
 *
 * Two kinds. One the dealer ANSWERED WITH THIS PHOTO and MDG has not yet ruled on:
 * the verdict is "no". And one still waiting on the dealer: nothing is filed, so
 * there is no verdict to reverse, but a dealer who sent a photo that will not do
 * — wrong page, blurred, not linked to the request — still has to be told why,
 * and the request stays open. Left out on purpose: a register page, which is
 * received the moment its photo arrives and which the server will not send back;
 * and a request answered by a DIFFERENT message, since the reason would go under
 * this photo about another, which a dealer cannot untangle (the server refuses it
 * too).
 */
export function sendBackCandidates(
  requests: readonly DealerOpenRequest[],
  messageId: string | undefined,
): DealerOpenRequest[] {
  if (!messageId) return [];
  return requests.filter(
    (r) =>
      r.kind !== 'register' &&
      (r.status === 'open' || (r.status === 'sent' && r.answeredBy?.messageId === messageId)),
  );
}

/**
 * How many requests are waiting on MDG to check an answer, and how many only on
 * the dealer — the card's heading and the header badge.
 */
export function countRequests(
  requests: readonly DealerOpenRequest[],
  repliedMessageIds: ReadonlySet<string>,
): {
  total: number;
  toCheck: number;
  waiting: number;
} {
  let toCheck = 0;
  for (const r of requests) {
    // A `sent` request counts even with no message to point at (it came through
    // the old route): it is still MDG's turn.
    if (r.status === 'sent' || hasAnswerToCheck(r, repliedMessageIds)) toCheck += 1;
  }
  return { total: requests.length, toCheck, waiting: requests.length - toCheck };
}

/**
 * The first reason a "Mark received" cannot go ahead yet, in the words the admin
 * reads, or `null` when it can. Checked in the dialog so the button is never a
 * server error waiting to happen: a date the server will refuse is caught here.
 *
 * The photo comes first. Marking a paper received tells the dealer MDG has
 * looked at it, so the dialog will not do it for a photo it is not showing.
 */
export function receiveBlocker(args: {
  selected: DealerOpenRequest | null;
  validUntil: string;
  /** True when `validUntil` is a real calendar day in the range the server takes. */
  validUntilOk: boolean;
  /** True when the dealer's photo is drawn in the dialog. */
  photoShown: boolean;
}): string | null {
  const { selected, validUntil, validUntilOk, photoShown } = args;
  if (!photoShown) {
    return 'The dealer’s photo is not on screen. Close this, open the photo with Show message or Open chat, then mark it received.';
  }
  if (!selected) return 'Choose which request this answers.';
  if (selected.tracksValidity) {
    if (!validUntil) return 'This paper runs out. Enter the date printed on it.';
    if (!validUntilOk) return 'That date is not one we can use. Check the paper again.';
  }
  return null;
}

/** The reason as it will be sent: trimmed, as the server trims it. */
export function sendBackReasonError(reason: string): string | null {
  const n = reason.trim().length;
  if (n < SEND_BACK_REASON_MIN) {
    return `Write what was wrong — at least ${SEND_BACK_REASON_MIN} characters. The dealer reads it as you type it.`;
  }
  if (n > SEND_BACK_REASON_MAX) {
    return `That is too long — keep it under ${SEND_BACK_REASON_MAX} characters.`;
  }
  return null;
}
