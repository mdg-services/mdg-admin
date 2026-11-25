import { describe, expect, it } from 'vitest';

import type { KavachCheckRow, KavachReviewGroup } from '@dk/shared';

import {
  canReview,
  dueWords,
  everyWords,
  filterOutlets,
  groupLabel,
  groupSummary,
  nextCheckId,
  outletFigures,
  progressWords,
  reasonLabel,
  runProgress,
  runQueue,
  sortGroups,
  sortOutletChecks,
  spanWords,
  stateIntent,
  stateLabel,
  waitingTotal,
  waitWords,
  withSkipped,
} from './kavachWords';

const H = 3_600_000;
const NOW = Date.parse('2026-11-25T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const group = (over: Partial<KavachReviewGroup>): KavachReviewGroup => ({
  key: 'k',
  label: 'L',
  sub: '',
  count: 1,
  oldestAt: ago(H),
  lateCount: 0,
  ...over,
});

describe('waiting and due words', () => {
  it('says a span in the unit a person says', () => {
    expect(spanWords(20_000)).toBe('under a minute');
    expect(spanWords(12 * 60_000)).toBe('12 min');
    expect(spanWords(3 * H + 40 * 60_000)).toBe('3 h');
    expect(spanWords(24 * H)).toBe('1 day');
    expect(spanWords(75 * H)).toBe('3 days');
  });

  it('writes how long a check has waited', () => {
    expect(waitWords(ago(3 * H), NOW)).toBe('waiting 3 h');
    expect(waitWords(ago(10_000), NOW)).toBe('just arrived');
    expect(waitWords(null, NOW)).toBe('');
    expect(waitWords('not a date', NOW)).toBe('');
  });

  it('writes the due time before it and the lateness after it', () => {
    const due = '2026-11-25T04:30:00.000Z'; // 10:00 IST
    expect(dueWords(due, false, Date.parse('2026-11-25T02:00:00.000Z'))).toBe('due 10:00');
    expect(dueWords(due, true, NOW)).toBe('5 h late');
    expect(dueWords('2026-11-26T04:30:00.000Z', false, NOW)).toBe('due 26 Nov, 10:00');
    expect(dueWords(null, false, NOW)).toBe('');
  });
});

describe('plain labels', () => {
  it('names the send-back reasons the way the brief does', () => {
    expect(reasonLabel('not_clear')).toBe('Photo not clear');
    expect(reasonLabel('wrong_page')).toBe('Wrong page');
    expect(reasonLabel('numbers_differ')).toBe("Numbers don't match");
    expect(reasonLabel('not_updated')).toBe('Not updated today');
    expect(reasonLabel('other')).toBe('Something else…');
  });

  it('names how often a point comes round', () => {
    expect(everyWords(null)).toBe('When it happens');
    expect(everyWords(1)).toBe('Every day');
    expect(everyWords(7)).toBe('Every week');
    expect(everyWords(30)).toBe('Every month');
    expect(everyWords(365)).toBe('Every year');
    expect(everyWords(90)).toBe('Every 90 days');
  });

  it('gives every state a word, so colour is never the only sign', () => {
    expect(stateLabel('sent')).toBe('Waiting for MDG');
    expect(stateLabel('todo', true)).toBe('To do (late)');
    expect(stateLabel('done', true)).toBe('Done');
    expect(stateIntent('todo', true)).toBe('danger');
    expect(stateIntent('todo', false)).toBe('warning');
    expect(stateIntent('done')).toBe('success');
  });

  it('names the groups', () => {
    expect(groupLabel('sdms')).toBe('IndianOil portal');
    expect(groupLabel('daily')).toBe('Every day');
  });
});

describe('review groups', () => {
  it('summarises a group in one line', () => {
    const g = group({ count: 12, lateCount: 3, oldestAt: ago(2 * H) });
    expect(groupSummary(g, NOW)).toBe('12 to check · 3 late · waiting 2 h');
    expect(groupSummary(group({ count: 1, oldestAt: ago(10_000) }), NOW)).toBe('1 to check · just arrived');
  });

  it('puts the longest wait first and does not change the input', () => {
    const a = group({ key: 'a', label: 'A', oldestAt: ago(1 * H) });
    const b = group({ key: 'b', label: 'B', oldestAt: ago(5 * H) });
    const input = [a, b];
    expect(sortGroups(input).map((g) => g.key)).toEqual(['b', 'a']);
    expect(input.map((g) => g.key)).toEqual(['a', 'b']);
  });

  it('adds up the badge', () => {
    expect(waitingTotal([group({ count: 4 }), group({ count: 9 })])).toBe(13);
    expect(waitingTotal(undefined)).toBe(0);
  });
});

describe('the run: which check opens next', () => {
  const rows = ['c1', 'c2', 'c3', 'c4'].map((id) => ({ id }));

  it('lists the server order, minus what was decided', () => {
    expect(runQueue(rows, new Set(['c1']), [])).toEqual(['c2', 'c3', 'c4']);
  });

  it('moves a skipped check to the back, in the order skipped', () => {
    expect(runQueue(rows, new Set(), ['c1', 'c3'])).toEqual(['c2', 'c4', 'c1', 'c3']);
  });

  it('forgets a skipped check that is no longer in the group', () => {
    expect(runQueue(rows, new Set(), ['gone'])).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('opens the check the admin asked for first, even when the list does not hold it', () => {
    expect(runQueue(rows, new Set(), [], 'c3')).toEqual(['c3', 'c1', 'c2', 'c4']);
    expect(runQueue(rows, new Set(), [], 'data-1')).toEqual(['data-1', 'c1', 'c2', 'c3', 'c4']);
    // Once it is decided it is gone.
    expect(runQueue(rows, new Set(['data-1']), [], 'data-1')).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('takes the head of the queue once the handled check is out of it', () => {
    expect(nextCheckId(['c1', 'c2', 'c3'], 'c1')).toBe('c2');
    expect(nextCheckId(['c1'], 'c1')).toBeNull();
  });

  it('skipping twice does not list the check twice', () => {
    expect(withSkipped(['a', 'b'], 'a')).toEqual(['b', 'a']);
  });

  it('counts "3 of 12"', () => {
    const p = runProgress(2, 10);
    expect(p).toMatchObject({ position: 3, total: 12, left: 10, done: 2 });
    expect(progressWords(p)).toBe('3 of 12');
    expect(progressWords(runProgress(0, 5))).toBe('1 of 5');
    expect(progressWords(runProgress(4, 0))).toBe('4 of 4');
  });
});

describe('outlets', () => {
  const rows = [
    { on: true, dealerCode: '1E', dealerName: 'Shree Fuels', oilCompany: 'IOCL' },
    { on: false, dealerCode: '2E', dealerName: 'Kumar Petro', oilCompany: 'HPCL' },
    { on: true, dealerCode: '3E', dealerName: 'Singh and Sons', oilCompany: null },
  ];

  it('filters on and off, then searches code, name and oil company', () => {
    expect(filterOutlets(rows, 'on', '').map((r) => r.dealerCode)).toEqual(['1E', '3E']);
    expect(filterOutlets(rows, 'off', '').map((r) => r.dealerCode)).toEqual(['2E']);
    expect(filterOutlets(rows, 'all', 'kumar').map((r) => r.dealerCode)).toEqual(['2E']);
    expect(filterOutlets(rows, 'all', 'hpcl').map((r) => r.dealerCode)).toEqual(['2E']);
    expect(filterOutlets(rows, 'on', '3e').map((r) => r.dealerCode)).toEqual(['3E']);
  });

  it('counts what is to do as the open points plus the sent-back ones', () => {
    const summary = {
      pct: 40,
      donePoints: 4,
      totalPoints: 10,
      counts: { done: 4, sent: 2, todo: 3, late: 1, sentBack: 1 },
      computedAt: '2026-11-25T00:00:00.000Z',
    };
    expect(outletFigures({ summary, waitingReview: 2 })).toEqual({ todo: 4, late: 1, waiting: 2 });
    expect(outletFigures({ summary: null, waitingReview: 0 })).toEqual({ todo: null, late: null, waiting: 0 });
  });

  it('orders an outlet’s checks: with MDG first, then late, then the rest, finished last', () => {
    const row = (title: string, state: KavachCheckRow['state'], late = false, dueAt: string | null = null) => ({
      title,
      state,
      late,
      dueAt,
    });
    const sorted = sortOutletChecks([
      row('done', 'done'),
      row('todo-soon', 'todo', false, '2026-11-25T05:00:00.000Z'),
      row('todo-late', 'todo', true, '2026-11-25T08:00:00.000Z'),
      row('sent', 'sent'),
      row('back', 'sent_back'),
    ]);
    expect(sorted.map((r) => r.title)).toEqual(['sent', 'back', 'todo-late', 'todo-soon', 'done']);
  });

  it('opens a sent check, or a data point, in the review run', () => {
    expect(canReview({ state: 'sent', how: 'photo' })).toBe(true);
    expect(canReview({ state: 'todo', how: 'data' })).toBe(true);
    expect(canReview({ state: 'todo', how: 'photo' })).toBe(false);
    expect(canReview({ state: 'excused', how: 'data' })).toBe(false);
  });
});
