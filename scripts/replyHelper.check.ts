/**
 * Checks for the Reply helper's pure rules (`src/lib/replyHelper.ts`, ADR 0025):
 * how a draft is cut into painted runs when the server's highlights overlap or
 * run off the end, how a draft is put after what is already typed, the warning
 * order, how an instruction is cleaned, and how a refreshed thread is laid over
 * the one already held.
 *
 * This app has no test runner, so these are plain `node:test` checks over the
 * pure module, run through the `tsx` the repo root already carries:
 *
 *   cd mdg-admin && npm run check:reply-helper
 *
 * which is `npx tsx --test scripts/replyHelper.check.ts`. Types come from the
 * shared source by relative path, as the other check scripts do.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  ReplyHelperContext,
  ReplyHelperThread,
  ReplyHelperTurn,
  ReplyHelperWarning,
} from '../shared/src/types/replyHelper';
import {
  appendToBox,
  askFailureWords,
  askedByLabel,
  draftSegments,
  hasRedWarning,
  mergeThread,
  mergeTurns,
  sanitiseInstruction,
  severityByKind,
  sortWarnings,
  targetKey,
  targetQuery,
  turnWhen,
  warningWordsFor,
  withEarlier,
  withTurn,
} from '../src/lib/replyHelper';

const warn = (kind: ReplyHelperWarning['kind'], severity: 'red' | 'amber', words = kind): ReplyHelperWarning => ({
  kind,
  severity,
  words,
});

const turn = (id: string, at: string, over: Partial<ReplyHelperTurn> = {}): ReplyHelperTurn => ({
  id,
  at,
  channel: 'app',
  where: 'App chat',
  askedBy: { id: 'a1', name: 'Asha' },
  instruction: `ask ${id}`,
  reply: null,
  failure: 'x',
  ...over,
});

const context = (loginId: string | null = null): ReplyHelperContext => ({
  header: 'Anurag · App chat',
  who: 'Anurag',
  where: 'App chat',
  reader: 'owner',
  readerWords: 'the owner',
  dealerCode: '15E',
  login: loginId ? { userId: loginId, name: 'A', role: 'dealer-owner', dealerCode: '15E' } : null,
  loginChoices: [],
  sendMode: null,
  notices: [],
});

const thread = (turns: ReplyHelperTurn[], hasMore = false, loginId: string | null = null): ReplyHelperThread => ({
  context: context(loginId),
  turns,
  hasMore,
});

const join = (segs: { text: string }[]) => segs.map((s) => s.text).join('');

describe('targetKey / targetQuery', () => {
  it('names the conversation, so two chats never share an entry', () => {
    assert.equal(targetKey({ channel: 'app', conversationId: 'c1' }), 'app:c1');
    assert.equal(
      targetKey({ channel: 'whatsapp', line: 'marketing', person: '919876543210' }),
      'whatsapp:marketing:919876543210',
    );
    assert.notEqual(
      targetKey({ channel: 'whatsapp', line: 'marketing', person: '9198' }),
      targetKey({ channel: 'whatsapp', line: 'clients', person: '9198' }),
    );
  });

  it('builds the query the thread route reads', () => {
    assert.deepEqual(targetQuery({ channel: 'app', conversationId: 'c1' }), {
      channel: 'app',
      conversationId: 'c1',
    });
    assert.deepEqual(targetQuery({ channel: 'whatsapp', line: 'clients', person: 'user:u1' }), {
      channel: 'whatsapp',
      line: 'clients',
      person: 'user:u1',
    });
  });
});

describe('sanitiseInstruction', () => {
  it('trims and plains the line endings', () => {
    assert.equal(sanitiseInstruction('  polite reply\r\nshorter \r\n', 1000), 'polite reply\nshorter');
  });

  it('is empty for nothing worth sending', () => {
    assert.equal(sanitiseInstruction('   \n\t ', 1000), '');
  });

  it('cuts to the longest allowed', () => {
    assert.equal(sanitiseInstruction('a'.repeat(1500), 1000).length, 1000);
  });

  it('never leaves half an emoji at the cut', () => {
    const text = 'a'.repeat(9) + '😀' + 'b'.repeat(10);
    // Cutting at 10 would land between the two halves of the emoji.
    const out = sanitiseInstruction(text, 10);
    assert.equal(out, 'a'.repeat(9));
    assert.ok(!/[\ud800-\udbff]$/.test(out));
  });
});

describe('appendToBox', () => {
  it('puts the text in an empty box as it is', () => {
    assert.equal(appendToBox('', 'Namaste'), 'Namaste');
    assert.equal(appendToBox('  \n ', 'Namaste'), 'Namaste');
  });

  it('puts a blank line between what is typed and the draft', () => {
    assert.equal(appendToBox('Hi sir,', 'Namaste'), 'Hi sir,\n\nNamaste');
    assert.equal(appendToBox('Hi sir,  \n\n', 'Namaste'), 'Hi sir,\n\nNamaste');
  });

  it('leaves the box alone for an empty draft', () => {
    assert.equal(appendToBox('Hi', '   '), 'Hi');
  });
});

describe('warnings', () => {
  const ws = [warn('unsourced_figure', 'amber', 'a'), warn('free_month', 'red', 'b'), warn('unsourced_date', 'amber', 'c'), warn('link_in_app', 'red', 'd')];

  it('sorts red first and keeps the server order within a severity', () => {
    assert.deepEqual(
      sortWarnings(ws).map((w) => w.words),
      ['b', 'd', 'a', 'c'],
    );
  });

  it('does not touch the list it is given', () => {
    const copy = [...ws];
    sortWarnings(ws);
    assert.deepEqual(ws, copy);
  });

  it('knows a draft with a red warning', () => {
    assert.equal(hasRedWarning({ warnings: ws }), true);
    assert.equal(hasRedWarning({ warnings: [warn('other', 'amber')] }), false);
    assert.equal(hasRedWarning({ warnings: [] }), false);
  });

  it('reads a highlight kind\'s severity off the warnings, red winning', () => {
    const sev = severityByKind([warn('other', 'amber'), warn('other', 'red'), warn('unsourced_date', 'amber')]);
    assert.equal(sev.get('other'), 'red');
    assert.equal(sev.get('unsourced_date'), 'amber');
    assert.equal(sev.get('free_month'), undefined);
  });

  it('joins the words for a kind once each, worst first', () => {
    const words = warningWordsFor(
      [warn('unsourced_figure', 'amber', 'Check the amount.'), warn('unsourced_figure', 'red', 'Rule broken.'), warn('unsourced_figure', 'amber', 'Check the amount.')],
      ['unsourced_figure'],
    );
    assert.equal(words, 'Rule broken. Check the amount.');
  });
});

describe('draftSegments', () => {
  const text = 'Your bill is Rs 3,540 due on 5 Nov.';
  const sev = new Map([
    ['unsourced_figure' as const, 'amber' as const],
    ['free_month' as const, 'red' as const],
  ]);

  it('is one plain run with no highlights', () => {
    assert.deepEqual(draftSegments(text, []), [{ text, kinds: [], severity: null }]);
  });

  it('is nothing for no text', () => {
    assert.deepEqual(draftSegments('', [{ start: 0, end: 3, kind: 'other' }]), []);
  });

  it('cuts one highlight into plain, marked, plain', () => {
    const segs = draftSegments(text, [{ start: 13, end: 21, kind: 'unsourced_figure' }], sev);
    assert.deepEqual(
      segs.map((s) => [s.text, s.severity]),
      [
        ['Your bill is ', null],
        ['Rs 3,540', 'amber'],
        [' due on 5 Nov.', null],
      ],
    );
    assert.equal(join(segs), text);
  });

  it('clips a range that runs past the end', () => {
    const segs = draftSegments(text, [{ start: 30, end: 999, kind: 'unsourced_figure' }], sev);
    assert.equal(join(segs), text);
    assert.equal(segs[segs.length - 1]!.text, text.slice(30));
    assert.equal(segs[segs.length - 1]!.severity, 'amber');
  });

  it('drops empty, backwards, fractional-nonsense and non-finite ranges, keeping every character', () => {
    const segs = draftSegments(
      text,
      [
        { start: 5, end: 5, kind: 'other' },
        { start: 10, end: 4, kind: 'other' },
        { start: -20, end: -1, kind: 'other' },
        { start: Number.NaN, end: 8, kind: 'other' },
        { start: 0, end: Number.POSITIVE_INFINITY, kind: 'other' },
      ],
      sev,
    );
    assert.equal(join(segs), text);
    assert.deepEqual(segs, [{ text, kinds: [], severity: null }]);
  });

  it('clips a range that starts before the text', () => {
    const segs = draftSegments(text, [{ start: -5, end: 4, kind: 'free_month' }], sev);
    assert.equal(segs[0]!.text, 'Your');
    assert.equal(segs[0]!.severity, 'red');
    assert.equal(join(segs), text);
  });

  it('lets an overlap carry both kinds and the worse severity, without repeating a character', () => {
    const segs = draftSegments(
      text,
      [
        { start: 13, end: 21, kind: 'unsourced_figure' },
        { start: 18, end: 26, kind: 'free_month' },
      ],
      sev,
    );
    assert.equal(join(segs), text);
    assert.deepEqual(
      segs.map((s) => [s.text, s.kinds, s.severity]),
      [
        ['Your bill is ', [], null],
        ['Rs 3,', ['unsourced_figure'], 'amber'],
        ['540', ['unsourced_figure', 'free_month'], 'red'],
        [' due ', ['free_month'], 'red'],
        ['on 5 Nov.', [], null],
      ],
    );
  });

  it('joins neighbouring runs that carry the same kind', () => {
    const segs = draftSegments(
      'abcdef',
      [
        { start: 0, end: 3, kind: 'unsourced_figure' },
        { start: 3, end: 6, kind: 'unsourced_figure' },
      ],
      sev,
    );
    assert.deepEqual(segs, [{ text: 'abcdef', kinds: ['unsourced_figure'], severity: 'amber' }]);
  });

  it('paints a kind with no matching warning as amber', () => {
    const segs = draftSegments('abc', [{ start: 0, end: 3, kind: 'other' }]);
    assert.equal(segs[0]!.severity, 'amber');
  });

  it('takes the whole emoji when an edge falls inside it', () => {
    const t = 'ok 😀 done';
    // "😀" is two code units at 3..5; an edge at 4 is inside it.
    const segs = draftSegments(t, [{ start: 4, end: 7, kind: 'other' }]);
    assert.equal(join(segs), t);
    assert.ok(segs.every((s) => !/^[\udc00-\udfff]/.test(s.text) && !/[\ud800-\udbff]$/.test(s.text)));
    assert.equal(segs.find((s) => s.severity)!.text.startsWith('😀'), true);
  });

  it('keeps Hindi text whole', () => {
    const t = 'आपका बिल ₹3,540 है';
    const i = t.indexOf('₹');
    const segs = draftSegments(t, [{ start: i, end: i + 6, kind: 'unsourced_figure' }], sev);
    assert.equal(join(segs), t);
    assert.equal(segs.find((s) => s.severity)!.text, '₹3,540');
  });
});

describe('mergeTurns', () => {
  it('puts turns oldest first and keeps each id once, the later copy winning', () => {
    const a = turn('t1', '2026-10-30T08:00:00Z', { instruction: 'old words' });
    const b = turn('t2', '2026-10-30T09:00:00Z');
    const a2 = turn('t1', '2026-10-30T08:00:00Z', { instruction: 'new words' });
    const out = mergeTurns([b], [a, a2]);
    assert.deepEqual(
      out.map((t) => t.id),
      ['t1', 't2'],
    );
    assert.equal(out[0]!.instruction, 'new words');
  });
});

describe('mergeThread', () => {
  const old1 = turn('t1', '2026-10-28T08:00:00Z');
  const old2 = turn('t2', '2026-10-29T08:00:00Z');
  const new3 = turn('t3', '2026-10-30T08:00:00Z');
  const new4 = turn('t4', '2026-10-30T09:00:00Z');

  it('takes the fresh read when nothing is held', () => {
    const fresh = thread([new3], true);
    assert.equal(mergeThread(undefined, fresh), fresh);
  });

  it('keeps turns loaded with "Load earlier" through a refetch, and the held hasMore', () => {
    const held = thread([old1, old2, new3], false);
    const fresh = thread([old2, new3, new4], true);
    const out = mergeThread(held, fresh);
    assert.deepEqual(
      out.turns.map((t) => t.id),
      ['t1', 't2', 't3', 't4'],
    );
    // The held page reaches back further, so what it knew about older turns stands.
    assert.equal(out.hasMore, false);
  });

  it('follows the fresh hasMore when the fresh page reaches back as far', () => {
    const held = thread([new3], false);
    const fresh = thread([old2, new3], true);
    assert.equal(mergeThread(held, fresh).hasMore, true);
  });

  it('drops the held turns when the chat has moved to another login\'s thread', () => {
    const held = thread([old1, old2], false, 'u-1');
    const fresh = thread([new3], true, 'u-2');
    const out = mergeThread(held, fresh);
    assert.deepEqual(
      out.turns.map((t) => t.id),
      ['t3'],
    );
    assert.equal(out.hasMore, true);
  });
});

describe('withTurn / withEarlier', () => {
  it('lays a new turn on the held thread with the new context', () => {
    const held = thread([turn('t1', '2026-10-30T08:00:00Z')], true);
    const ctx = { ...context(), header: 'Newer header' };
    const out = withTurn(held, turn('t2', '2026-10-30T09:00:00Z'), ctx);
    assert.deepEqual(
      out.turns.map((t) => t.id),
      ['t1', 't2'],
    );
    assert.equal(out.context.header, 'Newer header');
    assert.equal(out.hasMore, true);
  });

  it('stands alone when nothing was held', () => {
    const out = withTurn(undefined, turn('t1', '2026-10-30T08:00:00Z'), context());
    assert.equal(out.turns.length, 1);
    assert.equal(out.hasMore, false);
  });

  it('puts earlier turns in front and takes their hasMore', () => {
    const held = thread([turn('t3', '2026-10-30T08:00:00Z')], true);
    const earlier = thread([turn('t1', '2026-10-28T08:00:00Z'), turn('t2', '2026-10-29T08:00:00Z')], false);
    const out = withEarlier(held, earlier);
    assert.deepEqual(
      out.turns.map((t) => t.id),
      ['t1', 't2', 't3'],
    );
    assert.equal(out.hasMore, false);
  });
});

describe('words on screen', () => {
  it('says "You" for the admin looking at it, else the name, else "A teammate"', () => {
    assert.equal(askedByLabel({ askedBy: { id: 'a1', name: 'Asha' } }, 'a1'), 'You');
    assert.equal(askedByLabel({ askedBy: { id: 'a2', name: 'Ravi' } }, 'a1'), 'Ravi');
    assert.equal(askedByLabel({ askedBy: { id: 'a2', name: null } }, 'a1'), 'A teammate');
    assert.equal(askedByLabel({ askedBy: { id: 'a2', name: '  ' } }, null), 'A teammate');
  });

  it('shows the clock today, "Yesterday" the day before, else the date', () => {
    const now = new Date(2026, 9, 30, 15, 0); // 30 Oct 2026, 15:00 local
    assert.equal(turnWhen(new Date(2026, 9, 30, 9, 5).toISOString(), now), '09:05');
    assert.equal(turnWhen(new Date(2026, 9, 29, 23, 40).toISOString(), now), 'Yesterday 23:40');
    assert.equal(turnWhen(new Date(2026, 9, 12, 7, 0).toISOString(), now), '12 Oct, 07:00');
    assert.equal(turnWhen('not a date', now), '');
  });

  it('says the busy words for REPLY_HELPER_BUSY', () => {
    assert.equal(
      askFailureWords({ status: 409, code: 'REPLY_HELPER_BUSY', message: 'busy' }),
      'Already writing a reply for this person — wait for it.',
    );
  });

  it('has plain words for the other failures', () => {
    assert.match(askFailureWords({ status: 0, code: 'NETWORK_ERROR' }), /connection dropped.*check the thread before asking again/);
    assert.match(askFailureWords({ status: 403 }), /not allowed/);
    assert.match(askFailureWords({ status: 500 }), /problem on the server/);
    // A gateway timeout may still have an answer coming: never invite a second, paid ask.
    assert.match(askFailureWords({ status: 504 }), /check the thread before asking again/);
    assert.equal(askFailureWords({ status: 422, message: 'Too long' }), 'Too long');
    assert.match(askFailureWords(null), /could not answer/);
  });
});
