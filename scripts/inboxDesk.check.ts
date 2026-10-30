/**
 * Checks for the ticket desk's rules (`src/features/inbox/desk.ts`): where an
 * old inbox link lands now that eight tabs are two, the order the Tickets tab is
 * worked in, the words on a ticket row, what stops the Close sheet and what it
 * sends, the one-line summary for a ticket opened by hand, and the AI answers
 * page's weekly list.
 *
 * This app has no test runner, so these are plain `node:test` checks over the
 * pure module, run through the `tsx` the repo root already carries:
 *
 *   cd mdg-admin && npm run check:inbox-desk
 *
 * which is `npx tsx --test scripts/inboxDesk.check.ts`. Values come from the
 * source by relative path, as `leads.check.ts` does: outside Vite, `@dk/shared`
 * resolves to a compiled `dist/` that a pending shared change can leave behind.
 *
 * Times are fixed. `NOW` is 2026-10-30 15:30 India time.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ticketDeskState } from '../shared/src/lib/ticketView';
import { TICKET_NOTE_MAX, TICKET_SUMMARY_MAX } from '../shared/src/types/ticket';
import type { TicketView } from '../shared/src/types/ticket';
import {
  DEALER_WAITING_MESSAGE,
  GAP_DAYS,
  OTHER_SERVICE_ID,
  buildCloseBody,
  buildOpenBody,
  closeProblems,
  closedLine,
  emptyTickets,
  gapQuestion,
  gapSince,
  inboxStartFor,
  isKnownLens,
  isMine,
  mergeGapTickets,
  openForChip,
  outsideNoteProblem,
  ownerLine,
  rowAge,
  sortDeskTickets,
  summaryProblem,
  waitingHeading,
  waitingLine,
} from '../src/features/inbox/desk';

const NOW = new Date('2026-10-30T10:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const ahead = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

let seq = 0;
function ticket(over: Partial<TicketView> = {}): TicketView {
  seq += 1;
  return {
    id: `t${seq}`,
    number: seq,
    dealerId: 'd1',
    dealerCode: '19E',
    conversationId: `c${seq}`,
    conversationKind: 'support',
    state: 'OPEN',
    trigger: 'needs_person',
    topic: 'other',
    urgent: false,
    summary: 'A summary',
    question: 'A question',
    inboundMessageId: 'm1',
    askedBy: { userId: 'u1', name: 'Ravi', role: 'dealer-owner' },
    followUps: [],
    raisedAt: ago(60),
    updatedAt: ago(5),
    ...over,
  };
}

// One ticket in each place the desk can find it.
const late = () =>
  ticket({
    raisedAt: ago(300),
    ownerName: 'Asha',
    promise: { until: ago(20), setAt: ago(120), byName: 'Asha' },
  });
const fresh = () => ticket({ raisedAt: ago(60) });
const waiting = () =>
  ticket({ raisedAt: ago(240), lastPersonAt: ago(180), dealerWaitingSince: ago(10) });
const onIt = () =>
  ticket({
    raisedAt: ago(30),
    ownerName: 'Meena',
    promise: { until: ahead(60), setAt: ago(10), byName: 'Meena' },
  });
const replied = () => ticket({ raisedAt: ago(360), lastPersonAt: ago(60) });

describe('the fixtures say what they claim', () => {
  it('sit in the five open states', () => {
    assert.equal(ticketDeskState(late(), NOW), 'late');
    assert.equal(ticketDeskState(fresh(), NOW), 'new');
    assert.equal(ticketDeskState(waiting(), NOW), 'waiting');
    assert.equal(ticketDeskState(onIt(), NOW), 'on_it');
    assert.equal(ticketDeskState(replied(), NOW), 'replied');
  });
});

describe('inboxStartFor — where a link lands', () => {
  const none = { hasThread: false, hasTicket: false };
  it('opens on Tickets with nothing to go on', () => {
    assert.deepEqual(inboxStartFor(null, none), { tab: 'tickets', chip: 'open', aiGuard: false });
    assert.deepEqual(inboxStartFor(undefined, none), { tab: 'tickets', chip: 'open', aiGuard: false });
    assert.deepEqual(inboxStartFor('rubbish', none), { tab: 'tickets', chip: 'open', aiGuard: false });
  });
  it('sends each old tab to the closest place', () => {
    const open = { tab: 'tickets', chip: 'open', aiGuard: false };
    for (const lens of ['tickets', 'open', 'flagged', 'ai']) {
      assert.deepEqual(inboxStartFor(lens, none), open, lens);
    }
    assert.deepEqual(inboxStartFor('mine', none), { tab: 'tickets', chip: 'mine', aiGuard: false });
    assert.deepEqual(inboxStartFor('resolved', none), { tab: 'tickets', chip: 'closed', aiGuard: false });
    assert.deepEqual(inboxStartFor('all', none), { tab: 'chats', chip: 'open', aiGuard: false });
    assert.deepEqual(inboxStartFor('chats', none), { tab: 'chats', chip: 'open', aiGuard: false });
  });
  it('keeps the AI guard lens, under All chats', () => {
    assert.deepEqual(inboxStartFor('ai-guard', none), { tab: 'chats', chip: 'open', aiGuard: true });
    // even beside a thread: the guard lens is what the link was for
    assert.deepEqual(inboxStartFor('ai-guard', { hasThread: true, hasTicket: false }), {
      tab: 'chats',
      chip: 'open',
      aiGuard: true,
    });
  });
  it('lets a thread win over a list', () => {
    // a Today row or an alert: thread + ticket + the old `lens=all`
    assert.equal(inboxStartFor('all', { hasThread: true, hasTicket: true }).tab, 'tickets');
    // the members tab, a push notification: a bare thread
    assert.equal(inboxStartFor(null, { hasThread: true, hasTicket: false }).tab, 'chats');
    assert.equal(inboxStartFor('all', { hasThread: true, hasTicket: false }).tab, 'chats');
    assert.equal(inboxStartFor('mine', { hasThread: true, hasTicket: false }).tab, 'chats');
  });
  it('knows which lenses it reads', () => {
    for (const lens of ['tickets', 'open', 'mine', 'all', 'chats', 'resolved', 'flagged', 'ai', 'ai-guard']) {
      assert.equal(isKnownLens(lens), true, lens);
    }
    for (const lens of ['', 'rubbish', null, undefined]) assert.equal(isKnownLens(lens), false, String(lens));
  });
});

describe('the Tickets tab order', () => {
  it('works late, then new, waiting, on it, replied', () => {
    const rows = [replied(), onIt(), waiting(), fresh(), late()];
    const sorted = sortDeskTickets(rows, NOW).map((t) => ticketDeskState(t, NOW));
    assert.deepEqual(sorted, ['late', 'new', 'waiting', 'on_it', 'replied']);
  });
  it('puts the older ticket first inside a state, then the lower number', () => {
    const older = ticket({ raisedAt: ago(180) });
    const newer = ticket({ raisedAt: ago(60) });
    assert.deepEqual(
      sortDeskTickets([newer, older], NOW).map((t) => t.id),
      [older.id, newer.id],
    );
    const a = ticket({ number: 7, raisedAt: ago(90) });
    const b = ticket({ number: 5, raisedAt: ago(90) });
    assert.deepEqual(
      sortDeskTickets([a, b], NOW).map((t) => t.number),
      [5, 7],
    );
  });
  it('does not change its input', () => {
    const rows = [replied(), late()];
    const ids = rows.map((t) => t.id);
    sortDeskTickets(rows, NOW);
    assert.deepEqual(
      rows.map((t) => t.id),
      ids,
    );
  });
  it('moves a ticket down the list as the clock passes its promise', () => {
    const t = onIt();
    assert.equal(ticketDeskState(t, NOW), 'on_it');
    const later = new Date(NOW.getTime() + 2 * 3_600_000);
    assert.equal(ticketDeskState(t, later), 'late');
  });
});

describe('Mine', () => {
  it('matches the owner by name, ignoring case and spaces', () => {
    assert.equal(isMine({ ownerName: 'Asha' }, 'asha '), true);
    assert.equal(isMine({ ownerName: ' Asha Rao' }, 'Asha Rao'), true);
  });
  it('is nobody when either name is missing', () => {
    assert.equal(isMine({ ownerName: undefined }, 'Asha'), false);
    assert.equal(isMine({ ownerName: 'Asha' }, undefined), false);
    assert.equal(isMine({ ownerName: '  ' }, '  '), false);
    assert.equal(isMine({ ownerName: 'Asha' }, 'Meena'), false);
  });
  it('filters the open list by chip', () => {
    const rows = [late(), onIt(), fresh()];
    assert.equal(openForChip(rows, 'open', 'Asha').length, 3);
    assert.deepEqual(
      openForChip(rows, 'mine', 'Meena').map((t) => t.ownerName),
      ['Meena'],
    );
    assert.equal(openForChip(rows, 'mine', 'Nobody').length, 0);
  });
});

describe('the words on a row', () => {
  it('says who has it and until when while an "on it" time is ahead', () => {
    assert.equal(ownerLine(onIt(), NOW), 'Meena · until 4:30 pm');
  });
  it('says the time was due once it passes with no update', () => {
    assert.equal(ownerLine(late(), NOW), 'Asha · was due 3:10 pm');
  });
  it('drops the warning once somebody wrote after the promise', () => {
    const t = late();
    t.lastPersonAt = ago(5);
    assert.equal(ownerLine(t, NOW), 'Asha');
  });
  it('gives the name alone when there is no promise, and nothing when nobody has it', () => {
    assert.equal(ownerLine(ticket({ ownerName: 'Asha' }), NOW), 'Asha');
    assert.equal(ownerLine(fresh(), NOW), null);
  });
  it('has no owner line on a closed ticket', () => {
    assert.equal(ownerLine(ticket({ state: 'RESOLVED', ownerName: 'Asha' }), NOW), null);
  });
  it('says how long the dealer has waited, only while they are waiting', () => {
    assert.equal(waitingLine(waiting(), NOW), 'Dealer waiting 10 min');
    assert.equal(waitingLine(ticket({ dealerWaitingSince: ago(150) }), NOW), 'Dealer waiting 2 h');
    assert.equal(waitingLine(replied(), NOW), null);
    assert.equal(waitingLine(ticket({ state: 'RESOLVED', dealerWaitingSince: ago(10) }), NOW), null);
  });
  it('ages an open row from when it was raised and a closed one from when it closed', () => {
    assert.equal(rowAge(late(), NOW), '5 h');
    assert.equal(rowAge(ticket({ state: 'RESOLVED', resolvedAt: ago(180) }), NOW), '3 h ago');
    assert.equal(rowAge(ticket({ state: 'RESOLVED', raisedAt: ago(2880) }), NOW), '2 d ago');
  });
  it('names who closed it', () => {
    assert.equal(closedLine({ resolvedByName: 'Asha' }), 'Closed by Asha');
    assert.equal(closedLine({ resolvedByName: ' ' }), 'Closed');
    assert.equal(closedLine({}), 'Closed');
  });
  it('has a plain line for each empty list', () => {
    assert.equal(emptyTickets('open').title, 'No open tickets');
    assert.equal(emptyTickets('mine').title, 'You are not on any ticket');
    assert.equal(emptyTickets('closed').title, 'Nothing closed yet');
  });
});

describe('Close', () => {
  const blank = {
    note: '',
    waiting: false,
    reply: '',
    addService: false,
    serviceId: '',
    serviceName: '',
  };
  it('needs nothing', () => {
    assert.deepEqual(closeProblems(blank), {});
    assert.deepEqual(buildCloseBody(blank, []), {});
  });
  it('refuses a note that is too long, measured trimmed', () => {
    assert.deepEqual(closeProblems({ ...blank, note: 'x'.repeat(TICKET_NOTE_MAX) + '   ' }), {});
    const p = closeProblems({ ...blank, note: 'x'.repeat(TICKET_NOTE_MAX + 1) });
    assert.match(p.note ?? '', /under 1,000 characters/);
  });
  it('refuses to close over a waiting dealer with no reply, in the server\'s words', () => {
    assert.equal(closeProblems({ ...blank, waiting: true }).reply, DEALER_WAITING_MESSAGE);
    assert.equal(closeProblems({ ...blank, waiting: true, reply: '   ' }).reply, DEALER_WAITING_MESSAGE);
    assert.deepEqual(closeProblems({ ...blank, waiting: true, reply: 'Done, sir.' }), {});
    assert.equal(
      DEALER_WAITING_MESSAGE,
      'The dealer wrote since your last reply. Answer first, then close.',
    );
  });
  it('does not need a reply when the dealer is not waiting', () => {
    assert.deepEqual(closeProblems({ ...blank, waiting: false, reply: '' }), {});
  });
  it('asks for the service only when the box is ticked', () => {
    assert.deepEqual(closeProblems({ ...blank, addService: false, serviceId: '' }), {});
    assert.match(closeProblems({ ...blank, addService: true }).service ?? '', /Pick the service/);
    assert.match(
      closeProblems({ ...blank, addService: true, serviceId: OTHER_SERVICE_ID }).serviceName ?? '',
      /Write what the service was/,
    );
    assert.deepEqual(
      closeProblems({ ...blank, addService: true, serviceId: OTHER_SERVICE_ID, serviceName: 'Tank clean' }),
      {},
    );
    assert.deepEqual(closeProblems({ ...blank, addService: true, serviceId: 'water-ingress' }), {});
  });
  it('sends only what was filled in', () => {
    const catalog = [{ id: 'water-ingress', name: 'Water Ingress Testing' }];
    assert.deepEqual(buildCloseBody({ ...blank, note: '  rang him  ' }, catalog), { note: 'rang him' });
    // an unticked box sends no service, whatever its boxes still hold
    assert.deepEqual(
      buildCloseBody({ ...blank, serviceId: 'water-ingress', serviceName: 'x' }, catalog),
      {},
    );
    assert.deepEqual(
      buildCloseBody({ ...blank, note: 'ok', addService: true, serviceId: 'water-ingress' }, catalog),
      { note: 'ok', service: { serviceId: 'water-ingress', serviceName: 'Water Ingress Testing' } },
    );
    assert.deepEqual(
      buildCloseBody(
        { ...blank, addService: true, serviceId: OTHER_SERVICE_ID, serviceName: ' Tank clean ' },
        catalog,
      ),
      { service: { serviceId: 'other', serviceName: 'Tank clean' } },
    );
  });
  it('says how long the dealer has waited at the top of the sheet', () => {
    assert.equal(
      waitingHeading({ dealerWaitingSince: ago(25) }, NOW),
      'The dealer wrote since your last reply (25 min ago)',
    );
    assert.equal(waitingHeading({}, NOW), null);
  });
});

describe('Open a ticket', () => {
  it('needs one line, measured trimmed', () => {
    assert.match(summaryProblem('') ?? '', /Write one line/);
    assert.match(summaryProblem('   ') ?? '', /Write one line/);
    assert.equal(summaryProblem('Owner will send the PAN card'), null);
    assert.equal(summaryProblem('x'.repeat(TICKET_SUMMARY_MAX) + '  '), null);
    assert.match(summaryProblem('x'.repeat(TICKET_SUMMARY_MAX + 1)) ?? '', /under 200 characters/);
  });
  it('builds the body, leaving the time out when none was chosen', () => {
    assert.deepEqual(buildOpenBody('c1', '  Owner will call  ', null), {
      conversationId: 'c1',
      summary: 'Owner will call',
    });
    const until = new Date('2026-10-30T11:00:00Z');
    assert.deepEqual(buildOpenBody('c1', 'x', until), {
      conversationId: 'c1',
      summary: 'x',
      onItUntil: '2026-10-30T11:00:00.000Z',
    });
  });
  it('lets "answered outside" carry no note, or a short one', () => {
    assert.equal(outsideNoteProblem(''), null);
    assert.equal(outsideNoteProblem('Rang the owner.'), null);
    assert.match(outsideNoteProblem('x'.repeat(TICKET_NOTE_MAX + 1)) ?? '', /under 1,000 characters/);
  });
});

describe('what the AI could not answer', () => {
  it('looks back seven days, to the minute', () => {
    assert.equal(GAP_DAYS, 7);
    const since = gapSince(new Date('2026-10-30T10:00:42.123Z'));
    assert.equal(since, '2026-10-23T10:00:00.000Z');
  });
  it('lists the open and the closed together, newest first, each once', () => {
    const a = ticket({ raisedAt: ago(300) });
    const b = ticket({ raisedAt: ago(60), state: 'RESOLVED' });
    const dup = { ...a };
    const merged = mergeGapTickets([a], [b, dup]);
    assert.deepEqual(
      merged.map((t) => t.id),
      [b.id, a.id],
    );
  });
  it('shows the dealer\'s words, or the summary when they came through empty', () => {
    assert.equal(gapQuestion({ question: ' Mera DSR kab aayega? ', summary: 's' }), 'Mera DSR kab aayega?');
    assert.equal(gapQuestion({ question: '  ', summary: 'Asked about DSR timing' }), 'Asked about DSR timing');
  });
});
