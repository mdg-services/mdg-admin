/**
 * Checks for the Work permits screens' words and rules (`src/pages/dealers/vault/workPermits/format.ts`):
 * every stage and attention reason has words, which settle buttons each stage gets, how
 * work and complaint lines read. Plain `node:test` over the pure module:
 *
 *   cd mdg-admin && npm run check:work-permits
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  WORK_PERMIT_ATTENTION,
  WORK_PERMIT_FINAL_STAGES,
  WORK_PERMIT_STAGES,
  LETTERHEAD_WAYS,
} from '../shared/src/types/workPermits';

import {
  ATTENTION_WORDS,
  complaintText,
  FINAL_STAGES,
  isDraftStage,
  isFinalStage,
  isLiveOnSdms,
  LETTERHEAD_WORDS,
  paneHref,
  settleActions,
  STAGE_INTENT,
  STAGE_WORDS,
  workText,
} from '../src/pages/dealers/vault/workPermits/format';

describe('work permit words', () => {
  it('has words and a colour for every stage, attention reason and letterhead way', () => {
    for (const s of WORK_PERMIT_STAGES) {
      assert.ok(STAGE_WORDS[s], s);
      assert.ok(STAGE_INTENT[s], s);
    }
    for (const a of WORK_PERMIT_ATTENTION) assert.ok(ATTENTION_WORDS[a], a);
    for (const w of LETTERHEAD_WAYS) assert.ok(LETTERHEAD_WORDS[w], w);
  });

  it('shows no portal codes as the primary words', () => {
    for (const s of WORK_PERMIT_STAGES) assert.doesNotMatch(STAGE_WORDS[s], /NW_|MW_|\b[789]00\b/);
  });

  it('agrees with the shared list of final stages', () => {
    assert.deepEqual([...FINAL_STAGES].sort(), [...WORK_PERMIT_FINAL_STAGES].sort());
  });

  it('sorts stages into final, draft and live', () => {
    assert.equal(isFinalStage('closed'), true);
    assert.equal(isFinalStage('lapsed'), false);
    assert.equal(isDraftStage('confirming'), true);
    assert.equal(isLiveOnSdms('issued'), true);
    assert.equal(isLiveOnSdms('unclear'), true);
    assert.equal(isLiveOnSdms('drafting'), false);
    assert.equal(isLiveOnSdms('not_issued'), false);
  });
});

describe('settleActions', () => {
  it('offers found / not found on an unclear permit, and no clear flag with it', () => {
    assert.deepEqual(settleActions({ stage: 'unclear', attention: 'unclear_press' }), ['found', 'not_found']);
    assert.deepEqual(settleActions({ stage: 'unclear' }), ['found', 'not_found']);
  });

  it('offers closing on issued and lapsed permits', () => {
    assert.deepEqual(settleActions({ stage: 'issued' }), ['close_now', 'closed_on_sdms']);
    assert.deepEqual(settleActions({ stage: 'lapsed' }), ['close_now', 'closed_on_sdms']);
  });

  it('adds clear flag whenever a flag is up on a stage that is not a lost Submit', () => {
    assert.deepEqual(settleActions({ stage: 'issued', attention: 'close_failed' }), [
      'close_now',
      'closed_on_sdms',
      'clear_flag',
    ]);
    assert.deepEqual(settleActions({ stage: 'not_issued', attention: 'refused' }), ['clear_flag']);
  });

  it('offers nothing for a quiet permit', () => {
    assert.deepEqual(settleActions({ stage: 'closed' }), []);
    assert.deepEqual(settleActions({ stage: 'drafting' }), []);
  });
});

describe('lines', () => {
  it('reads the work as nature, main work, sub works', () => {
    assert.equal(
      workText({ nature: 'Automation', mainWork: 'Corrective maintenance', subWorks: ['DU automation', 'Cabling'] }),
      'Automation ▸ Corrective maintenance ▸ DU automation, Cabling',
    );
    assert.equal(workText({ nature: 'Civil', mainWork: 'Repair', subWorks: [] }), 'Civil ▸ Repair');
    assert.equal(workText(undefined), '-');
  });

  it('reads the complaint link and the outlet pane link', () => {
    assert.equal(complaintText(undefined), 'Not against a complaint');
    assert.equal(complaintText({ type: 'Dispenser', number: '123', date: '2026-11-20' }), 'Dispenser · #123 · 2026-11-20');
    assert.equal(paneHref('abc'), '/dealers/abc?tab=data-vault&vault=work-permits');
  });
});
