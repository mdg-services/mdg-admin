/**
 * Checks for the watch period's screens (`src/lib/watchHold.ts`): the held-message
 * queue's words and limits, the setup checklist, and the extend-or-end prompt.
 *
 *   cd mdg-admin && npm run check:watch-hold
 *
 * which is `npx tsx --test scripts/watchHold.check.ts`. The schema and the shared
 * tables are imported from source by relative path, as `onboarding.check.ts` does,
 * because `@dk/shared` resolves to its compiled `dist/` outside Vite.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dropHeldMessageSchema } from '../shared/src/schemas/heldMessage';
import { SETUP_CHECKLIST_KEYS, type SetupChecklistItem } from '../shared/src/types/outletSetup';
import { HELD_MESSAGE_SOURCES } from '../shared/src/types/heldMessage';
import {
  CHECKLIST_LABEL,
  DROP_REASON_MAX,
  DROP_REASON_MIN,
  audienceLabel,
  canRetryLoginCheck,
  checklistOpenKeys,
  checklistSummary,
  dropBody,
  dropProblem,
  heldCountLine,
  heldHeadline,
  heldTimingLine,
  missingChecklist,
  sourceLabel,
  spanLabel,
  startNeedsReason,
  watchNeedsDecision,
} from '../src/lib/watchHold';
import { setupChip } from '../src/lib/onboarding';

const NOW = Date.parse('2026-10-23T10:00:00.000Z');
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const item = (key: SetupChecklistItem['key'], state: SetupChecklistItem['state'], detail: string | null = null): SetupChecklistItem => ({
  key,
  state,
  detail,
});

describe('dropping a held message', () => {
  it('needs a reason of at least three characters, at most what the server takes', () => {
    assert.equal(dropProblem(''), 'Say why you are dropping it, so the next person knows.');
    assert.equal(dropProblem('  no '), 'Say why you are dropping it, so the next person knows.');
    assert.equal(dropProblem('Wrong tanker'), null);
    assert.equal(dropProblem('x'.repeat(DROP_REASON_MAX)), null);
    assert.match(dropProblem('x'.repeat(DROP_REASON_MAX + 1)) ?? '', /under 300/);
  });

  it('builds the body the shared schema accepts, trimmed', () => {
    const body = dropBody('  The figures are for another tanker  ');
    assert.deepEqual(body, { reason: 'The figures are for another tanker' });
    assert.ok(dropHeldMessageSchema.safeParse(body).success);
    assert.ok(!dropHeldMessageSchema.safeParse({ reason: 'x'.repeat(DROP_REASON_MIN - 1) }).success);
    assert.ok(!dropHeldMessageSchema.safeParse({ reason: 'x'.repeat(DROP_REASON_MAX + 1) }).success);
  });
});

describe('how a held message is described', () => {
  it('names every sender the server can hold for, and who it would reach', () => {
    for (const s of HELD_MESSAGE_SOURCES) assert.ok(sourceLabel(s).length > 0, s);
    assert.equal(sourceLabel('kavach_digest'), 'Kavach daily line');
    assert.equal(audienceLabel('owners'), 'Owners');
    assert.equal(audienceLabel('manager'), 'The manager');
    assert.equal(audienceLabel('both'), 'Owners and the manager');
  });

  it('says how long it has waited and when it goes on its own', () => {
    assert.equal(
      heldTimingLine({ heldAt: iso(NOW - 3 * HOUR - 5 * 60_000), expiresAt: iso(NOW + 21 * HOUR) }, NOW),
      'held 3h 5m ago · dropped unsent in 21h 0m if nobody decides',
    );
    assert.equal(
      heldTimingLine({ heldAt: iso(NOW - 10_000), expiresAt: iso(NOW + 24 * HOUR) }, NOW),
      'held just now · dropped unsent in 1d 0h if nobody decides',
    );
    assert.equal(
      heldTimingLine({ heldAt: iso(NOW - 25 * HOUR), expiresAt: iso(NOW - 60_000) }, NOW),
      'held 1d 1h ago · about to be dropped unsent',
    );
  });

  it('spans read as a person reads them', () => {
    assert.equal(spanLabel(0), '0m');
    assert.equal(spanLabel(42 * 60_000), '42m');
    assert.equal(spanLabel(90 * 60_000), '1h 30m');
    assert.equal(spanLabel(52 * HOUR), '2d 4h');
    assert.equal(spanLabel(-5), '0m');
  });

  it('counts in words, singular and plural, and says nothing for none', () => {
    assert.equal(heldHeadline(1), '1 message waiting');
    assert.equal(heldHeadline(3), '3 messages waiting');
    assert.equal(heldCountLine(0), null);
    assert.equal(heldCountLine(1), '1 message held for review');
    assert.equal(heldCountLine(4), '4 messages held for review');
  });
});

describe('the setup checklist', () => {
  const ready = SETUP_CHECKLIST_KEYS.map((k) => item(k, k === 'files_received' ? 'not_needed' : 'done'));

  it('has a plain label for every key the server can send', () => {
    for (const k of SETUP_CHECKLIST_KEYS) assert.ok(CHECKLIST_LABEL[k].length > 0, k);
  });

  it('only a missing line is open; not_needed and done never are', () => {
    assert.deepEqual(missingChecklist(ready), []);
    const open = [item('logins_working', 'missing', 'IRAS login is not saved yet'), item('kavach_started', 'missing'), item('files_received', 'not_needed')];
    assert.deepEqual(missingChecklist(open), ['logins_working', 'kavach_started']);
  });

  it('summarises it: ready, or how many are done of the lines that count', () => {
    assert.equal(checklistSummary([]), '');
    assert.equal(checklistSummary(ready), 'Ready to start');
    const some = [item('logins_working', 'done'), item('services_attached', 'done'), item('kavach_started', 'missing'), item('first_run_ok', 'missing'), item('files_received', 'not_needed')];
    assert.equal(checklistSummary(some), '2 of 4 ready · 2 to do');
  });

  it('starting needs a reason before "setting up" AND while any line is open — and only then', () => {
    assert.equal(startNeedsReason('setup', ready), false);
    assert.equal(startNeedsReason('setup', [item('kavach_started', 'missing')]), true);
    assert.equal(startNeedsReason('payment', ready), true);
    assert.equal(startNeedsReason('logins', []), true);
    // no checklist from the server (an old answer): the wave-1 rule alone
    assert.equal(startNeedsReason('setup', []), false);
  });

  it('reads the keys a CHECKLIST_OPEN refusal named, and nothing from any other error', () => {
    assert.deepEqual(checklistOpenKeys({ code: 'CHECKLIST_OPEN', details: { missing: ['kavach_started', 'first_run_ok'] } }), [
      'kavach_started',
      'first_run_ok',
    ]);
    assert.deepEqual(checklistOpenKeys({ code: 'CHECKLIST_OPEN' }), []);
    assert.equal(checklistOpenKeys({ code: 'NOT_READY' }), null);
    assert.equal(checklistOpenKeys(new Error('x')), null);
    assert.equal(checklistOpenKeys(null), null);
  });

  it('offers "try the logins again" for a login not tried or not told, never for a refused or missing one', () => {
    const l = (detail: string) => item('logins_working', 'missing', detail);
    assert.equal(canRetryLoginCheck(l('SDMS login is saved but has not been tried yet')), true);
    assert.equal(canRetryLoginCheck(l('SDMS login could not be tried (the portal did not answer): try again, or check it by hand')), true);
    assert.equal(canRetryLoginCheck(l('SDMS login is being tried now')), true);
    assert.equal(canRetryLoginCheck(l('SDMS login was refused by the portal: ask the owner for the right one')), false);
    assert.equal(canRetryLoginCheck(l('IRAS login is not saved yet')), false);
    assert.equal(canRetryLoginCheck(l('SDMS login was refused by the portal: ask the owner for the right one; IRAS login is saved but has not been tried yet')), false);
    assert.equal(canRetryLoginCheck(item('logins_working', 'done')), false);
    assert.equal(canRetryLoginCheck(item('kavach_started', 'missing', 'has not been tried yet')), false);
    assert.equal(canRetryLoginCheck(undefined), false);
  });
});

describe('the dealer page chip when the watch has run out', () => {
  const chip = (watchUntil: string, stage: 'watch' | 'live' = 'watch') =>
    setupChip(
      {
        stage,
        payment: { state: 'paid' } as never,
        waitingOn: 'nobody',
        stageSince: iso(NOW - 3 * HOUR),
        milestones: { watchUntil } as never,
      },
      NOW,
    );

  it('says a person has to decide, in the warning colour, once the days are over and it is still watched', () => {
    assert.deepEqual(chip(iso(NOW - HOUR)), { text: 'Watch over · end or extend', intent: 'warning' });
  });

  it('still says when the watch ends while it is running, and nothing once it is live', () => {
    assert.match(chip(iso(NOW + 5 * HOUR))?.text ?? '', /^Watching · ends /);
    assert.equal(chip(iso(NOW - HOUR), 'live'), null);
  });
});

describe('the end of the watch', () => {
  const watching = (watchUntil: string | null, stage: 'watch' | 'live' | 'setup' = 'watch') => ({
    stage,
    milestones: { watchUntil } as never,
  });

  it('asks for a decision only when the days have run out and the outlet is STILL being watched', () => {
    assert.equal(watchNeedsDecision(watching(iso(NOW - HOUR)), NOW), true);
    assert.equal(watchNeedsDecision(watching(iso(NOW + HOUR)), NOW), false);
    // already live (nothing was dropped): nothing to decide
    assert.equal(watchNeedsDecision(watching(iso(NOW - HOUR), 'live'), NOW), false);
    assert.equal(watchNeedsDecision(watching(iso(NOW - HOUR), 'setup'), NOW), false);
    assert.equal(watchNeedsDecision(watching(null), NOW), false);
  });
});
