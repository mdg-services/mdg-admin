/**
 * Checks for the decisions behind the inbox's "asks in the chat" screens
 * (`src/lib/chatAsk.ts`, ADR 0019).
 *
 * This app has no test runner, so these are plain `node:test` checks over the
 * pure module, run through the `tsx` the repo root already carries:
 *
 *   cd mdg-admin && npx tsx --test scripts/chatAsk.check.ts
 *
 * They sit outside `src/` on purpose: the build type-checks `src/`, and a test
 * import there would break a standalone build that has no test types.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  countRequests,
  hasAnswerToCheck,
  isAnswerShown,
  mdgRepliedMessageIds,
  movesOpenRequests,
  pendingAnswersByMessage,
  receiveBlocker,
  requestsForAttachment,
} from '../src/lib/chatAsk';

// Loose fixtures: only the fields the decisions read.
const req = (o: Record<string, unknown>) =>
  ({ kind: 'document', titleEn: 'Fire NOC', titleHi: 'फायर एनओसी', status: 'open', ...o }) as never;
const msg = (o: Record<string, unknown>) =>
  ({
    id: 'm',
    conversationId: 'c1',
    senderId: 'u',
    senderRole: 'dealer-owner',
    attachments: [],
    readBy: [],
    ...o,
  }) as never;

const NONE: ReadonlySet<string> = new Set();

describe('a paper is never marked received without its photo on screen', () => {
  const answered = req({
    ref: 'doc:a',
    status: 'sent',
    answeredBy: { conversationId: 'c1', messageId: 'm3' },
  });

  it('is not shown when the answer is in the outlet’s other chat', () => {
    assert.equal(isAnswerShown(answered, 'c2', new Set(['m3'])), false);
  });

  it('is not shown when the answer is in this chat but on a page not loaded', () => {
    assert.equal(isAnswerShown(answered, 'c1', new Set(['m9'])), false);
  });

  it('is shown once the answering message is loaded in the open chat', () => {
    assert.equal(isAnswerShown(answered, 'c1', new Set(['m3', 'm9'])), true);
  });

  it('is not shown for a request that names no message', () => {
    assert.equal(
      isAnswerShown(req({ ref: 'doc:z', status: 'sent' }), 'c1', new Set(['m3'])),
      false,
    );
  });

  it('the dialog refuses to confirm with no photo, whatever else is in order', () => {
    const selected = req({ ref: 'doc:a', status: 'sent' });
    const blocked = receiveBlocker({
      selected,
      validUntil: '',
      validUntilOk: false,
      photoShown: false,
    });
    assert.match(blocked ?? '', /not on screen/);
    assert.equal(
      receiveBlocker({ selected, validUntil: '', validUntilOk: false, photoShown: true }),
      null,
    );
  });

  it('still asks for the printed date once the photo is shown', () => {
    const selected = req({ ref: 'doc:a', status: 'sent', tracksValidity: true });
    assert.match(
      receiveBlocker({ selected, validUntil: '', validUntilOk: false, photoShown: true }) ?? '',
      /printed on it/,
    );
  });
});

describe('another admin’s Received or Send back refreshes the open requests', () => {
  const quoting = (attachmentKind: string | undefined) => ({
    messageId: 'photo1',
    senderId: 'dealer',
    ...(attachmentKind ? { attachmentKind } : {}),
  });

  it('an admin reply under a dealer picture moves the list', () => {
    assert.equal(
      movesOpenRequests(
        msg({ senderRole: 'admin', body: '✓ Received', replyTo: quoting('image') }),
      ),
      true,
    );
  });

  it('an admin reply under a dealer file (PDF) moves the list', () => {
    assert.equal(movesOpenRequests(msg({ senderRole: 'admin', replyTo: quoting('file') })), true);
  });

  it('an admin reply under plain words or a voice note does not', () => {
    assert.equal(
      movesOpenRequests(msg({ senderRole: 'admin', replyTo: quoting(undefined) })),
      false,
    );
    assert.equal(movesOpenRequests(msg({ senderRole: 'admin', replyTo: quoting('audio') })), false);
  });

  it('an admin message that quotes nothing does not', () => {
    assert.equal(movesOpenRequests(msg({ senderRole: 'admin', body: 'hello' })), false);
  });

  it('a dealer reply that quotes a picture does not (their answer carries answersAsk)', () => {
    assert.equal(movesOpenRequests(msg({ replyTo: quoting('image') })), false);
  });

  it('an ask notice and a dealer’s answer still do', () => {
    assert.equal(
      movesOpenRequests(msg({ senderRole: 'admin', system: true, ask: { ref: 'doc:a' } })),
      true,
    );
    assert.equal(movesOpenRequests(msg({ answersAsk: 'doc:a' })), true);
  });
});

describe('a request answered in the chat but never filed still gets its buttons', () => {
  const unfiled = req({
    ref: 'doc:b',
    status: 'open',
    answeredBy: { conversationId: 'c1', messageId: 'm5' },
  });

  it('an open request that names a message needs a look', () => {
    assert.equal(hasAnswerToCheck(unfiled, NONE), true);
  });

  it('an open request that names no message does not', () => {
    assert.equal(hasAnswerToCheck(req({ ref: 'doc:c', status: 'open' }), NONE), false);
  });

  it('a sent request always does, replied to or not', () => {
    const sent = req({
      ref: 'doc:a',
      status: 'sent',
      answeredBy: { conversationId: 'c1', messageId: 'm3' },
    });
    assert.equal(hasAnswerToCheck(sent, NONE), true);
    assert.equal(hasAnswerToCheck(sent, new Set(['m3'])), true);
  });

  it('the chip map carries the unfiled one, keyed by its photo', () => {
    const map = pendingAnswersByMessage([unfiled], NONE);
    assert.equal(map.get('m5')?.ref, 'doc:b');
  });

  it('a photo MDG has just sent back loses its chip: a person already replied to it', () => {
    const replied = mdgRepliedMessageIds([
      msg({ id: 'r1', senderRole: 'admin', replyTo: { messageId: 'm5', senderId: 'dealer' } }),
    ]);
    assert.equal(pendingAnswersByMessage([unfiled], replied).size, 0);
    assert.equal(hasAnswerToCheck(unfiled, replied), false);
  });

  it('a machine notice or the AI quoting the photo is not a person’s reply', () => {
    const replied = mdgRepliedMessageIds([
      msg({
        id: 'r2',
        senderRole: 'admin',
        system: true,
        replyTo: { messageId: 'm5', senderId: 'd' },
      }),
      msg({
        id: 'r3',
        senderRole: 'admin',
        ai: { kind: 'reply' },
        replyTo: { messageId: 'm5', senderId: 'd' },
      }),
      msg({ id: 'r4', replyTo: { messageId: 'm5', senderId: 'd' } }),
    ]);
    assert.equal(replied.size, 0);
    assert.equal(hasAnswerToCheck(unfiled, replied), true);
  });

  it('the card’s "to check" count includes it', () => {
    const sentNoMessage = req({ ref: 'doc:s', status: 'sent' });
    const waiting = req({ ref: 'doc:w', status: 'open' });
    assert.deepEqual(countRequests([unfiled, sentNoMessage, waiting], NONE), {
      total: 3,
      toCheck: 2,
      waiting: 1,
    });
  });
});

describe('a PDF is only offered the papers it can answer', () => {
  const open = [
    req({ ref: 'doc:a' }),
    req({ ref: 'reg:2026-10-12', kind: 'register', titleEn: 'Density register page' }),
    req({ ref: 'kv:k1', kind: 'kavach', titleEn: 'Fill toilet inspection sheet' }),
  ];
  const refs = (list: { ref: string }[]) => list.map((r) => r.ref);

  it('a photo can answer a paper, a register page or a Kavach task', () => {
    assert.deepEqual(refs(requestsForAttachment(open, 'image')), ['doc:a', 'reg:2026-10-12', 'kv:k1']);
  });

  it('a file (PDF) is offered the paper alone', () => {
    assert.deepEqual(refs(requestsForAttachment(open, 'file')), ['doc:a']);
  });

  it('a file with only photo requests open is offered nothing', () => {
    assert.deepEqual(requestsForAttachment(open.slice(1), 'file'), []);
  });

  it('an unknown attachment is not filtered (the server still guards it)', () => {
    assert.equal(requestsForAttachment(open, undefined).length, 3);
  });
});
