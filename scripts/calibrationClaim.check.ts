/**
 * Checks for the calibration claim pane's rules
 * (`src/pages/dealers/vault/calibrationClaim/format.ts`): how often the pane
 * re-reads, which buttons are allowed and why not, what the corrections form
 * sends, how units are matched, and the words.
 *
 *   cd mdg-admin && npm run check:calibration-claim
 *
 * which is `npx tsx --test scripts/calibrationClaim.check.ts`. The shared tables
 * and schemas are imported from source by relative path, as `portalLogin.check.ts`
 * does, because `@dk/shared` resolves to its compiled `dist/` outside Vite.
 *
 * Every figure, name and serial below is invented. None is from a real outlet.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calibrationClaimActionSchema,
  claimDocumentUploadSchema,
  claimOverridesSchema,
} from '../shared/src/schemas/calibrationClaim';
import type {
  CalibrationClaimOverview,
  CalibrationClaimStage,
  CalibrationClaimView,
  ClaimCheck,
  ClaimDocumentView,
  ClaimPlan,
} from '../shared/src/types/calibrationClaim';
import { describeRunFailure } from '../src/lib/runFailure';
import {
  CLAIM_UPLOAD_MAX_BYTES,
  POLL_BUSY_MS,
  POLL_WAITING_MS,
  QUEUED_BADGE,
  approvalFacts,
  approveAction,
  blockerFixes,
  blockingChecks,
  buildUnitRows,
  claimGates,
  claimPollInterval,
  claimRunNowWords,
  claimUploadProblem,
  correctionFormFrom,
  correctionPayload,
  currentFinancialYear,
  defaultStartYear,
  exclusionChoices,
  fileSize,
  fyOptionLabel,
  gateForFix,
  historyNewestFirst,
  isClosed,
  isUploadSlot,
  letterStatus,
  normalizeSerial,
  openClaims,
  pickClaim,
  planSummary,
  reasonProblem,
  signedLetterIn,
  sortChecks,
  upsertClaim,
  valueRows,
} from '../src/pages/dealers/vault/calibrationClaim/format';

const plan = (over: Partial<ClaimPlan> = {}): ClaimPlan => ({
  financialYear: '2026-27',
  fyLabel: 'April 2026-March 2027',
  certificateNo: 'VC-TEST-0001',
  validityDate: '2027-03-31',
  receiptNo: 'RCPT-TEST-0001',
  receiptDate: '2026-01-06',
  calibrationDate: '2026-01-07',
  amountPerNozzle: 1500,
  nozzleCount: 12,
  totalAmount: 18000,
  dus: [
    {
      serialNo: '000100000001',
      duNo: '8',
      make: 'MakeA',
      model: 'M-1',
      nozzles: 4,
      nozzleLabels: [],
      include: true,
      reason: 'On the certificate and on IndianOil’s list.',
    },
    {
      serialNo: '100000000002',
      duNo: '9',
      make: 'MakeA',
      model: 'M-1',
      nozzles: 4,
      nozzleLabels: [],
      include: true,
      reason: 'On the certificate and on IndianOil’s list.',
    },
    {
      serialNo: 'SN 3',
      duNo: '10',
      make: 'MakeB',
      model: 'M-2',
      nozzles: 4,
      nozzleLabels: [],
      include: true,
      reason: 'On the certificate and on IndianOil’s list.',
    },
    {
      serialNo: '555555',
      duNo: '11',
      make: 'MakeC',
      model: 'M-3',
      nozzles: 1,
      nozzleLabels: [],
      include: false,
      reason: 'Not on the certificate.',
    },
  ],
  ...over,
});

const check = (over: Partial<ClaimCheck> = {}): ClaimCheck => ({
  key: 'k',
  level: 'block',
  ok: false,
  message: 'A thing failed.',
  ...over,
});

const claim = (over: Partial<CalibrationClaimView> = {}): CalibrationClaimView => ({
  id: 'claim-1',
  dealerId: 'dealer-1',
  dealerCode: 'T1',
  financialYear: '2026-27',
  fyLabel: 'April 2026-March 2027',
  stage: 'ready',
  blocker: null,
  working: null,
  queued: null,
  steps: [],
  documents: [],
  certificate: null,
  receipt: null,
  portal: null,
  plan: plan(),
  planHash: 'plan-hash-1',
  checks: [],
  overrides: {},
  approval: null,
  letter: {
    sentAt: '2026-11-01T05:00:00.000Z',
    askId: 'ask-1',
    askState: 'ACCEPTED',
    reminders: 0,
  },
  filing: { savedAt: null, finalizedAt: null, portalReference: null, markedByHand: false },
  history: [],
  createdAt: '2026-11-01T04:00:00.000Z',
  updatedAt: '2026-11-01T04:00:00.000Z',
  ...over,
});

const overview = (over: Partial<CalibrationClaimOverview> = {}): CalibrationClaimOverview => ({
  attached: true,
  dealerServiceId: 'ds-1',
  config: { amountPerNozzle: 1500, autoFinalize: false },
  wemmis: {
    status: 'saved',
    username: 'test-user',
    setAt: null,
    setVia: 'admin',
    traderIds: [],
    petrolTraderId: null,
  },
  claims: [],
  liveCaptcha: null,
  startableYears: ['2026-27', '2025-26'],
  ...over,
});

/** A paper on a claim, as the view lists it: only current papers are listed. */
const paper = (
  slot: ClaimDocumentView['slot'],
  source: ClaimDocumentView['source'],
): ClaimDocumentView => ({
  slot,
  filename: `${slot}.pdf`,
  contentType: 'application/pdf',
  size: 1024,
  source,
  addedAt: '2026-11-01T06:00:00.000Z',
});

/** The queued step the minute loop has not started yet. */
const QUEUED = { action: 'sdms_file', since: '2026-11-01T05:00:00.000Z' } as const;

describe('polling', () => {
  it('does not poll when there is nothing to read', () => {
    assert.equal(claimPollInterval(undefined), false);
    assert.equal(claimPollInterval(overview()), false);
  });

  it('polls every 3 seconds while a portal run is in flight', () => {
    const working = claim({
      working: { action: 'wemmis_fetch', runId: null, since: '2026-11-01T05:00:00.000Z' },
    });
    assert.equal(claimPollInterval(overview({ claims: [working] })), POLL_BUSY_MS);
    assert.equal(POLL_BUSY_MS, 3000);
  });

  it('polls every 3 seconds while a step is queued and about to start, whatever the stage', () => {
    // A queued step is picked up within a minute and the screen changes when it is: a
    // 30-second poll would show "Starting soon" for up to half a minute after it began.
    for (const stage of ['review', 'ready', 'filed'] as const) {
      assert.equal(
        claimPollInterval(overview({ claims: [claim({ stage, queued: QUEUED })] })),
        POLL_BUSY_MS,
        stage,
      );
    }
  });

  it('polls every 3 seconds while a picture code waits for a person, whatever the stage', () => {
    const captcha = {
      sessionId: 's',
      claimId: null,
      imageUrl: 'x',
      expiresAt: '2026-11-01T05:02:00.000Z',
    };
    assert.equal(
      claimPollInterval(
        overview({ claims: [claim({ stage: 'finalized' })], liveCaptcha: captcha }),
      ),
      POLL_BUSY_MS,
    );
  });

  it('polls every 30 seconds while a claim waits on someone, and not when only an admin can move it', () => {
    const slow: CalibrationClaimStage[] = ['documents', 'letter', 'ready', 'filing'];
    for (const stage of slow) {
      assert.equal(
        claimPollInterval(overview({ claims: [claim({ stage })] })),
        POLL_WAITING_MS,
        stage,
      );
    }
    assert.equal(POLL_WAITING_MS, 30000);
    const still: CalibrationClaimStage[] = ['review', 'filed', 'finalized', 'cancelled'];
    for (const stage of still) {
      assert.equal(claimPollInterval(overview({ claims: [claim({ stage })] })), false, stage);
    }
  });

  it('a closed claim that is somehow still working is still polled quickly', () => {
    const odd = claim({
      stage: 'cancelled',
      working: { action: 'sdms_file', runId: 'r', since: '2026-11-01T05:00:00.000Z' },
    });
    assert.equal(claimPollInterval(overview({ claims: [odd] })), POLL_BUSY_MS);
  });
});

describe('the claim list', () => {
  it('upsertClaim puts a new claim first and stops offering its year', () => {
    const older = claim({ id: 'old', financialYear: '2025-26', stage: 'finalized' });
    const o = overview({ claims: [older] });
    const next = upsertClaim(o, claim({ id: 'new', financialYear: '2026-27' }));
    assert.deepEqual(
      next.claims.map((c) => c.id),
      ['new', 'old'],
    );
    assert.deepEqual(next.startableYears, ['2025-26']);
  });

  it('upsertClaim replaces a claim in place and leaves the offered years alone', () => {
    const a = claim({ id: 'a', stage: 'documents' });
    const b = claim({ id: 'b', stage: 'letter' });
    const next = upsertClaim(overview({ claims: [a, b] }), { ...a, stage: 'ready' });
    assert.deepEqual(
      next.claims.map((c) => `${c.id}:${c.stage}`),
      ['a:ready', 'b:letter'],
    );
    assert.deepEqual(next.startableYears, ['2026-27', '2025-26']);
  });

  it('pickClaim prefers the chosen claim, then the newest open one, then nothing', () => {
    const closed = claim({ id: 'closed', stage: 'finalized' });
    const open1 = claim({ id: 'open1', stage: 'letter' });
    const open2 = claim({ id: 'open2', stage: 'documents' });
    const all = [closed, open1, open2];
    assert.equal(pickClaim(all, 'closed')?.id, 'closed');
    assert.equal(pickClaim(all, null)?.id, 'open1');
    assert.equal(pickClaim(all, 'gone')?.id, 'open1');
    assert.equal(pickClaim([closed], null), null);
    assert.deepEqual(
      openClaims(all).map((c) => c.id),
      ['open1', 'open2'],
    );
    assert.equal(isClosed(closed), true);
    assert.equal(isClosed(open1), false);
  });
});

describe('financial years', () => {
  it('turns on 1 April', () => {
    assert.equal(currentFinancialYear('2026-03-31'), '2025-26');
    assert.equal(currentFinancialYear('2026-04-01'), '2026-27');
    assert.equal(currentFinancialYear('2027-01-15'), '2026-27');
    assert.equal(currentFinancialYear('2099-12-31'), '2099-00');
  });

  it('opens the start form on the current year when it is on offer, else the newest', () => {
    assert.equal(defaultStartYear(['2026-27', '2025-26'], '2026-27'), '2026-27');
    assert.equal(defaultStartYear(['2025-26', '2024-25'], '2026-27'), '2025-26');
    assert.equal(defaultStartYear([], '2026-27'), '');
  });

  it('says after Run now which year it would start and where to follow it', () => {
    const words = claimRunNowWords('2026-11-02');
    assert.equal(words.title, 'Run started');
    assert.match(words.description, /starts the claim for FY 2026-27, unless that year already has one/);
    assert.match(words.description, /Data Vault tab, under Calibration claim/);
    assert.match(claimRunNowWords('2027-03-31').description, /FY 2026-27/);
    assert.match(claimRunNowWords('2027-04-01').description, /FY 2027-28/);
  });

  it('labels a year with its months and marks this one', () => {
    assert.equal(
      fyOptionLabel('2026-27', '2026-27'),
      'FY 2026-27 · April 2026 to March 2027 · this year',
    );
    assert.equal(fyOptionLabel('2025-26', '2026-27'), 'FY 2025-26 · April 2025 to March 2026');
  });
});

describe('the plan in words', () => {
  it('summarises units, nozzles and money for the year', () => {
    assert.equal(planSummary(plan()), '3 units · 12 nozzles · ₹18,000 for FY 2026-27');
  });

  it('says one unit and one nozzle in the singular', () => {
    const one = plan({
      nozzleCount: 1,
      totalAmount: 1500,
      dus: [
        {
          serialNo: 'A',
          duNo: null,
          make: null,
          model: null,
          nozzles: 1,
          nozzleLabels: [],
          include: true,
          reason: '',
        },
      ],
    });
    assert.equal(planSummary(one), '1 unit · 1 nozzle · ₹1,500 for FY 2026-27');
  });

  it('lists exactly what an approval will type, from the plan’s own figures', () => {
    const facts = Object.fromEntries(approvalFacts(plan()).map((f) => [f.label, f.value]));
    assert.equal(facts['Certificate number'], 'VC-TEST-0001');
    assert.equal(facts['Receipt number'], 'RCPT-TEST-0001');
    assert.equal(facts['Financial year'], 'April 2026-March 2027');
    assert.equal(facts['Amount'], '₹1,500 × 12 nozzles = ₹18,000');
    assert.match(facts['Units claimed'] ?? '', /DU 8 \(serial 000100000001\), 4 nozzles\nDU 9/);
    assert.doesNotMatch(facts['Units claimed'] ?? '', /555555/);
  });
});

describe('serial numbers and the units table', () => {
  it('compares serials without spaces, leading zeros or case', () => {
    assert.equal(normalizeSerial(' 000 100 '), '100');
    assert.equal(normalizeSerial('Sn 3'), normalizeSerial('SN3'));
    assert.notEqual(normalizeSerial('1001'), normalizeSerial('1010'));
  });

  it('joins the plan to the certificate by serial and adds units only SDMS lists', () => {
    const c = claim({
      certificate: {
        vcNumber: 'VC-TEST-0001',
        districtTraderNo: null,
        traderNo: null,
        businessName: null,
        natureOfBusiness: null,
        isPetrolPump: true,
        calibrationDate: '2026-01-07',
        nextVerificationText: null,
        validityDate: '2027-03-31',
        officerName: null,
        inspectorNo: null,
        mobile: null,
        address: null,
        district: null,
        state: null,
        pin: null,
        instruments: [
          {
            serialNo: '100000001',
            make: 'MakeA',
            model: 'M-1',
            validUptoQuarter: null,
            status: 'Verified',
            verified: true,
            fee: null,
            nozzles: [],
          },
          {
            serialNo: '100000000002',
            make: 'MakeA',
            model: 'M-1',
            validUptoQuarter: null,
            status: 'Rejected',
            verified: false,
            fee: null,
            nozzles: [],
          },
        ],
        receiptNumbers: [],
        depositDate: null,
        grandTotal: null,
        warnings: [],
      },
      portal: {
        checkedAt: '2026-11-01T05:00:00.000Z',
        vendor: {},
        dealerCodeText: null,
        dus: [
          {
            duNo: '12',
            make: 'MakeD',
            model: 'M-4',
            serialNo: '777777',
            nozzles: 2,
            duType: null,
            decommissionDate: null,
          },
          {
            duNo: '8',
            make: 'MakeA',
            model: 'M-1',
            serialNo: '000100000001',
            nozzles: 4,
            duType: null,
            decommissionDate: null,
          },
        ],
        existingClaims: [],
      },
    });
    const rows = buildUnitRows(c);
    // "000100000001" on the plan is the certificate's "100000001" once zeros are dropped.
    const first = rows.find((r) => r.serialNo === '000100000001');
    assert.equal(first?.verified, true);
    assert.equal(first?.included, true);
    const second = rows.find((r) => r.serialNo === '100000000002');
    assert.equal(second?.verified, false);
    // The certificate's and SDMS's copies of that unit are not listed a second time.
    assert.equal(rows.filter((r) => normalizeSerial(r.serialNo) === '100000001').length, 1);
    const sdmsOnly = rows.find((r) => r.serialNo === '777777');
    assert.equal(sdmsOnly?.included, false);
    assert.match(sdmsOnly?.reason ?? '', /not on the certificate/);
    // The plan's own left-out unit keeps the plan's reason.
    assert.equal(rows.find((r) => r.serialNo === '555555')?.reason, 'Not on the certificate.');
  });

  it('with no plan the rows are the certificate’s units and do not pretend to decide', () => {
    const c = claim({
      plan: null,
      certificate: {
        vcNumber: 'V',
        districtTraderNo: null,
        traderNo: null,
        businessName: null,
        natureOfBusiness: null,
        isPetrolPump: true,
        calibrationDate: null,
        nextVerificationText: null,
        validityDate: null,
        officerName: null,
        inspectorNo: null,
        mobile: null,
        address: null,
        district: null,
        state: null,
        pin: null,
        instruments: [
          {
            serialNo: 'ZZ1',
            make: null,
            model: null,
            validUptoQuarter: null,
            status: 'Verified',
            verified: true,
            fee: null,
            nozzles: [{ label: 'A1', product: 'MS', status: 'Verified', verified: true }],
          },
        ],
        receiptNumbers: [],
        depositDate: null,
        grandTotal: null,
        warnings: [],
      },
    });
    const rows = buildUnitRows(c);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.included, null);
    assert.equal(rows[0]?.nozzles, 1);
    assert.equal(rows[0]?.makeModel, '—');
    assert.deepEqual(
      exclusionChoices(c).map((e) => e.serialNo),
      ['ZZ1'],
    );
  });
});

describe('checks', () => {
  it('puts failed blocks first, then warnings, then facts, and passed ones last', () => {
    const list = [
      check({ key: 'a', level: 'info', ok: true }),
      check({ key: 'b', level: 'warn', ok: false }),
      check({ key: 'c', level: 'block', ok: false }),
      check({ key: 'd', level: 'info', ok: false }),
      check({ key: 'e', level: 'block', ok: false }),
    ];
    const { failed, passed } = sortChecks(list);
    assert.deepEqual(
      failed.map((c) => c.key),
      ['c', 'e', 'b', 'd'],
    );
    assert.deepEqual(
      passed.map((c) => c.key),
      ['a'],
    );
  });

  it('a block stops the claim until it is accepted; a warning never does', () => {
    const accepted = check({
      key: 'x',
      acknowledged: { byName: 'Test Admin', at: '2026-11-01T05:00:00.000Z', note: 'looked' },
    });
    const c = claim({
      checks: [check({ key: 'w', level: 'warn' }), accepted, check({ key: 'y' })],
    });
    assert.deepEqual(
      blockingChecks(c).map((k) => k.key),
      ['y'],
    );
  });
});

describe('what each button may do', () => {
  it('approve: needs a plan and no unaccepted block', () => {
    assert.equal(claimGates(claim({ plan: null })).approve.ok, false);
    assert.match(claimGates(claim({ plan: null })).approve.reason ?? '', /nothing to approve/);
    const blocked = claimGates(claim({ checks: [check(), check({ key: 'two' })] }));
    assert.equal(blocked.approve.ok, false);
    assert.match(blocked.approve.reason ?? '', /2 checks failed/);
    assert.equal(claimGates(claim()).approve.ok, true);
  });

  it('approve is allowed before the signed letter is back', () => {
    const g = claimGates(
      claim({
        stage: 'letter',
        letter: { sentAt: '2026-11-01T05:00:00.000Z', askId: 'a', askState: 'ASKED', reminders: 0 },
      }),
    );
    assert.equal(g.approve.ok, true);
  });

  it('remove approval only while it can still be taken back', () => {
    const approval = { byName: 'Test Admin', at: '2026-11-01T05:00:00.000Z', finalize: false };
    assert.equal(claimGates(claim({ approval })).unapprove.ok, true);
    assert.equal(claimGates(claim()).unapprove.ok, false);
    assert.equal(claimGates(claim({ approval, stage: 'filing' })).unapprove.ok, false);
    assert.equal(claimGates(claim({ approval, stage: 'filed' })).unapprove.ok, false);
  });

  it('file now: approved, signed letter in, stage ready, not busy', () => {
    const approval = { byName: 'Test Admin', at: '2026-11-01T05:00:00.000Z', finalize: false };
    const signed = [paper('signedLetter', 'dealer'), paper('signedLetterPdf', 'generated')];
    assert.equal(claimGates(claim({ documents: signed })).file.reason, 'Approve the claim first.');
    const notAccepted = claim({
      approval,
      letter: { sentAt: 'x', askId: 'a', askState: 'SENT', reminders: 0 },
    });
    assert.match(claimGates(notAccepted).file.reason ?? '', /Accept the signed letter first/);
    assert.equal(claimGates(claim({ approval, documents: signed })).file.ok, true);
    const busy = claim({
      approval,
      documents: signed,
      working: { action: 'sdms_preflight', runId: null, since: 'x' },
    });
    assert.equal(claimGates(busy).file.ok, false);
  });

  it('file now follows the signed PDF on the claim, not the owner’s request being accepted', () => {
    // The server's "file" action needs an approval and a current signed PDF, and nothing
    // about the request. A letter an admin uploaded by hand is a signed PDF on the claim
    // while the owner's request was never accepted (here it is still waiting): File now
    // must be open, not dead with "Accept the signed letter first", which cannot be done.
    const approval = { byName: 'Test Admin', at: '2026-11-01T05:00:00.000Z', finalize: false };
    const uploaded = claim({
      approval,
      letter: { sentAt: 'x', askId: 'a', askState: 'ASKED', reminders: 0 },
      documents: [paper('signedLetter', 'admin'), paper('signedLetterPdf', 'generated')],
    });
    assert.equal(claimGates(uploaded).file.ok, true);
    assert.equal(signedLetterIn(uploaded), true);

    // The other way round: a request marked accepted but no signed PDF on the claim is not
    // a letter the server will file with, and the reason is not the unreachable "accept it".
    const acceptedNoPdf = claim({
      approval,
      letter: { sentAt: 'x', askId: 'a', askState: 'ACCEPTED', reminders: 0 },
      documents: [paper('signedLetter', 'dealer')],
    });
    assert.equal(claimGates(acceptedNoPdf).file.ok, false);
    assert.match(claimGates(acceptedNoPdf).file.reason ?? '', /signed letter is not in yet/);
    assert.equal(signedLetterIn(acceptedNoPdf), false);
    assert.equal(signedLetterIn(claim()), false);
  });

  it('finalize now only once something is saved on IndianOil', () => {
    assert.equal(claimGates(claim({ stage: 'filed' })).finalize.ok, true);
    assert.equal(
      claimGates(claim({ stage: 'ready' })).finalize.reason,
      'Nothing is saved on IndianOil yet.',
    );
    assert.equal(claimGates(claim({ stage: 'filing' })).finalize.ok, false);
  });

  it('review of the signed letter only when the owner has sent one', () => {
    const sent = claim({ letter: { sentAt: 'x', askId: 'a', askState: 'SENT', reminders: 1 } });
    assert.equal(claimGates(sent).reviewLetter.ok, true);
    assert.equal(claimGates(claim()).reviewLetter.ok, false);
  });

  it('a closed claim takes nothing, and says which kind of closed', () => {
    for (const stage of ['finalized', 'cancelled'] as const) {
      const g = claimGates(claim({ stage, approval: { byName: 'A', at: 'x', finalize: true } }));
      for (const [name, gate] of Object.entries(g)) {
        assert.equal(gate.ok, false, `${stage} ${name}`);
      }
    }
    assert.equal(
      claimGates(claim({ stage: 'cancelled' })).cancel.reason,
      'This claim was cancelled.',
    );
    assert.equal(
      claimGates(claim({ stage: 'finalized' })).cancel.reason,
      'This claim is finalized.',
    );
  });

  it('while it is working the buttons that would race it are dead, but cancel and mark-filed are not', () => {
    const g = claimGates(claim({ working: { action: 'wemmis_fetch', runId: null, since: 'x' } }));
    assert.equal(g.fetchDocuments.ok, false);
    assert.equal(g.corrections.ok, false);
    assert.equal(g.retry.ok, false);
    assert.equal(g.cancel.ok, true);
    assert.equal(g.markFiled.ok, true);
  });

  it('a step that is only queued shuts nothing: retry, corrections and approve stay open', () => {
    // The step cannot start (the service is paused), the blocker says "press Retry", and
    // the server refuses only while a run is really live. `working` is that run; `queued`
    // is a note that something is waiting, and the pane must not treat it as a run.
    const stuck = claim({
      queued: QUEUED,
      blocker: { code: 'cannot_start', message: 'The service is paused.', at: 'x' },
    });
    const g = claimGates(stuck);
    assert.equal(g.retry.ok, true);
    assert.equal(g.corrections.ok, true);
    assert.equal(g.approve.ok, true);
    assert.equal(g.fetchDocuments.ok, true);
    assert.equal(g.portalCheck.ok, true);
    // The same claim with a run in flight is shut, so the gates are not simply always open.
    const live = claimGates(
      claim({ queued: QUEUED, working: { action: 'sdms_file', runId: 'r', since: 'x' } }),
    );
    assert.equal(live.retry.ok, false);
    assert.equal(live.corrections.ok, false);
    assert.equal(live.approve.ok, false);
    assert.equal(QUEUED_BADGE, 'Starting soon…');
  });

  it('try again still works on a filing that stopped, though other steps are shut once it has gone to IndianOil', () => {
    const g = claimGates(claim({ stage: 'filing' }));
    assert.equal(g.retry.ok, true);
    assert.equal(g.fetchDocuments.ok, false);
    assert.equal(g.portalCheck.ok, false);
  });

  it('resend needs a letter that was sent and a plan to make it from', () => {
    assert.equal(claimGates(claim()).resendLetter.ok, true);
    assert.equal(
      claimGates(claim({ letter: { sentAt: null, askId: null, askState: null, reminders: 0 } }))
        .resendLetter.reason,
      'The letter has not been sent yet.',
    );
    assert.equal(claimGates(claim({ plan: null })).resendLetter.ok, false);
  });

  it('remind only while the owner has a letter waiting', () => {
    const waiting = claim({ letter: { sentAt: 'x', askId: 'a', askState: 'ASKED', reminders: 0 } });
    assert.equal(claimGates(waiting).remindLetter.ok, true);
    assert.equal(claimGates(claim()).remindLetter.ok, false);
  });
});

describe('what fixes a blocker', () => {
  const stuck = (stage: CalibrationClaimStage, code: string, checks: ClaimCheck[] = []) => ({
    stage,
    blocker: { code, message: 'Words.', at: '2026-11-01T05:00:00.000Z' },
    checks,
  });

  it('with no login saved, papers come from the owner or an upload', () => {
    assert.deepEqual(blockerFixes(stuck('documents', 'ANY'), false), ['ask_login', 'upload']);
  });

  it('a refused login asks the owner even if one is on file', () => {
    assert.deepEqual(blockerFixes(stuck('documents', 'LOGIN_REJECTED'), true), [
      'ask_login',
      'upload',
    ]);
  });

  it('with a login saved, a stopped fetch is fetched again or uploaded', () => {
    assert.deepEqual(blockerFixes(stuck('documents', 'SITE_UNREACHABLE'), true), [
      'fetch',
      'upload',
    ]);
  });

  it('a review with a failed block offers corrections and a second look at IndianOil', () => {
    assert.deepEqual(blockerFixes(stuck('review', 'X', [check()]), true), [
      'corrections',
      'portal_check',
    ]);
    assert.deepEqual(blockerFixes(stuck('review', 'X'), true), ['retry', 'portal_check']);
  });

  it('anything else gets "try again", never nothing, and never more than two buttons', () => {
    assert.deepEqual(blockerFixes(stuck('filing', 'WHATEVER'), true), ['retry']);
    assert.deepEqual(blockerFixes(stuck('filing', 'CLAIM_ALREADY_EXISTS'), true), [
      'portal_check',
      'retry',
    ]);
    assert.deepEqual(blockerFixes(stuck('letter', 'Q'), true), ['retry']);
    for (const stage of ['documents', 'review', 'letter', 'ready', 'filing', 'filed'] as const) {
      assert.ok(blockerFixes(stuck(stage, 'Z', [check()]), false).length <= 2, stage);
    }
  });

  it('each fix is held to the gate of the step it takes', () => {
    const g = claimGates(claim({ stage: 'filing' }));
    assert.equal(gateForFix(g, 'retry').ok, true);
    assert.equal(gateForFix(g, 'portal_check').ok, false);
    assert.equal(gateForFix(g, 'upload').ok, true);
  });
});

describe('the corrections form', () => {
  it('opens empty when nothing is corrected, and holds what is', () => {
    assert.deepEqual(correctionFormFrom({}), {
      certificateNo: '',
      validityDate: '',
      receiptNo: '',
      receiptDate: '',
      calibrationDate: '',
      amountPerNozzle: '',
      excludeSerials: [],
    });
    const f = correctionFormFrom({
      certificateNo: 'VC-X',
      amountPerNozzle: 1200,
      excludeSerials: ['A'],
    });
    assert.equal(f.certificateNo, 'VC-X');
    assert.equal(f.amountPerNozzle, '1200');
    assert.deepEqual(f.excludeSerials, ['A']);
  });

  it('says so when nothing changed', () => {
    const r = correctionPayload(correctionFormFrom({}), {});
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.problem, 'Nothing has been changed.');
  });

  it('sends only what changed, and what it sends passes the server’s own schema', () => {
    const form = {
      ...correctionFormFrom({}),
      certificateNo: ' VC-NEW ',
      calibrationDate: '2026-01-08',
      amountPerNozzle: '1400',
      excludeSerials: ['SN 3'],
    };
    const r = correctionPayload(form, {});
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.payload, {
      certificateNo: 'VC-NEW',
      calibrationDate: '2026-01-08',
      amountPerNozzle: 1400,
      excludeSerials: ['SN 3'],
    });
    assert.equal(claimOverridesSchema.safeParse(r.payload).success, true);
    assert.equal(
      calibrationClaimActionSchema.safeParse({ type: 'override', overrides: r.payload }).success,
      true,
    );
  });

  it('an emptied box that held a correction sends the empty value, which drops it', () => {
    const current = { receiptNo: 'RCPT-FIX', amountPerNozzle: 1200, excludeSerials: ['A', 'B'] };
    const form = {
      ...correctionFormFrom(current),
      receiptNo: '',
      amountPerNozzle: '',
      excludeSerials: [],
    };
    const r = correctionPayload(form, current);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.payload, { receiptNo: '', amountPerNozzle: null, excludeSerials: [] });
    assert.equal(claimOverridesSchema.safeParse(r.payload).success, true);
  });

  it('an excluded list in a different order is not a change', () => {
    const current = { excludeSerials: ['A', 'B'] };
    const form = { ...correctionFormFrom(current), excludeSerials: ['B', 'A'] };
    assert.equal(correctionPayload(form, current).ok, false);
  });

  it('refuses a bad amount, a long number and a half-typed date before the server does', () => {
    const base = correctionFormFrom({});
    for (const amount of ['0', '1.5', 'abc', '100001', '-5']) {
      const r = correctionPayload({ ...base, amountPerNozzle: amount }, {});
      assert.equal(r.ok, false, amount);
    }
    assert.equal(correctionPayload({ ...base, certificateNo: 'x'.repeat(41) }, {}).ok, false);
    assert.equal(correctionPayload({ ...base, validityDate: '2027-3-31' }, {}).ok, false);
  });
});

describe('values read', () => {
  const read = claim({
    certificate: {
      vcNumber: 'VC-TEST-0001',
      districtTraderNo: null,
      traderNo: null,
      businessName: null,
      natureOfBusiness: null,
      isPetrolPump: true,
      calibrationDate: '2026-01-07',
      nextVerificationText: 'JANUARY QUARTER/2027',
      validityDate: '2027-03-31',
      officerName: 'Test Officer',
      inspectorNo: 'T-1',
      mobile: null,
      address: null,
      district: null,
      state: null,
      pin: null,
      instruments: [],
      receiptNumbers: ['RCPT-TEST-0001'],
      depositDate: null,
      grandTotal: 20105,
      warnings: [],
    },
    receipt: {
      receiptNo: 'RCPT-TEST-0001',
      grnNo: null,
      date: '2026-01-06',
      amount: 20105,
      traderNo: null,
      businessName: null,
      proprietorName: null,
      designation: null,
      paymentMode: null,
      warnings: [],
    },
  });

  it('prints the readings as they are', () => {
    const rows = Object.fromEntries(valueRows(read).map((r) => [r.key, r]));
    assert.equal(rows['cert-no']?.value, 'VC-TEST-0001');
    assert.equal(rows['cert-no']?.readAs, undefined);
    assert.equal(rows['next-due']?.value, 'JANUARY QUARTER/2027');
    assert.equal(rows['receipt-amount']?.value, '₹20,105');
    assert.equal(rows['officer']?.value, 'Test Officer, inspector T-1');
  });

  it('shows a correction in place of the reading and keeps the reading beside it', () => {
    const rows = Object.fromEntries(
      valueRows({ ...read, overrides: { certificateNo: 'VC-FIXED' } }).map((r) => [r.key, r]),
    );
    assert.equal(rows['cert-no']?.value, 'VC-FIXED');
    assert.equal(rows['cert-no']?.readAs, 'VC-TEST-0001');
  });

  it('an unread claim shows dashes, not blanks', () => {
    const rows = valueRows(claim({ plan: null }));
    assert.ok(rows.every((r) => r.value.length > 0));
    assert.equal(rows.find((r) => r.key === 'cert-no')?.value, '—');
  });
});

describe('the letter', () => {
  it('names each state in plain words', () => {
    const base = { sentAt: '2026-11-01T05:00:00.000Z', askId: 'a', reminders: 0 };
    assert.equal(
      letterStatus({ sentAt: null, askId: null, askState: null, reminders: 0 }).label,
      'Not sent yet',
    );
    assert.equal(letterStatus({ ...base, askState: 'ASKED' }).label, 'Waiting for the owner');
    assert.equal(letterStatus({ ...base, askState: 'SENT' }).label, 'The owner sent it back');
    assert.equal(letterStatus({ ...base, askState: 'ACCEPTED' }).intent, 'success');
    assert.equal(letterStatus({ ...base, askState: 'REJECTED' }).label, 'Sent back to the owner');
    assert.equal(letterStatus({ ...base, askState: 'EXPIRED' }).label, 'No longer waiting');
    assert.match(
      letterStatus({ ...base, askState: 'ASKED', reminders: 2 }).detail,
      /2 reminders sent so far/,
    );
    assert.match(
      letterStatus({ ...base, askState: 'ASKED', reminders: 1 }).detail,
      /1 reminder sent so far/,
    );
  });
});

describe('typed reasons and uploaded files', () => {
  it('wants at least four letters and no essay', () => {
    assert.match(reasonProblem('  ab ', 300) ?? '', /at least 4 letters/);
    assert.equal(reasonProblem('stamp missing', 300), null);
    assert.match(reasonProblem('x'.repeat(301), 300) ?? '', /under 300 characters/);
  });

  it('refuses an empty, huge or wrong-type file at pick time', () => {
    const ok = ['application/pdf', 'image/jpeg'];
    assert.equal(
      claimUploadProblem({ name: 'a.pdf', size: 1000, contentType: 'application/pdf' }, ok),
      null,
    );
    assert.match(
      claimUploadProblem({ name: 'a.pdf', size: 0, contentType: 'application/pdf' }, ok) ?? '',
      /empty/,
    );
    assert.match(
      claimUploadProblem(
        { name: 'big.pdf', size: CLAIM_UPLOAD_MAX_BYTES + 1, contentType: 'application/pdf' },
        ok,
      ) ?? '',
      /larger than 10 MB/,
    );
    assert.match(
      claimUploadProblem({ name: 'a.docx', size: 10, contentType: 'application/msword' }, ok) ?? '',
      /PDF/,
    );
  });

  it('the size limit is the one the server enforces', () => {
    const body = (size: number) => ({
      storageKey: 'k',
      filename: 'a.pdf',
      contentType: 'application/pdf',
      size,
    });
    assert.equal(claimDocumentUploadSchema.safeParse(body(CLAIM_UPLOAD_MAX_BYTES)).success, true);
    assert.equal(
      claimDocumentUploadSchema.safeParse(body(CLAIM_UPLOAD_MAX_BYTES + 1)).success,
      false,
    );
  });

  it('knows which papers an admin may upload', () => {
    assert.equal(isUploadSlot('certificate'), true);
    assert.equal(isUploadSlot('receipt'), true);
    assert.equal(isUploadSlot('signedLetter'), true);
    assert.equal(isUploadSlot('letter'), false);
    assert.equal(isUploadSlot('signedLetterPdf'), false);
  });

  it('prints sizes a person can read', () => {
    assert.equal(fileSize(512), '512 B');
    assert.equal(fileSize(2048), '2 KB');
    assert.equal(fileSize(2.5 * 1024 * 1024), '2.5 MB');
  });
});

describe('what the buttons post is what the server accepts', () => {
  const accepts = (body: unknown) => calibrationClaimActionSchema.safeParse(body).success;

  it('every action the pane posts parses', () => {
    assert.ok(accepts({ type: 'retry' }));
    assert.ok(accepts({ type: 'fetch_documents' }));
    assert.ok(accepts({ type: 'ask_wemmis_login' }));
    assert.ok(accepts({ type: 'ask_documents' }));
    assert.ok(accepts({ type: 'portal_check' }));
    assert.ok(accepts({ type: 'resend_letter' }));
    assert.ok(accepts({ type: 'remind_letter' }));
    assert.ok(accepts({ type: 'accept_signed_letter' }));
    assert.ok(accepts({ type: 'unapprove' }));
    assert.ok(accepts({ type: 'file' }));
    assert.ok(accepts({ type: 'finalize' }));
    assert.ok(accepts({ type: 'approve', finalize: true }));
    assert.ok(accepts({ type: 'approve', finalize: false }));
    assert.ok(accepts({ type: 'reject_signed_letter', reason: 'The stamp is missing.' }));
    assert.ok(
      accepts({ type: 'acknowledge_check', key: 'receipt_date_near', note: 'Looked at it.' }),
    );
    assert.ok(accepts({ type: 'mark_filed', finalized: true, portalReference: 'TEST-REF' }));
    assert.ok(accepts({ type: 'mark_filed', finalized: false }));
    assert.ok(accepts({ type: 'cancel', reason: 'Filed by another team.' }));
  });

  it('a reason the pane lets through is one the server takes, and one it stops is one the server refuses', () => {
    assert.equal(reasonProblem('abcd', 300), null);
    assert.ok(accepts({ type: 'cancel', reason: 'abcd' }));
    assert.notEqual(reasonProblem('abc', 300), null);
    assert.ok(!accepts({ type: 'cancel', reason: 'abc' }));
    assert.equal(reasonProblem('x'.repeat(500), 500), null);
    assert.ok(accepts({ type: 'reject_signed_letter', reason: 'x'.repeat(500) }));
    assert.notEqual(reasonProblem('x'.repeat(501), 500), null);
    assert.ok(!accepts({ type: 'reject_signed_letter', reason: 'x'.repeat(501) }));
  });

  it('Approve sends the fingerprint of the plan the admin was looking at', () => {
    // The server approves only when the plan it computes at the press has this same
    // fingerprint. Without it an approval lands on whatever the plan is by then: a
    // preflight that finished, another admin's correction, a unit dropped.
    const looked = claim({ planHash: 'plan-hash-seen' });
    const body = approveAction(looked, true);
    assert.deepEqual(body, { type: 'approve', finalize: true, planHash: 'plan-hash-seen' });
    assert.ok(accepts(body));
    assert.deepEqual(approveAction(looked, false), {
      type: 'approve',
      finalize: false,
      planHash: 'plan-hash-seen',
    });
    // A claim with no plan (so nothing to approve) sends no fingerprint, and the body is
    // still one the server's strict schema takes.
    const none = approveAction(claim({ plan: null, planHash: null }), false);
    assert.deepEqual(none, { type: 'approve', finalize: false });
    assert.ok(accepts(none));
    // The strict schema knows the field by this name: a typo would be refused outright.
    assert.ok(!accepts({ type: 'approve', finalize: true, planFingerprint: 'x' }));
  });
});

describe('why a run failed, in plain words', () => {
  const copy = (failureCode: string) => describeRunFailure({ failureCode });

  it('does not put the eMaaptaul login on the codes SDMS and IRAS raise too', () => {
    // LOGIN_REJECTED and LOGIN_NO_RESPONSE come from the shared SDMS and IRAS logins. The
    // failure notice for a TT density or RO supply run must not say the Bihar login was
    // refused and send the admin to a card that service does not have, so these two read
    // as the generic notice, as they did before the claim existed.
    for (const code of ['LOGIN_REJECTED', 'LOGIN_NO_RESPONSE']) {
      const c = copy(code);
      assert.equal(c.known, false, code);
      assert.doesNotMatch(`${c.title} ${c.hint}`, /eMaaptaul|Bihar/i, code);
    }
  });

  it('says the eMaaptaul login was refused for the codes only eMaaptaul raises', () => {
    // The claim's own refused-login run fails as WEMMIS_LOGIN_REJECTED (never as the shared
    // code), and a refusal in words nothing recognises as LOGIN_REFUSED_UNCLEAR.
    for (const code of ['WEMMIS_LOGIN_REJECTED', 'LOGIN_REFUSED_UNCLEAR']) {
      const c = copy(code);
      assert.equal(c.known, true, code);
      assert.match(`${c.title} ${c.hint}`, /eMaaptaul/, code);
      assert.match(c.hint, /eMaaptaul login card/, code);
    }
  });

  it('says every way the claim turns an eMaaptaul login down, not only a wrong password', () => {
    // The claim's runner throws WEMMIS_LOGIN_REJECTED for a wrong user ID or password,
    // a locked account and an answer nobody could read, so its one sentence must be true
    // for each: a hint that said only "wrong password" would send the owner to retype a
    // password that was right while the account sat locked.
    const hint = copy('WEMMIS_LOGIN_REJECTED').hint;
    assert.match(hint, /user ID or password is wrong/);
    assert.match(hint, /account is locked/);
    assert.match(hint, /words MDG could not read/);
    assert.match(hint, /stopped rather than try again/);
  });

  it('shows the server’s reason when Run now could not start this year’s claim', () => {
    const c = describeRunFailure({
      failureCode: 'CLAIM_NOT_STARTED',
      error: {
        message:
          'The claim could not be started — This outlet already has a calibration claim for 2026-27 (finalized). Open it from the list. A cancelled claim can be started again.',
      },
    } as Parameters<typeof describeRunFailure>[0]);
    assert.equal(c.known, true);
    assert.equal(c.title, 'The claim could not be started');
    assert.match(c.hint, /^This outlet already has a calibration claim for 2026-27/);
    // With no reason from the server, it still says where an admin starts one by hand.
    assert.match(copy('CLAIM_NOT_STARTED').hint, /Data Vault tab, choose Calibration claim/);
  });

  it('leaves a code nobody knows to the generic notice', () => {
    assert.equal(copy('SOMETHING_NEW').known, false);
    assert.equal(describeRunFailure({}).known, false);
  });
});

describe('history and the login', () => {
  it('lists history newest first without touching the original', () => {
    const original = [
      { at: '2026-11-01T05:00:00.000Z', actorName: 'A', text: 'one' },
      { at: '2026-11-03T05:00:00.000Z', actorName: 'B', text: 'three' },
      { at: '2026-11-02T05:00:00.000Z', actorName: 'C', text: 'two' },
    ];
    assert.deepEqual(
      historyNewestFirst(original).map((h) => h.text),
      ['three', 'two', 'one'],
    );
    assert.equal(original[0]?.text, 'one');
  });
});
