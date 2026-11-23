/**
 * Checks for the Complaints screens' words and rules (`src/pages/dealers/vault/complaints/format.ts`):
 * every stage and attention reason has words, which stages count as open, when a complaint
 * waits on the dealer, how ages read. Plain `node:test` over the pure module:
 *
 *   cd mdg-admin && npm run check:complaints
 *
 * Outside `src/` on purpose, like the other check scripts: the build type-checks `src/`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COMPLAINT_ATTENTION,
  COMPLAINT_FINAL_STAGES,
  COMPLAINT_STAGES,
  type ComplaintAdminRow,
} from '../shared/src/types/complaints';

import {
  ageText,
  ATTENTION_WORDS,
  FINAL_STAGES,
  isOpenOnPortal,
  isOpenStage,
  originLabel,
  paneHref,
  STAGE_INTENT,
  STAGE_WORDS,
  waitingForDealer,
} from '../src/pages/dealers/vault/complaints/format';

const row = (over: Partial<ComplaintAdminRow>) => ({ origin: 'chat', stage: 'filed', ...over }) as ComplaintAdminRow;

describe('complaint words', () => {
  it('has words and a colour for every stage and every attention reason', () => {
    for (const s of COMPLAINT_STAGES) {
      assert.ok(STAGE_WORDS[s]);
      assert.ok(STAGE_INTENT[s]);
    }
    for (const a of COMPLAINT_ATTENTION) assert.ok(ATTENTION_WORDS[a]);
  });

  it('has plain words for the stalled flag, in every copy of the shared list', () => {
    assert.ok((COMPLAINT_ATTENTION as readonly string[]).includes('stalled'));
    assert.match(ATTENTION_WORDS.stalled, /not moved/i);
    // The team's way out of the flag is the existing "Clear this flag" button.
    assert.match(ATTENTION_WORDS.stalled, /clear this flag/i);
    assert.doesNotMatch(ATTENTION_WORDS.stalled, /\b(sir|madam)\b/i);
  });

  it('agrees with the shared list of final stages', () => {
    assert.deepEqual([...FINAL_STAGES].sort(), [...COMPLAINT_FINAL_STAGES].sort());
  });

  it('counts a stage as open until nothing more can happen on the portal', () => {
    assert.equal(isOpenStage('assigned'), true);
    assert.equal(isOpenStage('unclear'), true);
    assert.equal(isOpenStage('closed'), false);
    assert.equal(isOpenStage('duplicate'), false);
  });

  it('waits on the dealer only for chat complaints at a dealer step', () => {
    assert.equal(waitingForDealer(row({ stage: 'fixed_awaiting_ack' })), true);
    assert.equal(waitingForDealer(row({ stage: 'confirming' })), true);
    assert.equal(waitingForDealer(row({ stage: 'filed' })), false);
    assert.equal(waitingForDealer(row({ origin: 'portal', stage: 'fixed_awaiting_ack' })), false);
  });

  it('waits on the dealer for a portal complaint once the team has asked "is it fixed?"', () => {
    const asked = row({ origin: 'portal', stage: 'fixed_awaiting_ack', ackAskedAt: '2026-11-22T10:00:00Z' });
    assert.equal(waitingForDealer(asked), true);
    assert.equal(waitingForDealer({ ...asked, stage: 'assigned' }), false);
  });

  it('counts Open like the server: not drafts, not a yes still to come', () => {
    assert.equal(isOpenOnPortal('drafting'), false);
    assert.equal(isOpenOnPortal('confirming'), false);
    assert.equal(isOpenOnPortal('filed'), true);
    assert.equal(isOpenOnPortal('unclear'), true);
    assert.equal(isOpenOnPortal('closed'), false);
  });

  it('names where a complaint came from and where the outlet pane is', () => {
    assert.equal(originLabel(row({})), 'from chat');
    assert.equal(originLabel(row({ origin: 'portal' })), 'found on portal');
    assert.equal(originLabel(row({ origin: 'portal', systemRaised: true })), 'raised by system');
    assert.equal(paneHref('abc'), '/dealers/abc?tab=data-vault&vault=complaints');
  });
});

describe('ageText', () => {
  const now = Date.parse('2026-11-22T12:00:00Z');
  it('reads minutes, hours and days', () => {
    assert.equal(ageText('2026-11-22T11:59:30Z', now), 'just now');
    assert.equal(ageText('2026-11-22T11:15:00Z', now), '45m ago');
    assert.equal(ageText('2026-11-22T08:55:00Z', now), '3h 5m ago');
    assert.equal(ageText('2026-11-19T12:00:00Z', now), '3d ago');
    assert.equal(ageText(undefined, now), '-');
  });
});
