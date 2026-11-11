/**
 * Checks for the admin's BPCL day-readings support: which collectors count as
 * "the day's data", how a day's checks are ordered, how the comparison with
 * BPCL's page is read, the DSR schedule advisory, the two-rate loss
 * allowance in words, and what the fuel P&L may say about testing and deliveries.
 *
 * This app has no test runner, so these are plain `node:test` checks over the
 * pure modules, run through the `tsx` the repo root already carries:
 *
 *   cd mdg-admin && npx tsx --test scripts/bpclVault.check.ts
 *
 * Only type-only imports reach `@dk/shared` from those modules, so nothing here
 * depends on the compiled `dist/` it resolves to outside Vite.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cardEngineTestingRows,
  cardTestingLitresHint,
  deliveryRoundingHint,
  PORTAL_TESTING_VALUE,
  testingFallbackHint,
  testingIsPortalRecord,
  testingNobodyKnows,
  testingQuestionLead,
  testingUnmeasuredClause,
} from '../src/lib/fuelPnl';
import { dsrIrasScheduleWarning } from '../src/pages/dealers/schedulePicker';
import {
  DAY_DATA_ANY_NAME,
  DAY_DATA_SERVICE_IDS,
  DAY_TYPED_IN_LABEL,
  anyOfGroupName,
  crossCheckDateFor,
  crossCheckVerdict,
  dayDataCopy,
  dayNotes,
  daySourceStrip,
  groupCrossCheckLines,
  isDayDataServiceId,
  lineStatus,
  orderChecks,
  providerOfAttached,
  snapshotProvider,
  unmetAnyOfGroups,
  warningCount,
} from '../src/pages/dealers/vault/dayData';
import {
  reportTiersSentence,
  setupTiersSentence,
} from '../src/pages/dealers/vault/lossTiers';
import type {
  ProviderCrossCheckLine,
  SnapshotCheck,
} from '../shared/src/types/irasData';

const check = (
  code: SnapshotCheck['code'],
  severity: SnapshotCheck['severity'],
  message: string,
): SnapshotCheck => ({ code, severity, message });

const line = (
  item: ProviderCrossCheckLine['item'],
  productKey: string,
  agrees = true,
): ProviderCrossCheckLine => ({
  item,
  productKey,
  ours: 100,
  theirs: agrees ? 100 : 120,
  gap: agrees ? 0 : -20,
  tolerance: 1,
  agrees,
  note: `${item} for ${productKey}`,
});

describe('the day-data collectors', () => {
  it('are IRAS and BPCL, and nothing else', () => {
    assert.deepEqual([...DAY_DATA_SERVICE_IDS], ['iras-shift-data', 'bpcl-iot-data']);
    assert.equal(isDayDataServiceId('iras-shift-data'), true);
    assert.equal(isDayDataServiceId('bpcl-iot-data'), true);
    assert.equal(isDayDataServiceId('dsr-report'), false);
    assert.equal(isDayDataServiceId(null), false);
    assert.equal(isDayDataServiceId(undefined), false);
  });

  it('are named together the way the warning prints them', () => {
    assert.equal(DAY_DATA_ANY_NAME, 'IRAS shift data or BPCL day readings');
    assert.equal(anyOfGroupName(['iras-shift-data', 'bpcl-iot-data']), DAY_DATA_ANY_NAME);
  });

  it('say which portal an outlet runs on, IRAS first when it has both', () => {
    assert.equal(providerOfAttached(['dsr-report', 'bpcl-iot-data']), 'BPCL_IOT');
    assert.equal(providerOfAttached(['iras-shift-data']), 'IRAS');
    assert.equal(providerOfAttached(['bpcl-iot-data', 'iras-shift-data']), 'IRAS');
    assert.equal(providerOfAttached(['dsr-report']), null);
    assert.equal(providerOfAttached([]), null);
  });

  it('give a BPCL outlet BPCL words and everyone else the IRAS ones', () => {
    assert.equal(dayDataCopy('BPCL_IOT').label, 'BPCL day readings');
    assert.equal(dayDataCopy('IRAS').label, 'IRAS shift data');
    assert.equal(dayDataCopy(null).label, 'IRAS shift data');
    assert.equal(dayDataCopy('BPCL_IOT').fromPortal, 'From BPCL portal');
  });
});

describe('which portal a snapshot came from', () => {
  it('reads a missing provider as IRAS', () => {
    assert.equal(snapshotProvider({}), 'IRAS');
    assert.equal(snapshotProvider(null), 'IRAS');
    assert.equal(snapshotProvider({ provider: 'IRAS' }), 'IRAS');
    assert.equal(snapshotProvider({ provider: 'BPCL_IOT' }), 'BPCL_IOT');
  });
});

describe('a day’s checks', () => {
  it('list warnings first and keep the collector’s order inside each group', () => {
    const ordered = orderChecks([
      check('TANK_STILL', 'INFO', 'a'),
      check('GAUGE_MOVING', 'WARN', 'b'),
      check('LAYOUT_NEW', 'INFO', 'c'),
      check('SHORT_DELIVERY', 'WARN', 'd'),
    ]);
    assert.deepEqual(
      ordered.map((c) => c.message),
      ['b', 'd', 'a', 'c'],
    );
  });

  it('drop a check with no sentence and accept no checks at all', () => {
    assert.deepEqual(orderChecks(null), []);
    assert.deepEqual(orderChecks(undefined), []);
    assert.deepEqual(orderChecks([check('METER_CHAIN', 'WARN', '   ')]), []);
  });

  it('count only the warnings', () => {
    assert.equal(
      warningCount([
        check('GAUGE_MOVING', 'WARN', 'x'),
        check('TANK_STILL', 'INFO', 'y'),
        check('SHORT_DELIVERY', 'WARN', 'z'),
      ]),
      2,
    );
    assert.equal(warningCount(null), 0);
  });
});

describe('the strip above a day', () => {
  const warn = check('GAUGE_MOVING', 'WARN', 'A tank gauge was still moving.');
  const info = check('TANK_STILL', 'INFO', 'A tank did not move.');

  it('names a hand-typed day as typed in, never as a portal', () => {
    // createManualSnapshotDay writes source MANUAL and no provider, and a missing
    // provider reads as IRAS — so without the source test this said "IRAS".
    assert.equal(DAY_TYPED_IN_LABEL, 'Typed in');
    assert.deepEqual(daySourceStrip({ source: 'MANUAL' }), {
      label: 'Typed in',
      intent: 'info',
      warnings: 0,
    });
    assert.equal(daySourceStrip({ source: 'MANUAL', provider: 'IRAS' })?.label, 'Typed in');
    // Typed in on a BPCL outlet is still typed in, not "BPCL portal".
    assert.equal(daySourceStrip({ source: 'MANUAL', provider: 'BPCL_IOT' })?.label, 'Typed in');
  });

  it('shows nothing for an ordinary Indian Oil portal day with no checks', () => {
    assert.equal(daySourceStrip({}), null);
    assert.equal(daySourceStrip({ source: 'PORTAL' }), null);
    assert.equal(daySourceStrip({ source: 'PORTAL', provider: 'IRAS', checks: [] }), null);
    assert.equal(daySourceStrip({ provider: 'IRAS', checks: null }), null);
    // A check with no sentence is dropped everywhere, so it does not count as one.
    assert.equal(daySourceStrip({ checks: [check('METER_CHAIN', 'WARN', '  ')] }), null);
    assert.equal(daySourceStrip(null), null);
    assert.equal(daySourceStrip(undefined), null);
  });

  it('shows for a BPCL day, with or without checks', () => {
    assert.deepEqual(daySourceStrip({ provider: 'BPCL_IOT' }), {
      label: 'BPCL portal',
      intent: 'info',
      warnings: 0,
    });
    assert.deepEqual(daySourceStrip({ source: 'PORTAL', provider: 'BPCL_IOT', checks: [warn, info] }), {
      label: 'BPCL portal',
      intent: 'info',
      warnings: 1,
    });
  });

  it('shows for any day carrying checks, naming the portal it came from', () => {
    assert.deepEqual(daySourceStrip({ provider: 'IRAS', checks: [info] }), {
      label: 'IRAS',
      intent: 'neutral',
      warnings: 0,
    });
    assert.deepEqual(daySourceStrip({ checks: [warn, warn] }), {
      label: 'IRAS',
      intent: 'neutral',
      warnings: 2,
    });
  });

  it('counts the warnings on a typed-in day too', () => {
    assert.equal(daySourceStrip({ source: 'MANUAL', checks: [warn] })?.warnings, 1);
  });
});

describe('what goes under a day', () => {
  const warn = check('GAUGE_MOVING', 'WARN', 'A tank gauge was still moving.');
  const info = check('TANK_STILL', 'INFO', 'A tank did not move.');

  it('gives a collected BPCL day with no checks the green line and the comparison', () => {
    assert.deepEqual(dayNotes({ provider: 'BPCL_IOT', status: 'COMPLETE' }), {
      checks: [],
      allClear: true,
      crossCheck: true,
    });
    assert.deepEqual(dayNotes({ provider: 'BPCL_IOT', checks: [] }), {
      checks: [],
      allClear: true,
      crossCheck: true,
    });
  });

  it('lists a collected BPCL day’s checks, warnings first, with no green line', () => {
    const notes = dayNotes({ provider: 'BPCL_IOT', status: 'COMPLETE', checks: [info, warn] });
    assert.deepEqual(notes?.checks.map((c) => c.message), [warn.message, info.message]);
    assert.equal(notes?.allClear, false);
    assert.equal(notes?.crossCheck, true);
  });

  it('shows a FAILED BPCL day neither the green line nor the comparison', () => {
    // Nothing was collected, so no check ran and there is no day to compare.
    assert.equal(dayNotes({ provider: 'BPCL_IOT', status: 'FAILED' }), null);
    assert.equal(dayNotes({ provider: 'BPCL_IOT', status: 'FAILED', checks: [] }), null);
    assert.equal(dayNotes({ provider: 'BPCL_IOT', status: 'FAILED', checks: null }), null);
  });

  it('still lists the checks a FAILED BPCL day carries, and nothing else', () => {
    assert.deepEqual(dayNotes({ provider: 'BPCL_IOT', status: 'FAILED', checks: [warn] }), {
      checks: [warn],
      allClear: false,
      crossCheck: false,
    });
  });

  it('gives an Indian Oil day nothing unless it carries checks', () => {
    assert.equal(dayNotes({}), null);
    assert.equal(dayNotes({ provider: 'IRAS', status: 'COMPLETE', checks: [] }), null);
    assert.equal(dayNotes({ source: 'MANUAL', status: 'COMPLETE' }), null);
    assert.equal(dayNotes({ provider: 'IRAS', status: 'FAILED' }), null);
    assert.deepEqual(dayNotes({ provider: 'IRAS', checks: [info] }), {
      checks: [info],
      allClear: false,
      crossCheck: false,
    });
    assert.equal(dayNotes(null), null);
    assert.equal(dayNotes(undefined), null);
  });
});

describe('the comparison with BPCL’s page', () => {
  it('asks for the report day BEFORE the snapshot day', () => {
    assert.equal(crossCheckDateFor('2026-10-27'), '2026-10-26');
    assert.equal(crossCheckDateFor('2026-03-01'), '2026-02-28');
    assert.equal(crossCheckDateFor('2026-01-01'), '2025-12-31');
    assert.equal(crossCheckDateFor('2028-03-01'), '2028-02-29');
    assert.equal(crossCheckDateFor('not a date'), 'not a date');
  });

  it('groups lines by product, in the order the page reads them', () => {
    const groups = groupCrossCheckLines([
      line('RECEIPT', 'HSD'),
      line('METER_SALE', 'MS'),
      line('METER_SALE', 'HSD'),
      line('DAY_DIFFERENCE', 'HSD', false),
      line('TESTING', 'HSD'),
    ]);
    assert.deepEqual(
      groups.map((g) => g.productKey),
      ['HSD', 'MS'],
    );
    assert.deepEqual(
      groups[0]!.lines.map((l) => l.item),
      ['METER_SALE', 'TESTING', 'RECEIPT', 'DAY_DIFFERENCE'],
    );
    assert.equal(groups[0]!.agrees, false);
    assert.equal(groups[1]!.agrees, true);
    assert.deepEqual(groupCrossCheckLines(null), []);
  });

  it('says so when every line agrees', () => {
    assert.deepEqual(
      crossCheckVerdict({
        agrees: true,
        lines: [line('METER_SALE', 'HSD'), line('TESTING', 'HSD')],
      }),
      { kind: 'agrees', total: 2 },
    );
  });

  it('counts the lines that differ', () => {
    assert.deepEqual(
      crossCheckVerdict({
        agrees: false,
        lines: [line('METER_SALE', 'HSD'), line('RECEIPT', 'HSD', false), line('TESTING', 'MS', false)],
      }),
      { kind: 'differs', total: 3, differing: 2 },
    );
  });

  it('badges a deliberately uncompared line as "Not compared", never "Agrees"', () => {
    assert.deepEqual(lineStatus({ agrees: true, gap: null }), { label: 'Not compared', intent: 'neutral' });
    assert.deepEqual(lineStatus({ agrees: true, gap: 0.4 }), { label: 'Agrees', intent: 'success' });
    assert.deepEqual(lineStatus({ agrees: false, gap: null }), { label: 'Differs', intent: 'warning' });
    assert.deepEqual(lineStatus({ agrees: false, gap: -12 }), { label: 'Differs', intent: 'warning' });
  });

  it('never calls an empty list "all agree", and prefers the server’s reason', () => {
    const none = crossCheckVerdict({ agrees: true, lines: [] });
    assert.equal(none.kind, 'unavailable');
    assert.deepEqual(
      crossCheckVerdict({
        agrees: true,
        lines: [line('METER_SALE', 'HSD')],
        unavailableReason: 'No report has been made for that day yet.',
      }),
      { kind: 'unavailable', reason: 'No report has been made for that day yet.' },
    );
  });
});

describe('prerequisites that ask for one of several services', () => {
  const group = ['iras-shift-data', 'bpcl-iot-data'];

  it('are met by any one member', () => {
    assert.deepEqual(unmetAnyOfGroups([group], ['bpcl-iot-data']), []);
    assert.deepEqual(unmetAnyOfGroups([group], ['iras-shift-data', 'dsr-report']), []);
  });

  it('come back whole when no member is attached', () => {
    assert.deepEqual(unmetAnyOfGroups([group], ['dsr-report']), [group]);
    assert.deepEqual(unmetAnyOfGroups([group], []), [group]);
  });

  it('ask for nothing when there are no groups', () => {
    assert.deepEqual(unmetAnyOfGroups(undefined, []), []);
    assert.deepEqual(unmetAnyOfGroups([[]], []), []);
  });
});

describe('the Daily Sales Report schedule advisory', () => {
  const ok = { irasAttached: true, inspectionAttached: true };

  it('is quiet when both prerequisites are attached', () => {
    assert.equal(dsrIrasScheduleWarning(ok), null);
  });

  it('names either collector when neither is attached', () => {
    const w = dsrIrasScheduleWarning({ irasAttached: false, inspectionAttached: true });
    assert.match(w ?? '', /IRAS shift data or BPCL day readings/);
    assert.doesNotMatch(w ?? '', /Inspection Reports/);
  });

  it('names both missing prerequisites', () => {
    const w = dsrIrasScheduleWarning({ irasAttached: false, inspectionAttached: false });
    assert.match(w ?? '', /Inspection Reports and either IRAS shift data or BPCL day readings/);
    assert.match(w ?? '', /attach them/);
  });

  it('works the day-data answer from the plugin’s own groups when given them', () => {
    const base = {
      irasAttached: false,
      inspectionAttached: true,
      dependsOnAnyOf: [['iras-shift-data', 'bpcl-iot-data']],
    };
    assert.equal(
      dsrIrasScheduleWarning({ ...base, attachedServiceIds: ['bpcl-iot-data', 'inspection-reports'] }),
      null,
    );
    assert.match(
      dsrIrasScheduleWarning({ ...base, attachedServiceIds: ['inspection-reports'] }) ?? '',
      /IRAS shift data or BPCL day readings/,
    );
  });

  it('still warns when the DSR runs before the collection', () => {
    const w = dsrIrasScheduleWarning({
      ...ok,
      irasCron: '0 9 * * *',
      dsrCustomCron: '0 8 * * *',
    });
    assert.match(w ?? '', /at or before/);
    assert.doesNotMatch(w ?? '', /IRAS/);
    assert.equal(
      dsrIrasScheduleWarning({ ...ok, irasCron: '0 9 * * *', dsrCustomCron: '0 11 * * *' }),
      null,
    );
  });
});

describe('the two-rate loss allowance in words', () => {
  it('prints a report’s two rates and the litres the first applied to', () => {
    assert.equal(
      reportTiersSentence({
        firstPct: 0.25,
        restPct: 0.2,
        thresholdLitres: (600_000 / 365) * 30,
        days: 30,
        leakageTier1: 123.29,
        leakageTier2: 45.1,
      }),
      '0.25% on the first 49,315 L sold and 0.20% beyond',
    );
  });

  it('prints the petrol pair with its trailing zero', () => {
    assert.equal(
      reportTiersSentence({
        firstPct: 0.75,
        restPct: 0.6,
        thresholdLitres: 1643.84,
        days: 1,
        leakageTier1: 12.33,
        leakageTier2: 0,
      }),
      '0.75% on the first 1,644 L sold and 0.60% beyond',
    );
  });

  it('says nothing for a report with no tiers or an unreadable block', () => {
    assert.equal(reportTiersSentence(undefined), null);
    assert.equal(reportTiersSentence(null), null);
    assert.equal(
      reportTiersSentence({
        firstPct: Number.NaN,
        restPct: 0.2,
        thresholdLitres: 100,
        days: 1,
        leakageTier1: 0,
        leakageTier2: 0,
      }),
      null,
    );
  });

  it('prints a setup’s yearly threshold', () => {
    assert.equal(
      setupTiersSentence({ firstPct: 0.25, restPct: 0.2, annualThresholdLitres: 600_000 }),
      '0.25% on the first 6,00,000 L sold in a year and 0.20% beyond',
    );
    assert.equal(setupTiersSentence(undefined), null);
  });
});

/**
 * What the fuel P&L may say about testing and deliveries. A BPCL outlet is set
 * up with `testingSource: 'SNAPSHOT'` and the setup's default per-pump rate
 * stored beside it, so the two rate constants alone would have the page state a
 * rule the report mostly does not use. An Indian Oil outlet's wording must not
 * move by a character.
 */
describe('the fuel P&L’s wording on testing and deliveries', () => {
  const rule = { testingPerActivePumpLitres: 5, testingMinDeltaLitres: 1 };
  const bpcl = { ...rule, testingSource: 'SNAPSHOT' as const };

  it('reads an absent or RULE source as the per-pump rule', () => {
    assert.equal(testingIsPortalRecord(rule), false);
    assert.equal(testingIsPortalRecord({ testingSource: 'RULE' }), false);
    assert.equal(testingIsPortalRecord({ testingSource: 'SNAPSHOT' }), true);
  });

  it('keeps the Indian Oil question sentence exactly as the page has always printed it', () => {
    assert.equal(
      testingQuestionLead(rule),
      'The report charges 5 litres per active pump per day as testing, and assumes every one of them went back into the tank. Nobody measures it.',
    );
    assert.equal(testingUnmeasuredClause({ testingSource: 'RULE' }), 'nobody measures the testing');
    assert.equal(testingNobodyKnows({}), 'Nobody measures it, so nobody knows.');
  });

  it('tells a BPCL outlet’s owner the litres are BPCL’s record and the rate only a fallback', () => {
    const lead = testingQuestionLead(bpcl);
    assert.match(lead, /BPCL's own record/);
    assert.match(lead, /only on a day BPCL gave none/);
    // The true part stays: the report assumes tested fuel went back, and nobody measures that.
    assert.match(lead, /assumes every tested litre went back into the tank, and nobody measures that/);
    // …and the false part is gone: the testing is no longer called unmeasured.
    assert.doesNotMatch(lead, /Nobody measures it\./);
    assert.equal(
      testingUnmeasuredClause(bpcl),
      'nobody measures whether the testing fuel went back into the tank',
    );
    assert.equal(testingNobodyKnows(bpcl), 'Nobody measures which, so nobody knows.');
  });

  it('puts the fallback rule in one hint instead of a “pump counts as active” row', () => {
    assert.equal(
      testingFallbackHint({ testingPerActivePumpLitres: 5, testingMinDeltaLitres: 1 }),
      'Only on a day BPCL gave none: 5 L for each pump whose meter moved 1 L or more',
    );
    assert.equal(PORTAL_TESTING_VALUE, "BPCL's own record");
  });

  it('gives the card the two Indian Oil rows unchanged', () => {
    assert.deepEqual(cardEngineTestingRows(rule), [
      { label: 'Testing charged', value: '5 L per pump per day', hint: 'Assumed — nobody measures it' },
      { label: 'Pump counts as active', value: 'Meter moved 1 L or more' },
    ]);
    assert.equal(cardTestingLitresHint(rule), 'Not measured');
  });

  it('gives the card one BPCL row, with no “pump counts as active” row and no “not measured”', () => {
    const rows = cardEngineTestingRows(bpcl);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.label, 'Testing charged');
    assert.equal(rows[0]!.value, "BPCL's own record");
    assert.match(rows[0]!.hint ?? '', /^Only on a day BPCL gave none: 5 L/);
    assert.equal(
      rows.some((r) => r.label === 'Pump counts as active'),
      false,
    );
    assert.equal(cardTestingLitresHint(bpcl), "BPCL's own record");
  });

  it('says a delivery is rounded up unless the portal’s litres are exact', () => {
    assert.equal(deliveryRoundingHint({}), 'Rounded up to the next 500 L');
    assert.equal(deliveryRoundingHint({ receiptsExact: false }), 'Rounded up to the next 500 L');
    assert.equal(deliveryRoundingHint({ receiptsExact: true }), 'Exactly as BPCL reports it');
  });
});
