/**
 * Checks for the Onboarding page's rules (`src/lib/onboarding.ts`), and that
 * every request body it builds is one the shared schemas accept.
 *
 * This app has no test runner, so these are plain `node:test` checks over the
 * pure module, run through the `tsx` the repo root already carries:
 *
 *   cd mdg-admin && npm run check:onboarding
 *
 * which is `npx tsx --test scripts/onboarding.check.ts`. The shared schemas are
 * imported from source by relative path, as `intake.check.ts` does, because
 * `@dk/shared` resolves to its compiled `dist/` outside Vite.
 *
 * They sit outside `src/` on purpose: the build type-checks `src/`, and a test
 * import there would break a standalone build that has no test types.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  approveRegistrationSchema,
  changeSetupWatchSchema,
  closeSetupSchema,
  markSignedInSchema,
  portalNotNeededSchema,
  recordSetupPaymentSchema,
  saveSetupBillingSchema,
  saveSetupCompanySchema,
  sendSetupBillSchema,
  sendSetupWelcomeSchema,
  startSetupServicesSchema,
} from '../shared/src/schemas/outletSetup';
import { sendSetupBillRequestSchema } from '../shared/src/schemas/payment';
import {
  COMPANY_PORTALS,
  DEFAULT_OIL_COMPANY,
  OIL_COMPANIES,
  OIL_COMPANY_NAMES,
} from '../shared/src/types/oilCompany';
import { PORTAL_NAMES } from '../shared/src/types/portalLogin';
import {
  SETUP_MESSAGE_LANGS,
  SETUP_PAYMENT_MODES,
  SETUP_STAGES,
  SETUP_STRIP_STEPS,
  SETUP_WELCOME_STATES,
  type OnboardingBoardRow,
  type OutletSetupAdmin,
} from '../shared/src/types/outletSetup';
import {
  REASON_MAX,
  REASON_MIN,
  COMPANY_CHOICES,
  PORTAL_LABEL,
  amountProblem,
  billBody,
  billProblem,
  billingSaveBody,
  boardRowKey,
  closeBody,
  closeProblem,
  dealerActions,
  doneByLine,
  daysInStage,
  daysLabel,
  defaultDueOn,
  extendProblem,
  formatPaise,
  funnelTiles,
  isDay,
  istDay,
  MESSAGE_LANG_LABEL,
  MESSAGE_LANGS,
  messageLangLabel,
  mdgTurnCount,
  memberLogin,
  milestoneRows,
  PAYMENT_MODES,
  SOURCE_LABEL,
  billingLine,
  chosenMessageLang,
  companyAsksLine,
  companyBody,
  companyChipText,
  companyLine,
  companyLoginsPhrase,
  companyPortalIds,
  isCompanyPortalOutlet,
  loginsToEnter,
  paiseToRupeesText,
  parseRupees,
  paymentBody,
  paymentLine,
  paymentProblem,
  portalNeedRows,
  portalNotNeededBody,
  portalsLine,
  markSignedInBody,
  readBoard,
  readSetup,
  type RawOutletSetup,
  reasonProblem,
  sendWelcomeBody,
  setupChip,
  setupRefusalWords,
  sortBoardRows,
  stageActions,
  stageIntent,
  stageLabel,
  startBody,
  startProblem,
  watchBody,
  waitingLabel,
  welcomeAlreadyWent,
  welcomeLine,
  welcomeNotSentLine,
  ymdLabel,
} from '../src/lib/onboarding';

const NOW = Date.parse('2026-10-23T12:00:00.000Z');
const TODAY = '2026-10-23';

const milestones = {
  approvedAt: '2026-10-20T04:00:00.000Z',
  firstSignInAt: '2026-10-20T05:00:00.000Z',
  companySavedAt: null,
  billingSavedAt: null,
  billSentAt: null,
  paidAt: null,
  loginsDoneAt: null,
  servicesStartedAt: null,
  watchUntil: null,
  liveAt: null,
};

function outlet(over: Partial<OutletSetupAdmin> = {}): OutletSetupAdmin {
  return {
    dealerId: 'd1',
    code: '15E',
    enrolmentId: 'e1',
    source: 'website',
    origin: null,
    lastSignIn: null,
    ownerName: 'Ramesh Kumar',
    mobile: '9876543210',
    stage: 'payment',
    waitingOn: 'dealer',
    stageSince: '2026-10-21T12:00:00.000Z',
    milestones,
    doneBy: { signIn: null, company: null, billing: null, logins: null },
    company: 'iocl',
    billing: null,
    payment: {
      state: 'sent',
      amountPaise: 354000,
      dueOn: '2026-11-02',
      paidOn: null,
      mode: null,
      reference: null,
      recordedByName: null,
    },
    loginsNeeded: ['sdms', 'iras'],
    portalsNotNeeded: [],
    welcome: { state: 'delivered', at: '2026-10-20T04:05:00.000Z' },
    approvedByName: 'Asha',
    lost: null,
    ...over,
  };
}

describe('stage words', () => {
  it('names every stage, and tells the three payment situations apart', () => {
    for (const stage of SETUP_STAGES) {
      assert.ok(stageLabel(outlet({ stage })).length > 0, stage);
    }
    assert.equal(
      stageLabel(outlet({ payment: { ...outlet().payment, state: 'not_sent' } })),
      'Bill to send',
    );
    assert.equal(stageLabel(outlet()), 'Waiting for payment');
    assert.equal(stageLabel(outlet({ stage: 'setup' })), 'Ready to set up');
    assert.equal(stageLabel(outlet({ stage: 'company', company: null })), 'Choosing company');
  });

  it('colours the move that is MDG’s amber and the dealer’s blue', () => {
    assert.equal(stageIntent({ stage: 'setup', waitingOn: 'mdg' }), 'warning');
    assert.equal(stageIntent({ stage: 'payment', waitingOn: 'dealer' }), 'info');
    assert.equal(stageIntent({ stage: 'live', waitingOn: 'nobody' }), 'success');
    assert.equal(stageIntent({ stage: 'lost', waitingOn: 'nobody' }), 'neutral');
    assert.equal(stageIntent({ stage: 'watch', waitingOn: 'nobody' }), 'info');
  });

  it('says whose move it is, or nothing', () => {
    assert.equal(waitingLabel('dealer'), 'Waiting on the dealer');
    assert.equal(waitingLabel('mdg'), 'Waiting on MDG');
    assert.equal(waitingLabel('nobody'), '');
  });
});

describe('time', () => {
  it('counts whole days in a stage and never goes negative', () => {
    assert.equal(daysInStage('2026-10-21T12:00:00.000Z', NOW), 2);
    assert.equal(daysInStage('2026-10-23T11:59:00.000Z', NOW), 0);
    assert.equal(daysInStage('2026-10-25T12:00:00.000Z', NOW), 0);
    assert.equal(daysInStage('not a date', NOW), 0);
    assert.equal(daysInStage(null, NOW), 0);
  });

  it('labels days the way the chip reads them', () => {
    assert.equal(daysLabel(0), 'today');
    assert.equal(daysLabel(1), '1 day');
    assert.equal(daysLabel(2), '2 days');
  });

  it('prints a day in India time', () => {
    // 23:00 UTC on the 24th is 04:30 on the 25th in India.
    assert.equal(istDay('2026-10-24T23:00:00.000Z'), '25 Oct');
    assert.equal(istDay(null), '');
    assert.equal(istDay('nonsense'), '');
  });

  it('adds days on the calendar, across a month end', () => {
    assert.equal(defaultDueOn('2026-10-23'), '2026-11-02');
    assert.equal(defaultDueOn('2026-12-25'), '2027-01-04');
  });

  it('writes a business day for a person, off the string and never moved by a timezone', () => {
    assert.equal(ymdLabel('2026-11-02'), '2 Nov 2026');
    assert.equal(ymdLabel('2026-01-31'), '31 Jan 2026');
    assert.equal(ymdLabel(null), '-');
    assert.equal(ymdLabel('2026-02-31'), '2026-02-31');
  });

  it('accepts only days that exist', () => {
    assert.equal(isDay('2026-10-23'), true);
    assert.equal(isDay('2026-02-31'), false);
    assert.equal(isDay('23-10-2026'), false);
    assert.equal(isDay(''), false);
  });
});

describe('the chip on the dealer header', () => {
  it('reads "Onboarding · waiting for payment · 2 days"', () => {
    assert.deepEqual(setupChip(outlet(), NOW), {
      text: 'Onboarding · waiting for payment · 2 days',
      intent: 'info',
    });
  });

  it('says when the watch ends', () => {
    const chip = setupChip(
      outlet({
        stage: 'watch',
        waitingOn: 'nobody',
        milestones: { ...milestones, watchUntil: '2026-10-24T23:00:00.000Z' },
      }),
      NOW,
    );
    assert.deepEqual(chip, { text: 'Watching · ends 25 Oct', intent: 'info' });
  });

  it('draws nothing once live', () => {
    assert.equal(setupChip(outlet({ stage: 'live', waitingOn: 'nobody' }), NOW), null);
  });

  it('reads "today" in the first day and calls the bill to send the team’s move', () => {
    const chip = setupChip(
      outlet({
        waitingOn: 'mdg',
        stageSince: '2026-10-23T09:00:00.000Z',
        payment: { ...outlet().payment, state: 'not_sent' },
      }),
      NOW,
    );
    assert.deepEqual(chip, { text: 'Onboarding · bill to send · today', intent: 'warning' });
  });
});

describe('what each stage offers', () => {
  const ids = (o: Partial<OutletSetupAdmin>) => stageActions(outlet(o)).map((a) => a.id);

  it('offers the right primary button per stage', () => {
    assert.deepEqual(ids({ payment: { ...outlet().payment, state: 'not_sent' } }), [
      'send_bill',
      'start_anyway',
      'close',
    ]);
    assert.deepEqual(ids({}), ['record_payment', 'send_bill', 'start_anyway', 'close']);
    assert.deepEqual(ids({ stage: 'logins' }), ['start_anyway', 'close']);
    assert.deepEqual(ids({ stage: 'setup' }), ['start_services', 'close']);
    assert.deepEqual(ids({ stage: 'watch' }), ['end_watch', 'extend_watch', 'pause_billing']);
    assert.deepEqual(ids({ stage: 'sign_in' }), ['close']);
    assert.deepEqual(ids({ stage: 'company' }), ['close']);
    assert.deepEqual(ids({ stage: 'billing' }), ['close']);
    assert.deepEqual(ids({ stage: 'live' }), ['pause_billing']);
    assert.deepEqual(ids({ stage: 'lost' }), []);
  });

  it('makes exactly one button primary, and never a close or an override', () => {
    for (const stage of SETUP_STAGES) {
      const specs = stageActions(outlet({ stage }));
      assert.ok(specs.filter((s) => s.primary).length <= 1, stage);
      for (const s of specs)
        if (s.id === 'close' || s.id === 'start_anyway') assert.equal(s.primary, false);
    }
  });

  it('gives every admin the whole list: nothing is held back for a super-admin', () => {
    // the payment, and starting before it is in, are any admin's (owner's decision of 24 Oct)
    assert.deepEqual(ids({}), ['record_payment', 'send_bill', 'start_anyway', 'close']);
    assert.deepEqual(ids({ stage: 'live' }), ['pause_billing']);
    for (const stage of SETUP_STAGES) {
      for (const spec of stageActions(outlet({ stage }))) {
        assert.deepEqual(
          Object.keys(spec).sort(),
          ['id', 'label', 'primary'],
          `${stage}/${spec.id}`,
        );
      }
    }
  });
});

describe('money', () => {
  it('reads what a person types without going through a float', () => {
    assert.equal(parseRupees('3540'), 354000);
    assert.equal(parseRupees('3,540'), 354000);
    assert.equal(parseRupees('₹ 3,540.50'), 354050);
    assert.equal(parseRupees('3540.5'), 354050);
    assert.equal(parseRupees('3540.10'), 354010);
    assert.equal(parseRupees('0.05'), 5);
    assert.equal(parseRupees('abc'), null);
    assert.equal(parseRupees('3540.555'), null);
    assert.equal(parseRupees('-5'), null);
    assert.equal(parseRupees(''), null);
  });

  it('prints paise as rupees, in Indian grouping', () => {
    assert.equal(formatPaise(354000), '₹3,540');
    assert.equal(formatPaise(354050), '₹3,540.5');
    assert.equal(formatPaise(100_000_000), '₹10,00,000');
    assert.equal(formatPaise(null), '-');
  });

  it('puts a known amount back in a box', () => {
    assert.equal(paiseToRupeesText(354000), '3540');
    assert.equal(paiseToRupeesText(354050), '3540.50');
    assert.equal(paiseToRupeesText(null), '');
    assert.equal(paiseToRupeesText(-1), '');
  });

  it('refuses what the API would', () => {
    assert.equal(amountProblem('3540'), null);
    assert.ok(amountProblem(''));
    assert.ok(amountProblem('0'));
    assert.ok(amountProblem('1000001'));
    assert.equal(amountProblem('1000000'), null);
    assert.ok(amountProblem('12abc'));
  });
});

describe('the bill form', () => {
  it('needs an amount and a due date that is not past', () => {
    assert.equal(billProblem({ amountText: '3540', dueOn: '2026-11-02' }, TODAY), null);
    assert.equal(billProblem({ amountText: '3540', dueOn: TODAY }, TODAY), null);
    assert.ok(billProblem({ amountText: '3540', dueOn: '2026-10-22' }, TODAY));
    assert.ok(billProblem({ amountText: '3540', dueOn: '' }, TODAY));
    assert.ok(billProblem({ amountText: '', dueOn: '2026-11-02' }, TODAY));
  });

  it('builds a body the API takes', () => {
    const body = billBody({ amountText: '₹3,540', dueOn: '2026-11-02' });
    assert.deepEqual(body, { amountPaise: 354000, dueOn: '2026-11-02' });
    assert.ok(sendSetupBillSchema.safeParse(body).success);
    assert.ok(sendSetupBillRequestSchema.safeParse(body).success);
  });

  it('carries the language of the WhatsApp message when there is one, and only then', () => {
    for (const messageLang of ['hi', 'en'] as const) {
      const body = billBody({ amountText: '3540', dueOn: '2026-11-02', messageLang });
      assert.deepEqual(body, { amountPaise: 354000, dueOn: '2026-11-02', messageLang });
      assert.ok(sendSetupBillRequestSchema.safeParse(body).success);
    }
    assert.equal('messageLang' in billBody({ amountText: '3540', dueOn: '2026-11-02' }), false);
    // the server refuses any other language, so the form can never send one
    assert.equal(
      sendSetupBillRequestSchema.safeParse({
        amountPaise: 354000,
        dueOn: '2026-11-02',
        messageLang: 'fr',
      }).success,
      false,
    );
  });
});

describe('the language of a WhatsApp message', () => {
  it('offers exactly the two languages the API knows: Hinglish and English, never both at once', () => {
    assert.deepEqual([...MESSAGE_LANGS].sort(), [...SETUP_MESSAGE_LANGS].sort());
    assert.deepEqual(Object.keys(MESSAGE_LANG_LABEL).sort(), ['en', 'hi']);
    assert.equal(messageLangLabel('hi'), 'Hinglish');
    assert.equal(messageLangLabel('en'), 'English');
    assert.equal(messageLangLabel(undefined), 'Hinglish');
    assert.equal(messageLangLabel(null), 'Hinglish');
  });

  it('sends what is on screen: the pick, else the default, else Hinglish', () => {
    assert.equal(chosenMessageLang('en', 'hi'), 'en');
    assert.equal(chosenMessageLang('hi', 'en'), 'hi');
    assert.equal(chosenMessageLang(null, 'en'), 'en');
    assert.equal(chosenMessageLang(null, 'hi'), 'hi');
    assert.equal(chosenMessageLang(null, undefined), 'hi');
  });
});

describe('the payment form', () => {
  const ok = { amountText: '3540', paidOn: '2026-10-22', mode: 'upi', reference: 'UTR 4455' };

  it('needs a real day that is not in the future, and a known mode', () => {
    assert.equal(paymentProblem(ok, TODAY), null);
    assert.ok(paymentProblem({ ...ok, paidOn: '2026-10-24' }, TODAY));
    assert.ok(paymentProblem({ ...ok, paidOn: '' }, TODAY));
    assert.ok(paymentProblem({ ...ok, mode: 'barter' }, TODAY));
    assert.ok(paymentProblem({ ...ok, reference: 'x'.repeat(121) }, TODAY));
    assert.equal(paymentProblem({ ...ok, reference: '' }, TODAY), null);
  });

  it('offers exactly the modes the API knows', () => {
    assert.deepEqual([...PAYMENT_MODES].sort(), [...SETUP_PAYMENT_MODES].sort());
  });

  it('builds a body the API takes, with or without a reference', () => {
    const withRef = paymentBody({
      amountText: '3540',
      paidOn: '2026-10-22',
      mode: 'upi',
      reference: '  UTR 4455 ',
    });
    assert.deepEqual(withRef, {
      amountPaise: 354000,
      paidOn: '2026-10-22',
      mode: 'upi',
      reference: 'UTR 4455',
    });
    assert.ok(recordSetupPaymentSchema.safeParse(withRef).success);
    const bare = paymentBody({
      amountText: '3540',
      paidOn: '2026-10-22',
      mode: 'cash',
      reference: '   ',
    });
    assert.equal('reference' in bare, false);
    assert.ok(recordSetupPaymentSchema.safeParse(bare).success);
  });
});

describe('start services, watch and close', () => {
  it('judges the watch days and asks for a reason only when starting early', () => {
    assert.equal(startProblem({ watchDays: '2', reason: '', needsReason: false }), null);
    assert.equal(startProblem({ watchDays: '0', reason: '', needsReason: false }), null);
    assert.ok(startProblem({ watchDays: '8', reason: '', needsReason: false }));
    assert.ok(startProblem({ watchDays: '1.5', reason: '', needsReason: false }));
    assert.ok(startProblem({ watchDays: '', reason: '', needsReason: false }));
    assert.ok(startProblem({ watchDays: '2', reason: '  ', needsReason: true }));
    assert.equal(
      startProblem({ watchDays: '2', reason: 'Paid in cash, logins by phone', needsReason: true }),
      null,
    );
  });

  it('builds start bodies the API takes', () => {
    const plain = startBody({ watchDays: '2', reason: 'ignored', needsReason: false });
    assert.deepEqual(plain, { watchDays: 2 });
    assert.ok(startSetupServicesSchema.safeParse(plain).success);
    const early = startBody({ watchDays: '0', reason: ' Paid in cash ', needsReason: true });
    assert.deepEqual(early, { watchDays: 0, overrideReason: 'Paid in cash' });
    assert.ok(startSetupServicesSchema.safeParse(early).success);
  });

  it('builds watch bodies the API takes', () => {
    assert.ok(changeSetupWatchSchema.safeParse(watchBody({ action: 'end' })).success);
    const extend = watchBody({ action: 'extend', days: '2' });
    assert.deepEqual(extend, { action: 'extend', days: 2 });
    assert.ok(changeSetupWatchSchema.safeParse(extend).success);
    assert.equal(extendProblem('2'), null);
    assert.ok(extendProblem('0'));
    assert.ok(extendProblem('8'));
    assert.ok(extendProblem(''));
  });

  it('wants a reason to close, judged on the trimmed text, and sends it trimmed', () => {
    assert.ok(closeProblem('  ab '));
    assert.equal(closeProblem('Not interested'), null);
    assert.ok(closeProblem('x'.repeat(501)));
    assert.deepEqual(closeBody('  Not interested '), { reason: 'Not interested' });
    assert.ok(closeSetupSchema.safeParse(closeBody('  Not interested ')).success);
  });

  it('sends an approval the API takes, with or without a code', () => {
    assert.ok(approveRegistrationSchema.safeParse({}).success);
    assert.ok(approveRegistrationSchema.safeParse({ code: '16E' }).success);
    assert.equal(approveRegistrationSchema.safeParse({ code: 'nope' }).success, false);
  });
});

describe('the page’s rows', () => {
  const reg = (
    id: string,
    submittedAt: string,
    over: Record<string, unknown> = {},
  ): OnboardingBoardRow => ({
    kind: 'registration',
    registrationId: id,
    name: id,
    mobile: '9876543210',
    sapCode: '4100',
    submittedAt,
    fromCampaign: false,
    alreadyClient: null,
    waitingOn: 'mdg',
    ...over,
  });
  const out = (
    dealerId: string,
    waitingOn: OutletSetupAdmin['waitingOn'],
    stageSince: string,
  ): OnboardingBoardRow => ({
    kind: 'outlet',
    outlet: outlet({ dealerId, waitingOn, stageSince }),
  });

  it('puts registrations first, then MDG’s moves, then the dealer’s, oldest first', () => {
    const rows = [
      out('dealer-late', 'dealer', '2026-10-10T00:00:00.000Z'),
      out('mdg-new', 'mdg', '2026-10-22T00:00:00.000Z'),
      reg('reg-new', '2026-10-22T00:00:00.000Z'),
      out('mdg-old', 'mdg', '2026-10-15T00:00:00.000Z'),
      reg('reg-old', '2026-10-18T00:00:00.000Z'),
      out('nobody', 'nobody', '2026-10-01T00:00:00.000Z'),
    ];
    assert.deepEqual(sortBoardRows(rows).map(boardRowKey), [
      'r:reg-old',
      'r:reg-new',
      'o:mdg-old',
      'o:mdg-new',
      'o:dealer-late',
      'o:nobody',
    ]);
  });

  it('does not change the list it is given', () => {
    const rows = [
      out('b', 'mdg', '2026-10-22T00:00:00.000Z'),
      out('a', 'mdg', '2026-10-15T00:00:00.000Z'),
    ];
    const before = rows.map(boardRowKey);
    sortBoardRows(rows);
    assert.deepEqual(rows.map(boardRowKey), before);
  });

  it('counts the rows that are MDG’s to act on', () => {
    assert.equal(
      mdgTurnCount([
        reg('a', '2026-10-22T00:00:00.000Z'),
        out('b', 'mdg', 'x'),
        out('c', 'dealer', 'x'),
      ]),
      2,
    );
  });
});

describe('the funnel', () => {
  it('gives each step its share of the one before', () => {
    const tiles = funnelTiles({ registered: 40, approved: 20, signedIn: 10, paid: 0, live: 0 });
    assert.deepEqual(
      tiles.map((t) => [t.label, t.count, t.ofPrevious]),
      [
        ['Registered', 40, null],
        ['Approved', 20, 50],
        ['Signed in', 10, 50],
        ['Paid', 0, 0],
        ['Live', 0, null],
      ],
    );
  });
});

describe('the Setup card', () => {
  it('lists the milestones in the order they happen', () => {
    const rows = milestoneRows(milestones, NOW);
    assert.deepEqual(
      rows.map((r) => r.label),
      [
        'Approved',
        'First sign-in',
        'Company chosen',
        'Billing details saved',
        'Bill sent',
        'Payment received',
        'Portal logins saved',
        'Services started',
        'Watch ends',
        'Live',
      ],
    );
    assert.equal(rows[0]!.at, milestones.approvedAt);
    assert.equal(rows[3]!.at, null);
    assert.equal(rows[0]!.done, true);
    assert.equal(rows[3]!.done, false);
    // the service choice is gone: nothing on the list is called by it
    assert.equal(
      rows.some((r) => /services chosen/i.test(r.label)),
      false,
    );
  });

  it('does not call the end of a watch done until it has passed', () => {
    const ahead = { ...milestones, watchUntil: '2026-10-25T12:00:00.000Z' };
    const behind = { ...milestones, watchUntil: '2026-10-22T12:00:00.000Z' };
    assert.equal(milestoneRows(ahead, NOW).find((r) => r.key === 'watchUntil')!.done, false);
    assert.equal(milestoneRows(behind, NOW).find((r) => r.key === 'watchUntil')!.done, true);
  });

  it('names the portal logins asked for, and any the team said this outlet does not need', () => {
    assert.equal(portalsLine(['sdms', 'iras'], []), 'SDMS, IRAS');
    assert.equal(portalsLine([], []), 'None asked for');
    assert.equal(
      portalsLine(['sdms'], [{ portal: 'iras', reason: 'no IRAS automation' }]),
      'SDMS · IRAS not needed (no IRAS automation)',
    );
  });
});

describe('the lines on the Setup card', () => {
  const base = outlet().payment;

  it('says where the bill stands', () => {
    assert.equal(
      paymentLine({ ...base, state: 'not_sent', amountPaise: null, dueOn: null }),
      'Bill not sent yet',
    );
    assert.equal(paymentLine(base), '₹3,540 billed, due 2 Nov 2026');
    assert.equal(
      paymentLine({
        ...base,
        state: 'paid',
        paidOn: '2026-10-30',
        mode: 'upi',
        reference: 'UTR 4455',
        recordedByName: 'Asha',
      }),
      '₹3,540 paid on 30 Oct 2026 · by UPI, UTR 4455 · recorded by Asha',
    );
    assert.equal(
      paymentLine({
        ...base,
        state: 'paid',
        paidOn: null,
        mode: null,
        reference: null,
        recordedByName: null,
      }),
      '₹3,540 paid',
    );
  });

  it('prints the bill-to details, with or without a GSTIN', () => {
    assert.equal(billingLine(null, undefined), 'Not given yet');
    const b = { name: 'Sai Petroleums', address: 'NH 19, Aligarh', stateCode: '09', gstin: null };
    assert.equal(
      billingLine(b, 'Uttar Pradesh'),
      'Sai Petroleums · NH 19, Aligarh · Uttar Pradesh · No GSTIN',
    );
    assert.equal(
      billingLine({ ...b, gstin: '09ABCDE1234F1Z5' }, undefined),
      'Sai Petroleums · NH 19, Aligarh · State 09 · GSTIN 09ABCDE1234F1Z5',
    );
  });

  it('names every place a registration can come from', () => {
    for (const source of ['website', 'app', 'admin', 'campaign-auto'] as const) {
      assert.ok(SOURCE_LABEL[source].length > 0);
    }
  });
});

describe('a member’s sign-in name', () => {
  it('is the email, else the mobile, else nothing', () => {
    assert.equal(memberLogin({ email: 'a@b.co', phone: '9876543210' }), 'a@b.co');
    assert.equal(memberLogin({ email: '', phone: '9876543210' }), '9876543210');
    assert.equal(memberLogin({ email: undefined, phone: ' 9876543210 ' }), '9876543210');
    assert.equal(memberLogin({ email: '', phone: '' }), '');
  });
});

// ── billing: Send bill, Record payment, the pause (workstream A) ──────────────

describe('billing actions', () => {
  const hold = { at: '2026-10-22T20:00:00.000Z', byName: 'Asha', reason: 'not paying' };
  const ids = (o: Partial<OutletSetupAdmin>) => stageActions(outlet(o)).map((a) => a.id);

  it('words the two taps as what they do', () => {
    const unsent = stageActions(outlet({ payment: { ...outlet().payment, state: 'not_sent' } }));
    assert.equal(unsent.find((a) => a.id === 'send_bill')?.label, 'Send bill…');
    assert.equal(unsent.find((a) => a.id === 'send_bill')?.primary, true);
    const sent = stageActions(outlet());
    assert.equal(sent.find((a) => a.id === 'record_payment')?.label, 'Record payment…');
    // once it is out the bill can still be sent again, but that is never the primary button
    assert.equal(sent.find((a) => a.id === 'send_bill')?.label, 'Send bill again…');
    assert.equal(sent.find((a) => a.id === 'send_bill')?.primary, false);
  });

  it('offers the pause, to any admin, while watching or live', () => {
    assert.deepEqual(ids({ stage: 'live' }), ['pause_billing']);
    assert.deepEqual(ids({ stage: 'watch' }), ['end_watch', 'extend_watch', 'pause_billing']);
    for (const stage of ['sign_in', 'billing', 'payment', 'logins', 'setup', 'lost'] as const) {
      assert.ok(!ids({ stage }).includes('pause_billing'), stage);
    }
    assert.equal(stageActions(outlet({ stage: 'live' }))[0]!.primary, false);
  });

  it('offers resume instead of pause while the outlet is paused', () => {
    const paused = { subscription: { billingHold: hold } };
    assert.deepEqual(ids({ stage: 'live', ...paused }), ['resume_billing']);
    assert.deepEqual(ids({ stage: 'watch', ...paused }), [
      'end_watch',
      'extend_watch',
      'resume_billing',
    ]);
  });

  it('names the bill by its number, and how a Razorpay payment came', () => {
    const base = outlet().payment;
    assert.equal(
      paymentLine({ ...base, paymentNumber: 'MDG-2026-00012' }),
      'MDG-2026-00012 · ₹3,540 billed, due 2 Nov 2026',
    );
    const paid = {
      ...base,
      state: 'paid' as const,
      paidOn: '2026-10-30',
      mode: null,
      reference: null,
      recordedByName: null,
      paymentNumber: 'MDG-2026-00012',
    };
    assert.equal(
      paymentLine({ ...paid, paidVia: 'link' }),
      'MDG-2026-00012 · ₹3,540 paid on 30 Oct 2026 · by Razorpay link',
    );
    assert.equal(
      paymentLine({ ...paid, paidVia: 'checkout' }),
      'MDG-2026-00012 · ₹3,540 paid on 30 Oct 2026 · by Razorpay on the website',
    );
    // money recorded by hand keeps its own words
    assert.equal(
      paymentLine({
        ...paid,
        paidVia: 'manual',
        mode: 'bank',
        reference: 'UTR 1',
        recordedByName: 'Asha',
      }),
      'MDG-2026-00012 · ₹3,540 paid on 30 Oct 2026 · by Bank transfer, UTR 1 · recorded by Asha',
    );
  });
});

// ── Round 3: no choice of services, and what an admin does FOR the dealer ──────

describe('no choice of services', () => {
  it('has no "services" stage, and every stage has words', () => {
    assert.equal((SETUP_STAGES as readonly string[]).includes('services'), false);
    for (const stage of SETUP_STAGES) assert.ok(stageLabel(outlet({ stage })).length > 0, stage);
    assert.equal(stageLabel(outlet({ stage: 'billing' })), 'Waiting for billing details');
  });

  it('asks for the portals of the company, as the shared contract lists them', () => {
    for (const c of OIL_COMPANIES) {
      assert.deepEqual([...companyPortalIds(c)], [...COMPANY_PORTALS[c]], c);
    }
    // no company on record is Indian Oil
    assert.equal(DEFAULT_OIL_COMPANY, 'iocl');
    assert.deepEqual([...companyPortalIds(null)], ['sdms', 'iras']);
    assert.deepEqual([...companyPortalIds(undefined)], ['sdms', 'iras']);
    assert.deepEqual([...companyPortalIds('bpcl')], ['bpcl']);
    assert.deepEqual([...companyPortalIds('hpcl')], ['hpcl']);
  });

  it('names every portal as the shared contract does, a company portal by its company only', () => {
    assert.deepEqual({ ...PORTAL_LABEL }, { ...PORTAL_NAMES });
    assert.equal(PORTAL_LABEL.bpcl, 'BPCL portal');
    assert.equal(PORTAL_LABEL.hpcl, 'HPCL portal');
    for (const p of ['bpcl', 'hpcl'] as const) assert.doesNotMatch(PORTAL_LABEL[p], /SDMS|IRAS/);
  });
});

describe('what an admin can do for the dealer', () => {
  const ids = (o: Partial<OutletSetupAdmin>) => dealerActions(outlet(o)).map((a) => a.id);
  const labels = (o: Partial<OutletSetupAdmin>) => dealerActions(outlet(o)).map((a) => a.label);
  const billing = {
    name: 'Sai Petroleums',
    address: 'NH 19, Aligarh',
    stateCode: '09',
    gstin: null,
  };

  it('offers, at the first sign-in, the stamp, the welcome, the hand-sent mark and the password link', () => {
    // No "login not needed" yet: which logins there are depends on the company, chosen next.
    assert.deepEqual(ids({ stage: 'sign_in', welcome: { state: 'not_sent', at: null } }), [
      'mark_signed_in',
      'send_welcome',
      'welcome_hand_sent',
      'reset_password',
    ]);
    // Reset password is a link to the Team tab, and only that one is
    const reset = dealerActions(outlet({ stage: 'sign_in' })).find(
      (a) => a.id === 'reset_password',
    );
    assert.equal(reset?.tab, 'members');
    assert.equal(dealerActions(outlet({ stage: 'sign_in' })).filter((a) => a.tab).length, 1);
  });

  it('does not offer the hand-sent mark once the welcome went, and words the send as "again"', () => {
    for (const state of ['sent', 'delivered', 'handSent'] as const) {
      const o = { stage: 'sign_in' as const, welcome: { state, at: '2026-10-20T04:05:00.000Z' } };
      assert.equal(welcomeAlreadyWent(state), true, state);
      assert.ok(!ids(o).includes('welcome_hand_sent'), state);
      assert.ok(labels(o).includes('Send welcome again…'), state);
    }
    for (const state of ['not_sent', 'failed', null] as const) {
      const o = { stage: 'sign_in' as const, welcome: { state, at: null } };
      assert.equal(welcomeAlreadyWent(state), false, String(state));
      assert.ok(ids(o).includes('welcome_hand_sent'), String(state));
      assert.ok(labels(o).includes('Send welcome on WhatsApp…'), String(state));
    }
  });

  it('offers no welcome for an outlet that did not come from a registration', () => {
    const o = { stage: 'sign_in' as const, enrolmentId: null };
    assert.ok(!ids(o).includes('send_welcome'));
    assert.ok(ids(o).includes('mark_signed_in'));
  });

  it('offers the billing form at billing, and at payment until it is paid', () => {
    assert.deepEqual(ids({ stage: 'billing' }), [
      'fill_billing',
      'fill_company',
      'portal_not_needed',
    ]);
    assert.deepEqual(labels({ stage: 'billing' }).slice(0, 1), ['Fill billing details…']);
    assert.deepEqual(labels({ stage: 'billing', billing }).slice(0, 1), [
      'Change billing details…',
    ]);
    assert.ok(ids({ stage: 'payment', billing }).includes('fill_billing'));
    assert.ok(
      !ids({ stage: 'payment', billing, payment: { ...outlet().payment, state: 'paid' } }).includes(
        'fill_billing',
      ),
    );
  });

  it('offers the logins at the logins stage, and nothing of the dealer’s once the services are ready', () => {
    assert.deepEqual(ids({ stage: 'logins' }), ['fill_logins', 'fill_company', 'portal_not_needed']);
    // at "ready to set up" only the company is still the dealer's to change
    assert.deepEqual(ids({ stage: 'setup' }), ['fill_company']);
    for (const stage of ['watch', 'live', 'lost'] as const)
      assert.deepEqual(ids({ stage }), [], stage);
  });

  it('offers the company at its own step, and to change until the services start', () => {
    // the open step: not chosen yet, so it is "Choose", and it is the only dealer step
    assert.deepEqual(ids({ stage: 'company', company: null, loginsNeeded: [] }), ['fill_company']);
    assert.deepEqual(labels({ stage: 'company', company: null, loginsNeeded: [] }), [
      'Choose company…',
    ]);
    // after it: "Change", behind the open step's own button
    for (const stage of ['billing', 'payment', 'logins', 'setup'] as const) {
      assert.ok(ids({ stage, billing }).includes('fill_company'), stage);
      assert.ok(labels({ stage, billing }).includes('Change company…'), stage);
      assert.ok(!labels({ stage, billing }).includes('Choose company…'), stage);
    }
    assert.deepEqual(ids({ stage: 'billing' }).slice(0, 2), ['fill_billing', 'fill_company']);
    assert.deepEqual(ids({ stage: 'logins' }).slice(0, 2), ['fill_logins', 'fill_company']);
    // paid: the bill details are locked but the company is not
    assert.deepEqual(
      ids({ stage: 'payment', billing, payment: { ...outlet().payment, state: 'paid' } }).slice(0, 1),
      ['fill_company'],
    );
    // not before the owner has signed in (SIGN_IN_FIRST), nor once the services have started (SETUP_OVER)
    for (const stage of ['sign_in', 'watch', 'live', 'lost'] as const) {
      assert.ok(!ids({ stage }).includes('fill_company'), stage);
    }
  });

  it('offers "login not needed" while a login is asked for, and the way back until the services start', () => {
    // nothing asked for and nothing marked: nothing to do
    assert.ok(!ids({ stage: 'logins', loginsNeeded: [] }).includes('portal_not_needed'));
    const marked = [
      {
        portal: 'iras' as const,
        reason: 'no IRAS',
        byName: 'Ravi',
        at: '2026-10-22T05:00:00.000Z',
      },
    ];
    // both marked: still on offer, to undo
    assert.ok(
      ids({ stage: 'logins', loginsNeeded: [], portalsNotNeeded: marked }).includes(
        'portal_not_needed',
      ),
    );
    // at "ready to set up" the mark can be taken back, but a new one is not offered
    assert.deepEqual(ids({ stage: 'setup', loginsNeeded: ['sdms'], portalsNotNeeded: marked }), [
      'fill_company',
      'portal_not_needed',
    ]);
    assert.deepEqual(ids({ stage: 'setup', loginsNeeded: ['sdms'] }), ['fill_company']);
  });

  it('never makes one of them the primary button: they have no such field', () => {
    for (const stage of SETUP_STAGES) {
      for (const spec of dealerActions(outlet({ stage }))) {
        assert.ok(!('primary' in spec), `${stage}/${spec.id}`);
      }
    }
  });
});

describe('the portals a dealer is asked for', () => {
  const marked = {
    portal: 'iras' as const,
    reason: 'no IRAS automation',
    byName: 'Ravi',
    at: '2026-10-22T05:00:00.000Z',
  };

  it('lists SDMS then IRAS, each asked for or not needed', () => {
    const rows = portalNeedRows({
      stage: 'logins',
      loginsNeeded: ['sdms', 'iras'],
      portalsNotNeeded: [],
    });
    assert.deepEqual(
      rows.map((r) => [r.portal, r.label, r.state, r.canMark, r.canUndo]),
      [
        ['sdms', 'SDMS', 'asked', true, false],
        ['iras', 'IRAS', 'asked', true, false],
      ],
    );
  });

  it('lists the one portal of a BPCL or HPCL outlet, named by its company only', () => {
    for (const [company, name] of [
      ['bpcl', 'BPCL portal'],
      ['hpcl', 'HPCL portal'],
    ] as const) {
      const rows = portalNeedRows({
        stage: 'logins',
        company,
        loginsNeeded: [company],
        portalsNotNeeded: [],
      });
      assert.deepEqual(
        rows.map((r) => [r.portal, r.label, r.state, r.canMark]),
        [[company, name, 'asked', true]],
        company,
      );
    }
    // marked "not needed": the portal is not asked for, and the mark can be taken back
    const rows = portalNeedRows({
      stage: 'logins',
      company: 'bpcl',
      loginsNeeded: [],
      portalsNotNeeded: [{ ...marked, portal: 'bpcl' }],
    });
    assert.deepEqual(
      rows.map((r) => [r.portal, r.state, r.canUndo]),
      [['bpcl', 'not_needed', true]],
    );
  });

  it('cannot mark a portal not needed before the company is chosen: the company decides which logins there are', () => {
    const rows = portalNeedRows({
      stage: 'company',
      company: null,
      loginsNeeded: ['sdms', 'iras'],
      portalsNotNeeded: [],
    });
    assert.ok(rows.every((r) => !r.canMark));
    // …and from the bill details on, it can
    const billing = portalNeedRows({ stage: 'billing', loginsNeeded: ['sdms', 'iras'], portalsNotNeeded: [] });
    assert.ok(billing.every((r) => r.canMark));
  });

  it('shows who marked a portal and why, and lets it be undone, not marked again', () => {
    const rows = portalNeedRows({
      stage: 'logins',
      loginsNeeded: ['sdms'],
      portalsNotNeeded: [marked],
    });
    const iras = rows.find((r) => r.portal === 'iras')!;
    assert.equal(iras.state, 'not_needed');
    assert.equal(iras.reason, 'no IRAS automation');
    assert.equal(iras.by, 'Ravi, 22 Oct');
    assert.equal(iras.canMark, false);
    assert.equal(iras.canUndo, true);
  });

  it('allows a mark only before the setup is ready, and the undo until the services start', () => {
    const at = (stage: OutletSetupAdmin['stage']) =>
      portalNeedRows({ stage, loginsNeeded: ['sdms'], portalsNotNeeded: [marked] });
    assert.equal(at('setup').find((r) => r.portal === 'sdms')!.canMark, false);
    assert.equal(at('setup').find((r) => r.portal === 'iras')!.canUndo, true);
    assert.equal(at('watch').find((r) => r.portal === 'iras')!.canUndo, false);
    assert.equal(at('sign_in').find((r) => r.portal === 'sdms')!.canMark, false);
    assert.equal(at('sign_in').find((r) => r.portal === 'iras')!.canUndo, true);
    assert.equal(at('billing').find((r) => r.portal === 'sdms')!.canMark, true);
  });
});

describe('reasons and the bodies the API takes', () => {
  it('wants 3 to 300 characters, judged on the trimmed text, as the server does', () => {
    assert.equal(REASON_MIN, 3);
    assert.equal(REASON_MAX, 300);
    assert.ok(reasonProblem(''));
    assert.ok(reasonProblem('  ab '));
    assert.equal(reasonProblem('helped by phone'), null);
    assert.equal(reasonProblem('x'.repeat(300)), null);
    assert.match(reasonProblem('x'.repeat(301)) ?? '', /under 300/);
  });

  it('builds a sign-in mark the schema takes, trimmed', () => {
    const body = markSignedInBody('  helped by phone ');
    assert.deepEqual(body, { reason: 'helped by phone' });
    assert.ok(markSignedInSchema.safeParse(body).success);
    assert.equal(markSignedInSchema.safeParse({ reason: 'no' }).success, false);
  });

  it('builds a "not needed" body the schema takes, for each portal', () => {
    for (const portal of ['sdms', 'iras'] as const) {
      const body = portalNotNeededBody(portal, ' no IRAS automation ');
      assert.deepEqual(body, { portal, reason: 'no IRAS automation' });
      assert.ok(portalNotNeededSchema.safeParse(body).success, portal);
    }
    assert.equal(
      portalNotNeededSchema.safeParse({ portal: 'gst', reason: 'no IRAS' }).success,
      false,
    );
  });

  it('sends the welcome in the language on screen, and forces only when it already went', () => {
    for (const messageLang of ['hi', 'en'] as const) {
      const plain = sendWelcomeBody({ messageLang, force: false });
      assert.deepEqual(plain, { messageLang });
      assert.ok(sendSetupWelcomeSchema.safeParse(plain).success);
      const forced = sendWelcomeBody({ messageLang, force: true });
      assert.deepEqual(forced, { messageLang, force: true });
      assert.ok(sendSetupWelcomeSchema.safeParse(forced).success);
    }
    assert.equal(sendSetupWelcomeSchema.safeParse({ messageLang: 'fr' }).success, false);
  });

  it('builds a billing body the owner’s own schema takes: four fields, nothing else', () => {
    const body = billingSaveBody({
      name: 'Sai Petroleums',
      address: 'NH 19, Aligarh',
      stateCode: '09',
      gstin: null,
    });
    assert.deepEqual(Object.keys(body).sort(), ['address', 'gstin', 'name', 'stateCode']);
    const parsed = saveSetupBillingSchema.safeParse(body);
    assert.ok(parsed.success);
    // a GSTIN reads its state off its first two digits, as the server does
    const withGst = saveSetupBillingSchema.safeParse({
      ...body,
      gstin: '09AAACH7409R1ZZ',
      stateCode: '06',
    });
    assert.ok(withGst.success);
    if (withGst.success) assert.equal(withGst.data.stateCode, '09');
  });
});

describe('the welcome WhatsApp in words', () => {
  it('names every state the server can record', () => {
    for (const state of SETUP_WELCOME_STATES) {
      assert.ok(welcomeLine({ state, at: '2026-10-24T08:30:00.000Z' }).length > 0, state);
    }
    assert.equal(welcomeLine({ state: null, at: null }), 'Not tried yet');
    assert.equal(
      welcomeLine({ state: 'delivered', at: '2026-10-24T08:30:00.000Z' }),
      'Delivered 24 Oct',
    );
    assert.equal(
      welcomeLine({ state: 'handSent', at: '2026-10-24T08:30:00.000Z' }),
      'Sent by hand 24 Oct',
    );
    assert.equal(welcomeLine({ state: 'handSent', at: null }), 'Sent by hand');
  });
});

describe('a welcome that could not be sent', () => {
  it('turns the server’s unfinished reason into a sentence of its own', () => {
    assert.match(
      welcomeNotSentLine('template not approved yet'),
      /^The WhatsApp welcome was not sent\. Template not approved yet\. Send it from your phone/,
    );
    // a full stop or spaces on the end do not double up
    assert.match(welcomeNotSentLine(' Meta refused it. '), /sent\. Meta refused it\. Send it/);
    // no reason: no empty sentence
    assert.match(welcomeNotSentLine(''), /sent\. Send it from your phone/);
  });
});

describe('who did a step', () => {
  it('says nothing for the dealer’s own step, or a step from before round 3', () => {
    assert.equal(doneByLine(null, 'billing'), null);
    assert.equal(doneByLine(undefined, 'signIn'), null);
    assert.equal(doneByLine({ by: 'dealer', name: null, reason: null }, 'billing'), null);
  });

  it('names the admin who filled the billing details for the dealer', () => {
    assert.equal(
      doneByLine({ by: 'mdg', name: 'Ravi', reason: null }, 'billing'),
      'by Ravi, for the dealer',
    );
  });

  it('says a marked sign-in is not a real one, with the reason the admin gave', () => {
    assert.equal(
      doneByLine({ by: 'mdg', name: 'Ravi', reason: 'helped by phone' }, 'signIn'),
      'marked by Ravi, for the dealer. Not a real sign-in: helped by phone',
    );
    assert.equal(
      doneByLine({ by: 'mdg', name: 'Ravi', reason: null }, 'signIn'),
      'marked by Ravi, for the dealer. Not a real sign-in',
    );
  });

  it('credits "the MDG team" for logins, which carry no name', () => {
    assert.equal(
      doneByLine({ by: 'mdg', name: null, reason: null }, 'logins'),
      'typed by the MDG team, for the dealer',
    );
  });

  it('puts it on the right milestone rows, and only on a step that is done', () => {
    const done = {
      ...milestones,
      billingSavedAt: '2026-10-21T08:00:00.000Z',
      loginsDoneAt: '2026-10-22T08:00:00.000Z',
    };
    const doneBy = {
      signIn: { by: 'mdg' as const, name: 'Asha', reason: 'helped by phone' },
      billing: { by: 'mdg' as const, name: 'Ravi', reason: null },
      logins: { by: 'dealer' as const, name: null, reason: null },
    };
    const rows = milestoneRows(done, NOW, doneBy);
    const by = (key: string) => rows.find((r) => r.key === key)!.by;
    assert.equal(
      by('firstSignInAt'),
      'marked by Asha, for the dealer. Not a real sign-in: helped by phone',
    );
    assert.equal(by('billingSavedAt'), 'by Ravi, for the dealer');
    assert.equal(by('loginsDoneAt'), null);
    assert.equal(by('approvedAt'), null);
    // a step not done shows nobody, even if the facts carry a name
    assert.equal(
      milestoneRows(milestones, NOW, doneBy).find((r) => r.key === 'billingSavedAt')!.by,
      null,
    );
    // without the facts (an older server) every row reads as the dealer's
    assert.ok(milestoneRows(done, NOW).every((r) => r.by === null));
  });
});

describe('a setup from a server one release behind', () => {
  // Before round 3 the server sent no `doneBy`, `portalsNotNeeded` or `welcome`.
  const old = (): RawOutletSetup => {
    const {
      doneBy: _d,
      portalsNotNeeded: _p,
      welcome: _w,
      ...rest
    } = outlet({ stage: 'sign_in' });
    return rest;
  };

  it('fills the three fields as "nothing happened"', () => {
    const o = readSetup(old());
    assert.deepEqual(o.doneBy, { signIn: null, company: null, billing: null, logins: null });
    assert.deepEqual(o.portalsNotNeeded, []);
    assert.deepEqual(o.welcome, { state: null, at: null });
  });

  it('lets every screen rule read it without throwing', () => {
    const o = readSetup(old());
    assert.ok(dealerActions(o).length > 0);
    assert.equal(portalNeedRows(o).length, 2);
    assert.equal(portalsLine(o.loginsNeeded, o.portalsNotNeeded), 'SDMS, IRAS');
    assert.equal(welcomeLine(o.welcome), 'Not tried yet');
    assert.ok(milestoneRows(o.milestones, NOW, o.doneBy).every((r) => r.by === null));
  });

  it('keeps what a current server sends, and fills only a part that is missing', () => {
    const current = outlet({
      doneBy: {
        signIn: { by: 'mdg', name: 'Asha', reason: 'helped by phone' },
        company: null,
        billing: null,
        logins: null,
      },
      portalsNotNeeded: [
        {
          portal: 'iras',
          reason: 'no IRAS automation',
          byName: 'Asha',
          at: '2026-10-22T04:00:00.000Z',
        },
      ],
    });
    assert.deepEqual(readSetup(current), current);
    // a partial `doneBy` gets its other steps as null
    const partial = readSetup({ ...old(), doneBy: { signIn: null } as never });
    assert.deepEqual(partial.doneBy, { signIn: null, company: null, billing: null, logins: null });
  });

  it('does not change the body it is given', () => {
    const raw = old();
    readSetup(raw);
    assert.equal('welcome' in raw, false);
  });

  it('reads every outlet row on the board and leaves a registration row alone', () => {
    const registration: OnboardingBoardRow = {
      kind: 'registration',
      registrationId: 'r1',
      name: 'Registration',
      mobile: '9876543210',
      sapCode: '4100',
      siteType: 'RO',
      pumpName: null,
      submittedAt: '2026-10-22T00:00:00.000Z',
      state: 'NEW',
      lostReason: null,
      fromCampaign: false,
      alreadyClient: null,
      waitingOn: 'mdg',
      lastCall: null,
      messageLang: 'hi',
    };
    const board = readBoard({
      rows: [registration, { kind: 'outlet', outlet: old() }],
      passwordHelp: [],
      funnel: { registered: 1, approved: 1, signedIn: 0, paid: 0, live: 0 },
    });
    assert.equal(board.rows[0], registration);
    const row = board.rows[1]!;
    assert.equal(row.kind, 'outlet');
    if (row.kind === 'outlet') assert.equal(row.outlet.welcome.state, null);
    assert.equal(board.funnel.registered, 1);
  });
});

describe('the oil company', () => {
  const bpcl = () =>
    outlet({
      company: 'bpcl',
      loginsNeeded: ['bpcl'],
      stage: 'logins',
    });

  it('offers all three companies, by the short name on the pump’s board', () => {
    assert.deepEqual(
      COMPANY_CHOICES.map((c) => [c.value, c.label, c.name]),
      OIL_COMPANIES.map((c) => [c, OIL_COMPANY_NAMES[c].short, OIL_COMPANY_NAMES[c].en]),
    );
    assert.deepEqual(
      COMPANY_CHOICES.map((c) => c.label),
      ['IOCL', 'BPCL', 'HPCL'],
    );
  });

  it('says the company in the Setup card, and that none is chosen yet', () => {
    assert.equal(companyLine('iocl'), 'Indian Oil (IOCL)');
    assert.equal(companyLine('bpcl'), 'Bharat Petroleum (BPCL)');
    assert.equal(companyLine('hpcl'), 'Hindustan Petroleum (HPCL)');
    assert.equal(companyLine(null), 'Not chosen yet');
  });

  it('puts a chip on a BPCL or HPCL row and none on Indian Oil’s, nor before it is chosen', () => {
    assert.equal(companyChipText('bpcl'), 'BPCL');
    assert.equal(companyChipText('hpcl'), 'HPCL');
    assert.equal(companyChipText('iocl'), null);
    assert.equal(companyChipText(null), null);
    assert.equal(companyChipText(undefined), null);
  });

  it('knows a BPCL or HPCL outlet, whose one login MDG’s team uses by hand', () => {
    assert.equal(isCompanyPortalOutlet('bpcl'), true);
    assert.equal(isCompanyPortalOutlet('hpcl'), true);
    assert.equal(isCompanyPortalOutlet('iocl'), false);
    assert.equal(isCompanyPortalOutlet(null), false);
  });

  it('says which logins a company asks for, naming a company portal by its company only', () => {
    assert.equal(companyLoginsPhrase('iocl'), 'the SDMS and IRAS logins');
    assert.equal(companyLoginsPhrase('bpcl'), 'the BPCL portal login');
    assert.equal(companyLoginsPhrase('hpcl'), 'the HPCL portal login');
    assert.equal(companyAsksLine('bpcl'), 'Asks for the BPCL portal login.');
    for (const c of ['bpcl', 'hpcl'] as const) assert.doesNotMatch(companyAsksLine(c), /SDMS|IRAS/);
  });

  it('builds a company body the shared schema takes, and only for a real company', () => {
    for (const c of OIL_COMPANIES) {
      const body = companyBody(c);
      assert.deepEqual(body, { company: c });
      assert.ok(saveSetupCompanySchema.safeParse(body).success, c);
    }
    assert.equal(saveSetupCompanySchema.safeParse({ company: 'shell' }).success, false);
    assert.equal(saveSetupCompanySchema.safeParse({}).success, false);
  });

  it('shows "Enter logins" a card for the company’s portals the outlet is asked for, in order', () => {
    assert.deepEqual(loginsToEnter(outlet()), ['sdms', 'iras']);
    assert.deepEqual(loginsToEnter(outlet({ loginsNeeded: ['iras'] })), ['iras']);
    assert.deepEqual(loginsToEnter(outlet({ loginsNeeded: [] })), []);
    assert.deepEqual(loginsToEnter(bpcl()), ['bpcl']);
    assert.deepEqual(loginsToEnter(outlet({ company: 'hpcl', loginsNeeded: ['hpcl'] })), ['hpcl']);
    // a BPCL outlet is never shown the SDMS or IRAS box, whatever the server listed
    assert.deepEqual(loginsToEnter(outlet({ company: 'bpcl', loginsNeeded: ['sdms', 'bpcl'] })), [
      'bpcl',
    ]);
    // no company on record is Indian Oil
    assert.deepEqual(loginsToEnter(outlet({ company: null })), ['sdms', 'iras']);
  });

  it('lists the portals of a BPCL outlet as just its own', () => {
    const o = bpcl();
    assert.equal(portalsLine(o.loginsNeeded, o.portalsNotNeeded), 'BPCL portal');
    assert.equal(
      portalsLine([], [{ portal: 'bpcl', reason: 'no login yet' }]),
      'None asked for · BPCL portal not needed (no login yet)',
    );
  });

  it('puts the company on its milestone row, with who chose it, as billing’s row reads', () => {
    const chosen = { ...milestones, companySavedAt: '2026-10-20T06:00:00.000Z' };
    const doneBy = {
      signIn: null,
      company: { by: 'mdg' as const, name: 'Ravi', reason: null },
      billing: null,
      logins: null,
    };
    const rows = milestoneRows(chosen, NOW, doneBy, 'bpcl');
    const row = rows.find((r) => r.key === 'companySavedAt')!;
    assert.equal(row.label, 'Company chosen: BPCL');
    assert.equal(row.done, true);
    assert.equal(row.by, 'by Ravi, for the dealer');
    // in the order they happen: after the first sign-in, before the billing details
    const keys = rows.map((r) => r.key);
    assert.ok(keys.indexOf('firstSignInAt') < keys.indexOf('companySavedAt'));
    assert.ok(keys.indexOf('companySavedAt') < keys.indexOf('billingSavedAt'));
    // the dealer's own choice names nobody
    assert.equal(
      milestoneRows(chosen, NOW, { ...doneBy, company: { by: 'dealer', name: null, reason: null } }, 'hpcl').find(
        (r) => r.key === 'companySavedAt',
      )!.by,
      null,
    );
    assert.equal(doneByLine({ by: 'mdg', name: null, reason: null }, 'company'), 'by the MDG team, for the dealer');
  });

  it('keeps the row as a step still to do while no company is chosen', () => {
    const row = milestoneRows(milestones, NOW, null, null).find((r) => r.key === 'companySavedAt')!;
    assert.equal(row.label, 'Company chosen');
    assert.equal(row.done, false);
    assert.equal(row.at, null);
    // …and when the caller does not say (the row is always kept)
    assert.ok(milestoneRows(milestones, NOW).some((r) => r.key === 'companySavedAt'));
  });

  it('drops the row for an outlet from before the step, which never chose and reads as Indian Oil', () => {
    const rows = milestoneRows(milestones, NOW, null, 'iocl');
    assert.equal(rows.some((r) => r.key === 'companySavedAt'), false);
    assert.equal(rows.length, milestoneRows(milestones, NOW).length - 1);
  });

  it('turns the refusals the company and billing steps meet into plain sentences', () => {
    for (const code of ['SIGN_IN_FIRST', 'SETUP_OVER', 'COMPANY_FIRST']) {
      const words = setupRefusalWords(code);
      assert.ok(words && words.length > 20, code);
      assert.doesNotMatch(words, new RegExp(code));
    }
    assert.match(setupRefusalWords('SIGN_IN_FIRST') ?? '', /not signed in/);
    assert.match(setupRefusalWords('SETUP_OVER') ?? '', /started/);
    assert.match(setupRefusalWords('COMPANY_FIRST') ?? '', /company is not chosen/);
    // any other error is left to say what the server said
    assert.equal(setupRefusalWords('SETUP_LOCKED'), null);
    assert.equal(setupRefusalWords(undefined), null);
    assert.equal(setupRefusalWords(null), null);
  });

  it('has a step on the owner’s strip that the admin’s stage labels cover', () => {
    // The admin draws no strip, but its words must cover every stage the strip is built from.
    assert.deepEqual([...SETUP_STRIP_STEPS], ['company', 'billing', 'payment', 'logins', 'start']);
    assert.ok((SETUP_STAGES as readonly string[]).includes('company'));
    assert.equal(
      SETUP_STAGES.indexOf('company'),
      SETUP_STAGES.indexOf('sign_in') + 1,
    );
    assert.equal(
      SETUP_STAGES.indexOf('billing'),
      SETUP_STAGES.indexOf('company') + 1,
    );
  });
});

describe('a setup from a server that has no company yet', () => {
  const old = (): RawOutletSetup => {
    const { company: _c, ...rest } = outlet({ stage: 'billing' });
    return {
      ...rest,
      doneBy: { signIn: null, billing: null, logins: null } as never,
      milestones: { ...milestones, billingSavedAt: null } as never,
    } as RawOutletSetup;
  };

  it('reads as Indian Oil, with nobody having chosen it', () => {
    const o = readSetup(old());
    assert.equal(o.company, 'iocl');
    assert.equal(o.doneBy.company, null);
    assert.equal(o.milestones.companySavedAt, null);
    assert.deepEqual([...companyPortalIds(o.company)], ['sdms', 'iras']);
    assert.ok(dealerActions(o).length > 0);
  });

  it('keeps a "not chosen yet" that a current server sends, rather than turning it into Indian Oil', () => {
    const o = readSetup({ ...outlet({ stage: 'company', company: null }) });
    assert.equal(o.company, null);
    assert.equal(companyLine(o.company), 'Not chosen yet');
  });

  it('leaves a current body unchanged in content', () => {
    const current = outlet({
      company: 'hpcl',
      loginsNeeded: ['hpcl'],
      milestones: { ...milestones, companySavedAt: '2026-10-20T06:00:00.000Z' },
      doneBy: {
        signIn: null,
        company: { by: 'mdg', name: 'Asha', reason: null },
        billing: null,
        logins: null,
      },
    });
    assert.deepEqual(readSetup(current), current);
  });
});

describe('where they signed up, and the device they use', () => {
  it('an older server, which says nothing of either, reads as nothing known', () => {
    const { origin: _o, lastSignIn: _l, ...older } = outlet();
    const read = readSetup(older);
    assert.equal(read.origin, null);
    assert.equal(read.lastSignIn, null);
    // and a current server's are kept as sent
    const lastSignIn = { device: { kind: 'android' as const, inApp: true }, at: '2026-10-30T12:00:00.000Z' };
    assert.deepEqual(readSetup(outlet({ lastSignIn })).lastSignIn, lastSignIn);
  });
});

