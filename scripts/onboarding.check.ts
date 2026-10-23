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
  recordSetupPaymentSchema,
  sendSetupBillSchema,
  startSetupServicesSchema,
} from '../shared/src/schemas/outletSetup';
import {
  SETUP_PAYMENT_MODES,
  SETUP_STAGES,
  type OnboardingBoardRow,
  type OutletSetupAdmin,
} from '../shared/src/types/outletSetup';
import {
  amountProblem,
  availableActions,
  billBody,
  billProblem,
  boardRowKey,
  closeBody,
  closeProblem,
  daysInStage,
  daysLabel,
  defaultDueOn,
  extendProblem,
  formatPaise,
  funnelTiles,
  isDay,
  istDay,
  mdgTurnCount,
  memberLogin,
  milestoneRows,
  needsSuperAdminNote,
  PAYMENT_MODES,
  SOURCE_LABEL,
  billingLine,
  paiseToRupeesText,
  parseRupees,
  paymentBody,
  paymentLine,
  paymentProblem,
  servicesLine,
  setupChip,
  sortBoardRows,
  stageActions,
  stageIntent,
  stageLabel,
  startBody,
  startProblem,
  watchBody,
  waitingLabel,
  ymdLabel,
} from '../src/lib/onboarding';

const NOW = Date.parse('2026-10-23T12:00:00.000Z');
const TODAY = '2026-10-23';

const milestones = {
  approvedAt: '2026-10-20T04:00:00.000Z',
  firstSignInAt: '2026-10-20T05:00:00.000Z',
  servicesChosenAt: null,
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
    ownerName: 'Ramesh Kumar',
    mobile: '9876543210',
    stage: 'payment',
    waitingOn: 'dealer',
    stageSince: '2026-10-21T12:00:00.000Z',
    milestones,
    servicesChosen: ['dsr-report'],
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
    loginsNeeded: [],
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
  const ids = (o: Partial<OutletSetupAdmin>, superAdmin = true) =>
    availableActions(outlet(o), superAdmin).map((a) => a.id);

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
    assert.deepEqual(ids({ stage: 'services' }), ['close']);
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

  it('keeps the payment for a super-admin', () => {
    assert.deepEqual(ids({}, false), ['send_bill', 'close']);
    assert.deepEqual(ids({ payment: { ...outlet().payment, state: 'not_sent' } }, false), [
      'send_bill',
      'close',
    ]);
    assert.equal(
      stageActions(outlet()).find((a) => a.id === 'record_payment')?.superAdminOnly,
      true,
    );
  });

  it('lets a plain admin start from the logins stage, where the money is already in, but not from the bill stage', () => {
    assert.deepEqual(ids({ stage: 'logins' }, false), ['start_anyway', 'close']);
    assert.equal(stageActions(outlet()).find((a) => a.id === 'start_anyway')?.superAdminOnly, true);
    assert.equal(
      stageActions(outlet({ stage: 'logins' })).find((a) => a.id === 'start_anyway')
        ?.superAdminOnly,
      false,
    );
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
        'Services chosen',
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
    assert.equal(rows[2]!.at, null);
    assert.equal(rows[0]!.done, true);
    assert.equal(rows[2]!.done, false);
  });

  it('does not call the end of a watch done until it has passed', () => {
    const ahead = { ...milestones, watchUntil: '2026-10-25T12:00:00.000Z' };
    const behind = { ...milestones, watchUntil: '2026-10-22T12:00:00.000Z' };
    assert.equal(milestoneRows(ahead, NOW).find((r) => r.key === 'watchUntil')!.done, false);
    assert.equal(milestoneRows(behind, NOW).find((r) => r.key === 'watchUntil')!.done, true);
  });

  it('names the chosen services, or says none', () => {
    assert.equal(
      servicesLine([], (s) => s),
      'None chosen yet',
    );
    assert.equal(
      servicesLine(['a', 'b'], (s) => s.toUpperCase()),
      'A, B',
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
  const ids = (o: Partial<OutletSetupAdmin>, superAdmin = true) =>
    availableActions(outlet(o), superAdmin).map((a) => a.id);

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

  it('offers the pause to a super-admin only, while watching or live', () => {
    assert.deepEqual(ids({ stage: 'live' }), ['pause_billing']);
    assert.deepEqual(ids({ stage: 'live' }, false), []);
    assert.deepEqual(ids({ stage: 'watch' }, false), ['end_watch', 'extend_watch']);
    for (const stage of [
      'sign_in',
      'services',
      'billing',
      'payment',
      'logins',
      'setup',
      'lost',
    ] as const) {
      assert.ok(!ids({ stage }).includes('pause_billing'), stage);
    }
    assert.equal(stageActions(outlet({ stage: 'live' }))[0]!.superAdminOnly, true);
    assert.equal(stageActions(outlet({ stage: 'live' }))[0]!.primary, false);
  });

  it('offers resume instead of pause while the outlet is paused, and says who may', () => {
    const paused = { subscription: { billingHold: hold } };
    assert.deepEqual(ids({ stage: 'live', ...paused }), ['resume_billing']);
    assert.deepEqual(ids({ stage: 'watch', ...paused }), [
      'end_watch',
      'extend_watch',
      'resume_billing',
    ]);
    assert.deepEqual(ids({ stage: 'live', ...paused }, false), []);
    assert.equal(
      needsSuperAdminNote(outlet({ stage: 'live', ...paused }), false),
      'The services are paused for non-payment. A super-admin resumes them.',
    );
    assert.equal(needsSuperAdminNote(outlet({ stage: 'live', ...paused }), true), null);
    assert.equal(needsSuperAdminNote(outlet({ stage: 'live' }), false), null);
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
