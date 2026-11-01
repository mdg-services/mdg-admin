/**
 * Checks for the Dealers page's Onboarding view (`src/lib/onboardingNext.ts`):
 * which one thing each outlet asks for next, the order the rows come in, and the
 * step track.
 *
 *   cd mdg-admin && npm run check:onboarding-next
 *
 * which is `npx tsx --test scripts/onboardingNext.check.ts`. Every time is an
 * India-time instant written out, so a failure reads as a date. 2 Nov 2026 is a
 * Monday.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { OnboardingBoardRow, OutletSetupAdmin, SetupCall } from '../shared/src/types/outletSetup';
import {
  istYmd,
  nextStepOf,
  outletNextStep,
  parseDealersView,
  rosterCounts,
  rosterMatches,
  rosterRows,
  trackOf,
  trackPosition,
  whenLabel,
  workingMoment,
} from '../src/lib/onboardingNext';

const at = (s: string): string => new Date(`${s}+05:30`).toISOString();
const ms = (s: string): number => Date.parse(at(s));
const NOW = ms('2026-11-02T10:00:00');

const milestones = {
  approvedAt: at('2026-10-28T09:00:00'),
  firstSignInAt: at('2026-10-28T12:00:00'),
  companySavedAt: at('2026-10-28T12:05:00'),
  billingSavedAt: at('2026-10-29T10:00:00'),
  billSentAt: at('2026-10-29T11:00:00'),
  paidAt: null,
  loginsDoneAt: null,
  servicesStartedAt: null,
  watchUntil: null,
  liveAt: null,
};

function outlet(over: Partial<OutletSetupAdmin> = {}): OutletSetupAdmin {
  return {
    dealerId: 'd1',
    code: '21E',
    enrolmentId: 'e1',
    source: 'website',
    origin: null,
    lastSignIn: null,
    ownerName: 'Ramesh Kumar',
    mobile: '9876543210',
    stage: 'payment',
    waitingOn: 'dealer',
    stageSince: at('2026-10-29T11:00:00'),
    milestones,
    doneBy: { signIn: null, company: null, billing: null, logins: null },
    company: 'iocl',
    billing: null,
    payment: {
      state: 'sent',
      amountPaise: 236000,
      dueOn: '2026-11-08',
      paidOn: null,
      paymentId: null,
      mode: null,
      reference: null,
      recordedByName: null,
      paymentNumber: null,
      linkUrl: null,
      paidVia: null,
    },
    loginsNeeded: ['sdms', 'iras'],
    portalsNotNeeded: [],
    welcome: { state: 'delivered', at: at('2026-10-28T09:01:00') },
    approvedByName: 'Asha',
    lost: null,
    calls: [],
    reminders: { sent: 0, lastSentAt: null, nextAt: null, callDueAt: at('2026-10-31T11:00:00') },
    checklist: [],
    loginChecks: [],
    heldCount: 0,
    notMe: null,
    subscription: {
      paidThrough: null,
      nextBillOn: null,
      overdue: false,
      billingHold: null,
      billingEnded: null,
    },
    handlerName: 'Asha',
    messageLang: 'hi',
    ...over,
  };
}

const row = (o: OutletSetupAdmin): OnboardingBoardRow => ({ kind: 'outlet', outlet: o });

function registration(
  over: Partial<Extract<OnboardingBoardRow, { kind: 'registration' }>> = {},
): OnboardingBoardRow {
  return {
    kind: 'registration',
    registrationId: 'r1',
    name: 'Suresh Patel',
    mobile: '9811112222',
    sapCode: '123456',
    siteType: 'Regular',
    pumpName: 'Patel Fuels',
    submittedAt: at('2026-11-01T18:00:00'),
    state: 'NEW',
    lostReason: null,
    fromCampaign: false,
    alreadyClient: null,
    waitingOn: 'mdg',
    lastCall: null,
    messageLang: 'hi',
    origin: { via: 'app', device: null },
    ...over,
  };
}

const call = (over: Partial<SetupCall> & Pick<SetupCall, 'outcome'>): SetupCall => ({
  at: at('2026-10-31T12:00:00'),
  byName: 'Asha',
  note: null,
  nextCallOn: null,
  ...over,
});

describe('time in plain words', () => {
  it('says today, tomorrow, or the weekday and date', () => {
    assert.equal(whenLabel(ms('2026-11-02T14:00:00'), NOW), 'today 14:00');
    assert.equal(whenLabel(ms('2026-11-03T09:00:00'), NOW), 'tomorrow 09:00');
    assert.equal(whenLabel(ms('2026-11-04T09:00:00'), NOW), 'Wed 4 Nov');
    assert.equal(whenLabel(ms('2026-11-01T09:00:00'), NOW), 'now');
  });

  it('moves a moment outside working hours to the next 09:00', () => {
    const iso = (t: number) => new Date(t).toISOString();
    assert.equal(iso(workingMoment(ms('2026-11-03T02:14:00'))), at('2026-11-03T09:00:00'));
    assert.equal(iso(workingMoment(ms('2026-11-03T21:30:00'))), at('2026-11-04T09:00:00'));
    assert.equal(iso(workingMoment(ms('2026-11-03T15:00:00'))), at('2026-11-03T15:00:00'));
    assert.equal(iso(workingMoment(ms('2026-11-03T20:00:00'))), at('2026-11-04T09:00:00'));
  });

  it('reads today in India, not in UTC', () => {
    // 01:00 India on 3 Nov is still 2 Nov in UTC.
    assert.equal(istYmd(ms('2026-11-03T01:00:00')), '2026-11-03');
  });
});

describe('the one thing to do next', () => {
  it('somebody replying NO comes before anything else', () => {
    const n = outletNextStep(
      outlet({ notMe: { at: at('2026-11-01T10:00:00') }, payment: { ...outlet().payment, state: 'not_sent' }, waitingOn: 'mdg' }),
      NOW,
    );
    assert.equal(n.kind, 'not_me');
    assert.equal(n.urgency, 'now');
    assert.match(n.why, /1 Nov/);
  });

  it('a bill that is ours to send', () => {
    const n = outletNextStep(
      outlet({ waitingOn: 'mdg', payment: { ...outlet().payment, state: 'not_sent' } }),
      NOW,
    );
    assert.equal(n.kind, 'send_bill');
    assert.equal(n.title, 'Send the bill');
    assert.match(n.why, /Ramesh Kumar saved the bill details 3 days ago/);
  });

  it('services that are ours to start, naming what is still missing', () => {
    const n = outletNextStep(
      outlet({
        stage: 'setup',
        waitingOn: 'mdg',
        checklist: [
          { key: 'logins_working', state: 'missing', detail: 'IRAS login not checked yet.' },
          { key: 'services_attached', state: 'done', detail: null },
          { key: 'files_received', state: 'missing', detail: 'DSR: the two Excel files' },
          { key: 'first_run_ok', state: 'missing', detail: 'No successful run yet' },
        ],
      }),
      NOW,
    );
    assert.equal(n.kind, 'start_services');
    // The first open item and a count: the whole list is on the outlet's Setup card.
    assert.match(n.why, /Still to check: IRAS login not checked yet, and 2 more\.$/);
  });

  it('a bill past its due date: ring, because the app never nudges about money', () => {
    const n = outletNextStep(outlet({ payment: { ...outlet().payment, dueOn: '2026-11-01' } }), NOW);
    assert.equal(n.kind, 'chase_payment');
    assert.equal(n.urgency, 'now');
    assert.match(n.title, /Call Ramesh Kumar about the unpaid bill/);
    assert.match(n.why, /was due on 1 Nov/);
  });

  it('a bill due today is not late yet', () => {
    const n = outletNextStep(
      outlet({
        payment: { ...outlet().payment, dueOn: '2026-11-02' },
        reminders: { ...outlet().reminders, callDueAt: at('2026-11-03T10:00:00') },
      }),
      NOW,
    );
    assert.equal(n.urgency, 'wait');
  });

  it('a welcome that never arrived, while the owner has not signed in', () => {
    const n = outletNextStep(
      outlet({
        stage: 'sign_in',
        welcome: { state: 'failed', at: at('2026-11-01T09:00:00') },
        reminders: { ...outlet().reminders, callDueAt: at('2026-11-03T09:00:00') },
      }),
      NOW,
    );
    assert.equal(n.kind, 'send_welcome');
  });

  it('a call that has fallen due says how long, how often reminded, and the last call', () => {
    const n = outletNextStep(
      outlet({
        stage: 'billing',
        stageSince: at('2026-10-29T10:00:00'),
        reminders: { sent: 2, lastSentAt: at('2026-10-31T10:00:00'), nextAt: at('2026-11-02T10:00:00'), callDueAt: at('2026-11-02T09:00:00') },
        calls: [call({ outcome: 'no_answer' })],
      }),
      NOW,
    );
    assert.equal(n.kind, 'call');
    assert.equal(n.title, 'Call Ramesh Kumar');
    assert.equal(
      n.why,
      'Stuck on the bill details for 4 days. Reminded twice. Last call: no answer, 31 Oct.',
    );
    assert.equal(n.since, ms('2026-11-02T09:00:00'));
  });

  it('before the call is due: nothing to do, and when we will be needed', () => {
    const n = outletNextStep(
      outlet({
        stage: 'logins',
        stageSince: at('2026-11-01T15:00:00'),
        reminders: { sent: 1, lastSentAt: at('2026-11-02T09:30:00'), nextAt: at('2026-11-04T09:30:00'), callDueAt: at('2026-11-03T15:00:00') },
      }),
      NOW,
    );
    assert.equal(n.urgency, 'wait');
    assert.equal(n.title, 'Waiting for the owner to type the portal logins');
    assert.equal(n.why, 'The app reminds them Wed 4 Nov. If nothing moves, call tomorrow 15:00.');
    assert.equal(n.checkAt, ms('2026-11-03T15:00:00'));
  });

  it('a payment we wait for names the amount and the due day', () => {
    const n = outletNextStep(
      outlet({ reminders: { ...outlet().reminders, callDueAt: at('2026-11-04T11:00:00') } }),
      NOW,
    );
    assert.equal(n.title, 'Waiting for the owner to pay ₹2,360 (due 8 Nov)');
    assert.equal(n.why, 'If nothing moves, call Wed 4 Nov.');
  });

  it('"call later" says the day they asked for, not a second date', () => {
    const n = outletNextStep(
      outlet({
        stage: 'billing',
        stageSince: at('2026-10-30T10:00:00'),
        calls: [call({ outcome: 'call_later', nextCallOn: '2026-11-05' })],
        reminders: { sent: 1, lastSentAt: null, nextAt: null, callDueAt: at('2026-11-05T09:00:00') },
      }),
      NOW,
    );
    assert.equal(n.urgency, 'wait');
    assert.equal(n.why, 'Ramesh Kumar asked for a call on 5 Nov.');
    assert.equal(n.checkAt, ms('2026-11-05T09:00:00'));
  });

  it('"not interested" asks for a decision: close it, or call again', () => {
    const n = outletNextStep(
      outlet({
        stage: 'billing',
        stageSince: at('2026-10-30T10:00:00'),
        calls: [call({ outcome: 'not_interested' })],
        reminders: { sent: 1, lastSentAt: null, nextAt: null, callDueAt: null },
      }),
      NOW,
    );
    assert.equal(n.kind, 'not_interested');
    assert.equal(n.urgency, 'now');
  });

  it('a call from before this step opened does not count', () => {
    const n = outletNextStep(
      outlet({
        stage: 'billing',
        stageSince: at('2026-11-01T10:00:00'),
        calls: [call({ outcome: 'not_interested', at: at('2026-10-30T10:00:00') })],
        reminders: { sent: 0, lastSentAt: null, nextAt: null, callDueAt: at('2026-11-03T10:00:00') },
      }),
      NOW,
    );
    assert.equal(n.kind, 'wait_dealer');
  });

  it('a refused portal login is said, so the wait makes sense', () => {
    const n = outletNextStep(
      outlet({
        stage: 'logins',
        stageSince: at('2026-11-02T09:00:00'),
        loginChecks: [{ portal: 'sdms', result: 'refused', at: at('2026-11-02T09:00:00') }],
        reminders: { sent: 0, lastSentAt: null, nextAt: null, callDueAt: at('2026-11-04T09:00:00') },
      }),
      NOW,
    );
    assert.match(n.why, /^SDMS refused the login they saved/);
  });

  it('a server that does not say when the call falls due: no day is named', () => {
    const n = outletNextStep(
      outlet({ stage: 'billing', reminders: { sent: 0, lastSentAt: null, nextAt: null, callDueAt: null } }),
      NOW,
    );
    assert.equal(n.urgency, 'wait');
    assert.equal(n.checkAt, null);
    assert.match(n.why, /^Nothing to do yet\. Stuck on the bill details for 3 days\.$/);
  });

  describe('the watch', () => {
    const watching = (over: Partial<OutletSetupAdmin> = {}) =>
      outlet({
        stage: 'watch',
        waitingOn: 'nobody',
        stageSince: at('2026-11-01T10:00:00'),
        milestones: {
          ...milestones,
          paidAt: at('2026-10-31T10:00:00'),
          loginsDoneAt: at('2026-10-31T12:00:00'),
          servicesStartedAt: at('2026-11-01T10:00:00'),
          watchUntil: at('2026-11-03T10:00:00'),
        },
        reminders: { sent: 0, lastSentAt: null, nextAt: null, callDueAt: null },
        ...over,
      });

    it('nothing to do while it runs; the end of the watch is when we look again', () => {
      const n = outletNextStep(watching(), NOW);
      assert.equal(n.kind, 'watching');
      assert.equal(n.why, 'Services started on 1 Nov. It goes live by itself on 3 Nov if nothing goes wrong.');
      assert.equal(n.checkAt, ms('2026-11-03T10:00:00'));
    });

    it('held messages are ours', () => {
      assert.equal(outletNextStep(watching({ heldCount: 2 }), NOW).title, 'Check 2 held messages');
    });

    it('a watch that ran out with something dropped is a decision', () => {
      const n = outletNextStep(watching(), ms('2026-11-03T11:00:00'));
      assert.equal(n.kind, 'watch_decide');
    });
  });

  it('a registration waits for a yes; one that is already a client says so', () => {
    assert.equal(nextStepOf(registration(), NOW).title, 'Approve the registration');
    const n = nextStepOf(registration({ alreadyClient: { dealerId: 'd9', code: '15E' } }), NOW);
    assert.equal(n.title, 'Add as another outlet, or close');
    assert.match(n.why, /already a client \(15E\)/);
  });
});

describe('the order of the rows', () => {
  it('ours first (the dealer waiting on us before us chasing them), then by when we are needed', () => {
    const callDue = outlet({
      dealerId: 'call',
      stage: 'billing',
      stageSince: at('2026-10-25T10:00:00'),
      reminders: { sent: 3, lastSentAt: null, nextAt: null, callDueAt: at('2026-10-27T10:00:00') },
    });
    const bill = outlet({
      dealerId: 'bill',
      waitingOn: 'mdg',
      stageSince: at('2026-11-01T10:00:00'),
      payment: { ...outlet().payment, state: 'not_sent' },
    });
    const soon = outlet({
      dealerId: 'soon',
      stage: 'billing',
      stageSince: at('2026-11-01T12:00:00'),
      reminders: { sent: 0, lastSentAt: null, nextAt: null, callDueAt: at('2026-11-03T12:00:00') },
    });
    const later = outlet({
      dealerId: 'later',
      stage: 'billing',
      stageSince: at('2026-11-02T09:00:00'),
      reminders: { sent: 0, lastSentAt: null, nextAt: null, callDueAt: at('2026-11-04T09:00:00') },
    });
    const order = rosterRows([row(later), row(callDue), row(soon), row(bill), registration()], NOW).map(
      (r) => (r.row.kind === 'registration' ? 'reg' : r.row.outlet.dealerId),
    );
    assert.deepEqual(order, ['bill', 'reg', 'call', 'soon', 'later']);
  });

  it('counts what needs us, what waits on the owner, and what is being watched', () => {
    const rows = rosterRows(
      [
        registration(),
        row(outlet({ reminders: { ...outlet().reminders, callDueAt: at('2026-11-05T10:00:00') } })),
      ],
      NOW,
    );
    assert.deepEqual(rosterCounts(rows), { now: 1, dealer: 1, watching: 0 });
  });
});

describe('the search box', () => {
  it('finds a code, an owner, a phone (spaces and all) or a SAP code', () => {
    assert.ok(rosterMatches(row(outlet()), '21e'));
    assert.ok(rosterMatches(row(outlet()), 'ramesh'));
    assert.ok(rosterMatches(row(outlet()), '98765 43210'));
    assert.ok(rosterMatches(registration(), '123456'));
    assert.ok(!rosterMatches(row(outlet()), '22E'));
    assert.ok(rosterMatches(row(outlet()), '  '));
  });
});

describe('the step track', () => {
  it('marks done from the facts, the open step as current, and nothing after it', () => {
    const t = trackOf(row(outlet()));
    assert.deepEqual(
      t.map((s) => s.state),
      ['done', 'done', 'done', 'done', 'done', 'current', 'todo', 'todo'],
    );
    assert.deepEqual(trackPosition(row(outlet())), { step: 6, of: 8 });
  });

  it('an outlet started early shows what it skipped as skipped, not done', () => {
    const t = trackOf(
      row(
        outlet({
          stage: 'watch',
          milestones: { ...milestones, billSentAt: null, servicesStartedAt: at('2026-11-01T10:00:00') },
        }),
      ),
    );
    assert.equal(t.find((s) => s.key === 'bill')?.state, 'skipped');
    assert.equal(t.find((s) => s.key === 'start')?.state, 'done');
  });

  it('a registration is on the first step', () => {
    assert.deepEqual(trackPosition(registration()), { step: 1, of: 8 });
  });
});

describe('the view a person opens first', () => {
  it('takes only the two views', () => {
    assert.equal(parseDealersView('onboarding'), 'onboarding');
    assert.equal(parseDealersView('services'), 'services');
    assert.equal(parseDealersView('bogus'), null);
    assert.equal(parseDealersView(null), null);
  });
});
