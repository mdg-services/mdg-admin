import { REPORT_KINDS, type MessageReport, type ReportData, type ReportKind } from '@dk/shared';
import { describe, expect, it } from 'vitest';

import { dealerSeesLine } from './reportNote';
import { REPORT_KIND_SHORT_NAME, fmtDay, fmtInstant, fmtLitres, fmtRupees, summarizeReport } from './reportSummary';

/**
 * ADR 0056, the team's reading of a snapshot. Each fixture is a small but realistic
 * `report.data`; the summary must name the kind, the verdict, the day and the figures
 * the team needs, and must never throw on a thin or odd snapshot.
 */

const NOW = '2026-11-24T13:35:00.000Z'; // 7:05 pm IST

const salesBlock = (soldL: number | null, state: 'closed' | 'pending' = 'closed') => ({
  state,
  closedDay: '2026-11-23',
  soldL,
  receiptL: null,
  receiptSource: null,
  testingL: null,
  monthToDateL: 1234567,
  stockNowL: null,
  sameWeekdayLastWeek: null,
  trend: [],
  rows: [],
});

const variation = (tone: 'ok' | 'low' | 'high', variationL: number) => ({
  tone,
  variationL,
  permissibleL: 150,
  offL: 0,
  lowEdgeL: -150,
  highEdgeL: 150,
  band: { stockPct: 0.5, stockL: 100, leakPct: 0.1, leakL: 50, leakApplies: true },
  sinceDate: '2026-11-01',
  receiptSinceL: 0,
  testSinceL: 0,
});

/** One snapshot per kind. */
const DATA: Record<ReportKind, ReportData> = {
  dsr_sales: {
    kind: 'dsr_sales',
    v: 1,
    capturedAt: NOW,
    outletCode: '1E',
    businessDate: '2026-11-23',
    shiftTime: '06:00',
    revised: true,
    products: [
      { key: 'HSD', tankNos: [1], sales: salesBlock(12345) },
      { key: 'MS', tankNos: [2], sales: salesBlock(8000) },
    ],
  },
  dsr_variation: {
    kind: 'dsr_variation',
    v: 1,
    capturedAt: NOW,
    outletCode: '1E',
    businessDate: '2026-11-23',
    shiftTime: null,
    sheets: ['variation', 'sales'],
    revised: false,
    products: [
      { key: 'HSD', tankNos: [1], variation: variation('low', -480), sales: salesBlock(100) },
      { key: 'MS', tankNos: [2], variation: variation('ok', 20) },
    ],
  },
  stock_check: {
    kind: 'stock_check',
    v: 1,
    capturedAt: NOW,
    outletCode: '1E',
    readingAt: NOW,
    stale: true,
    fuels: [
      {
        fuelKey: 'HSD',
        prodCode: 'HSD',
        totalL: 18250,
        tanksRead: 2,
        tanksNoReading: 1,
        tanks: [],
      },
    ],
    cover: { planDay: '2026-11-24', fuels: [{ fuelKey: 'HSD', daysLeft: 3.5, runOutOn: '2026-11-28' }] },
  },
  load_plan: {
    kind: 'load_plan',
    v: 1,
    capturedAt: NOW,
    outletCode: '1E',
    planDay: '2026-11-24',
    severity: 'urgent',
    verdict: {
      code: 'ORDER_NOW_RUNNING_OUT',
      tankers: 2,
      products: ['HSD', 'MS'],
      closedDays: [],
      nextOrderOn: null,
      horizonDays: 4,
    },
    pools: [
      { key: 'HSD', product: 'HSD', tankNos: [1], stockL: 4200, lowLineL: 3000, daysLeft: 1.2, runOutOn: '2026-11-25', atLine: true, tanks: [] },
      { key: 'MS', product: 'MS', tankNos: [2], stockL: 9000, lowLineL: 3000, daysLeft: 4.1, runOutOn: null, atLine: false, tanks: [] },
    ],
    order: { orderOn: '2026-11-24', loadOn: null, arriveOn: '2026-11-25', arriveDate: '2026-11-25', arriveTime: '10:30', trucks: [] },
    projection: [],
    depotClosed: [],
    inTransit: [],
    credit: { availableRs: 250000, shortByRs: null },
  },
  tanker_density: {
    kind: 'tanker_density',
    v: 1,
    capturedAt: NOW,
    outletCode: '1E',
    invoiceNo: 'INV-778',
    vehicleNo: 'MH12AB1234',
    vehicleKey: 'MH12AB1234',
    invoiceDate: '2026-11-24',
    invoiceTime: '09:10',
    lines: [{ family: 'DIESEL', productKey: 'HSD', density15Raw: '0.8321', quantity: 12000, unit: 'L', tankNo: null }],
    droppedLines: 0,
  },
  tt_ack: {
    kind: 'tt_ack',
    v: 1,
    capturedAt: NOW,
    outletCode: '1E',
    vehicleNo: 'MH12AB1234',
    vehicleKey: 'MH12AB1234',
    ackedAt: NOW,
    condition: 'Excellent',
    rows: [
      { invoiceNo: '778', invoiceDate: '2026-11-24', short: 'short', totalShortL: 35, claimShortL: 30, products: [] },
      { invoiceNo: '779', invoiceDate: '2026-11-24', short: 'none', totalShortL: 0, claimShortL: 0, products: [] },
    ],
    anyShort: true,
  },
  fuel_order: {
    kind: 'fuel_order',
    v: 1,
    event: 'tanker_assigned',
    indentId: 'i1',
    orderNo: '9000123',
    source: 'chat',
    stage: 'tanker_assigned',
    asOf: NOW,
    deliveryDay: '2026-11-25',
    lines: [{ product: 'HSD', material: 'HSD', kl: 12 }],
    totalKl: 12,
    ttNo: 'MH12AB1234',
    shipmentAt: null,
  },
  credit_dod: {
    kind: 'credit_dod',
    v: 1,
    outletCode: '1E',
    asOf: '2026-11-24',
    capturedAt: NOW,
    backdated: false,
    festivalKey: null,
    verdict: 'overdue',
    money: { amount: 123456.5, dueAmount: 100000, date: '2026-11-20', daysLeft: -4, dateIsApprox: false, daysIsMinimum: false, deadlines: 1 },
    limit: { form: 'DOD', current: 500000, availed: 400000, available: 100000, usedPct: 80 },
    review: { on: '2026-12-31', daysUntil: 37, lapsed: false },
  },
  ledger_watch: {
    kind: 'ledger_watch',
    v: 1,
    outletCode: '1E',
    generatedAt: NOW,
    window: null,
    totalMovements: 3,
    totalsScope: 'shown',
    charged: 1500,
    received: 0,
    topSeverity: 'ALERT',
    movements: [
      { date: '2026-11-22', amount: 1500, direction: 'CHARGED', class: 'FEE', flagKind: 'UNKNOWN_ENTRY', severity: 'ALERT', title: { en: 'Unknown fee', hi: 'अज्ञात शुल्क' } },
    ],
  },
  calibration_claim: {
    kind: 'calibration_claim',
    v: 1,
    financialYear: '2026-27',
    nozzleCount: 8,
    nozzlesIncluded: 6,
    totalAmount: 30000,
    amountPerNozzle: 5000,
    reference: 'CLM-55',
    filedAt: NOW,
    units: [],
  },
  water_ingress: {
    kind: 'water_ingress',
    v: 1,
    outletCode: '1E',
    businessDate: '2026-11-23',
    capturedAt: NOW,
    lastCheckAt: NOW,
    dayState: 'finished',
    operating: null,
    totalSlots: 12,
    recordedSlots: 10,
    missedSlots: 2,
    openSlots: 0,
    compliancePercent: 83.3,
    lastCheckFailed: true,
    slots: [],
  },
  ro_supply: {
    kind: 'ro_supply',
    v: 1,
    outletCode: '1E',
    capturedAt: NOW,
    read: 'partial',
    blocked: true,
    failingCount: 2,
    unknownCount: 1,
    lastGoodIsOld: true,
    rows: [],
  },
  du_otp: {
    kind: 'du_otp',
    v: 1,
    outletCode: '1E',
    phase: 'pending',
    supplyBlocked: false,
    readAt: NOW,
    events: [
      { otpId: 'o1', duMake: 'Gilbarco', duModel: 'Encore', duSerial: 'S1', nozzleNo: '3', transactionDate: null, transactionDateText: '', groupKey: 'g' },
    ],
    moreCount: 2,
  },
  declaration_filed: {
    kind: 'declaration_filed',
    v: 1,
    declaration: 'safety',
    how: 'submitted',
    day: '2026-11-24',
    filedAt: NOW,
    late: true,
    everyDays: 1,
    nextDueDay: '2026-11-25',
    outletCode: '1E',
    streak: 9,
    ref: 'r1',
  },
  mock_drill: {
    kind: 'mock_drill',
    v: 1,
    outletCode: '1E',
    stage: 'filed',
    submissionId: 's1',
    mode: 'new',
    scenario: { id: 'f1', family: 'fire', label: 'Fire at dispenser' },
    drillDay: '2026-11-22',
    startTime: '11:00',
    durationMinutes: 25,
    level: '1',
    personsPresent: 7,
    photos: [],
    filedAt: NOW,
    portalState: 'pending_approval',
  },
  electrical_audit: {
    kind: 'electrical_audit',
    v: 1,
    outcome: 'partly',
    audits: [{ auditNo: 'A1', auditDate: '20-Nov-2026', points: 4, confirmed: true }],
    pointsTotal: 4,
    filedAt: NOW,
  },
  paper_expiry: {
    kind: 'paper_expiry',
    v: 1,
    scope: 'tanker',
    allLapsed: false,
    items: [{ vehicleReg: 'MH12AB1234', docType: 'puc', docLabel: 'PUC', daysLeft: 3 }],
    moreCount: 4,
    sentOn: '2026-11-24',
  },
  kavach: {
    kind: 'kavach',
    v: 1,
    outletCode: '1E',
    businessDate: '2026-11-23',
    computedAt: NOW,
    scored: true,
    scorePublishable: true,
    pct: 86.4,
    validPoints: 190,
    totalPoints: 220,
    unverifiedCount: 2,
    asks: [{ code: 'a', itemId: 'i', label: { en: 'x', hi: 'x' }, points: 5, state: 'asked' }],
    pending: [],
    pendingOverflow: 0,
  },
  announcement: {
    kind: 'announcement',
    v: 1,
    announcementId: 'an1',
    title: 'TT now at night',
    tone: 'important',
    body: 'Body',
    videoId: 'v1',
    sentAt: NOW,
    ackable: true,
  },
};

const tag = (kind: ReportKind, status: MessageReport['status'] = 'info', day?: string): MessageReport => ({
  kind,
  status,
  ...(day ? { day } : {}),
  data: DATA[kind],
});

const factOf = (kind: ReportKind, label: string, status: MessageReport['status'] = 'info') =>
  summarizeReport(tag(kind, status))?.facts.find((f) => f.label === label)?.value;

describe('the fixtures cover every report kind', () => {
  it('has a snapshot and a short name for all of them', () => {
    expect(Object.keys(DATA).sort()).toEqual([...REPORT_KINDS].sort());
    for (const k of REPORT_KINDS) expect(REPORT_KIND_SHORT_NAME[k]).toBeTruthy();
  });

  it.each(REPORT_KINDS)('%s: gives a name, a status word and at least one fact', (kind) => {
    const s = summarizeReport(tag(kind, 'attention'));
    expect(s).not.toBeNull();
    expect(s!.kind).toBe(kind);
    expect(s!.name).toBe(REPORT_KIND_SHORT_NAME[kind]);
    expect(s!.statusWord).toBe('Needs a look');
    expect(s!.facts.length + (s!.headline ? 1 : 0)).toBeGreaterThan(0);
    for (const f of s!.facts) {
      expect(f.label).toBeTruthy();
      expect(f.value).not.toMatch(/undefined|NaN|\[object/);
    }
    if (s!.headline) expect(s!.headline).not.toMatch(/undefined|NaN|\[object/);
  });
});

describe('summarizeReport: status words', () => {
  it('says the verdict in words for each status', () => {
    expect(summarizeReport(tag('dsr_sales', 'ok'))!.statusWord).toBe('Fine');
    expect(summarizeReport(tag('dsr_sales', 'attention'))!.statusWord).toBe('Needs a look');
    expect(summarizeReport(tag('dsr_sales', 'info'))!.statusWord).toBe('For information');
  });
});

describe('summarizeReport: when there is nothing to read', () => {
  it('is null for no tag, an old message with no snapshot, a wrong version and a mismatched kind', () => {
    expect(summarizeReport(null)).toBeNull();
    expect(summarizeReport(undefined)).toBeNull();
    expect(summarizeReport({ kind: 'dsr_sales', status: 'ok' })).toBeNull();
    expect(summarizeReport({ kind: 'dsr_sales', status: 'ok', data: { ...DATA.dsr_sales, v: 2 } as unknown as ReportData })).toBeNull();
    expect(summarizeReport({ kind: 'kavach', status: 'ok', data: DATA.dsr_sales })).toBeNull();
  });

  it('never throws on a thin snapshot, only says less', () => {
    for (const kind of REPORT_KINDS) {
      const thin = { kind, v: 1 } as unknown as ReportData;
      expect(() => summarizeReport({ kind, status: 'info', data: thin })).not.toThrow();
      const s = summarizeReport({ kind, status: 'info', data: thin });
      expect(s?.name).toBe(REPORT_KIND_SHORT_NAME[kind]);
    }
  });
});

describe('summarizeReport: the key figures the team needs', () => {
  it('daily sales: total sold, per fuel, and the day', () => {
    const s = summarizeReport(tag('dsr_sales', 'ok'))!;
    expect(s.day).toBe('23 Nov 2026');
    expect(s.headline).toBe('Sold 20,345 L across 2 fuels');
    expect(factOf('dsr_sales', 'HSD')).toBe('sold 12,345 L · month 12,34,567 L');
    expect(factOf('dsr_sales', 'Note')).toBe('Re-sent after a change');
  });

  it('daily sales: a pending day says not worked out, never 0', () => {
    const data = {
      ...DATA.dsr_sales,
      products: [{ key: 'HSD', tankNos: [1], sales: salesBlock(null, 'pending') }],
    } as ReportData;
    const s = summarizeReport({ kind: 'dsr_sales', status: 'info', data })!;
    expect(s.headline).toBe('Sales not worked out yet');
    expect(s.facts[0]).toEqual({ label: 'HSD', value: 'not worked out yet' });
  });

  it('stock variation: names who is outside the limit and by how much', () => {
    const s = summarizeReport(tag('dsr_variation', 'attention'))!;
    expect(s.headline).toBe('Outside the limit: HSD short');
    expect(factOf('dsr_variation', 'HSD')).toBe('-480 L (limit ±150 L), short, outside limit');
    expect(factOf('dsr_variation', 'MS')).toBe('+20 L (limit ±150 L), within limit');
    expect(factOf('dsr_variation', 'Also carries')).toBe('the sales sheet');
  });

  it('stock variation: before the first inspection it is information, not a verdict', () => {
    const data = { ...DATA.dsr_variation, beforeInspection: true } as ReportData;
    expect(summarizeReport({ kind: 'dsr_variation', status: 'info', data })!.headline).toBe(
      'Before the first inspection: figures for information',
    );
  });

  it('stock check: litres, tanks, gauge time and cover; says when the reading is old', () => {
    const s = summarizeReport(tag('stock_check'))!;
    expect(s.headline).toMatch(/Old reading/);
    expect(factOf('stock_check', 'HSD')).toBe('18,250 L in 2 tanks, 1 with no reading');
    expect(factOf('stock_check', 'Read at')).toBe('24 Nov, 7:05 pm');
    expect(factOf('stock_check', 'Cover')).toBe('HSD 3.5 days');
  });

  it('tanker plan: the verdict, tankers, arrival, lowest cover and owner credit', () => {
    const s = summarizeReport(tag('load_plan', 'attention'))!;
    expect(s.headline).toBe('Order now: a tank is running out');
    expect(factOf('load_plan', 'Tankers')).toBe('2 (HSD, MS)');
    expect(factOf('load_plan', 'Arrives')).toBe('25 Nov 2026 at 10:30');
    expect(factOf('load_plan', 'Lowest cover')).toBe('HSD 1.2 days (4,200 L)');
    expect(factOf('load_plan', 'Credit available')).toBe('₹2,50,000');
  });

  it('tanker density: tanker, invoice and the digits exactly as printed', () => {
    expect(factOf('tanker_density', 'Tanker')).toBe('MH12AB1234');
    expect(factOf('tanker_density', 'Invoice')).toBe('INV-778');
    expect(factOf('tanker_density', 'HSD')).toBe('density 0.8321');
  });

  it('tanker receipt: shortage per invoice', () => {
    const s = summarizeReport(tag('tt_ack', 'attention'))!;
    expect(s.headline).toBe('A shortage was recorded');
    expect(factOf('tt_ack', 'Invoice 778')).toBe('short 35 L');
    expect(factOf('tt_ack', 'Invoice 779')).toBe('no shortage');
  });

  it('fuel order: event, stage, order number, fuel and tanker', () => {
    const s = summarizeReport(tag('fuel_order', 'ok'))!;
    expect(s.headline).toBe('Tanker assigned');
    expect(factOf('fuel_order', 'Stage')).toBe('tanker assigned');
    expect(factOf('fuel_order', 'Order no')).toBe('9000123');
    expect(factOf('fuel_order', 'Fuel')).toBe('HSD 12 KL');
    expect(factOf('fuel_order', 'Tanker')).toBe('MH12AB1234');
    expect(s.day).toBe('25 Nov 2026');
  });

  it('credit and DOD: the money in rupees with paise, the limit and the review date', () => {
    const s = summarizeReport(tag('credit_dod', 'attention'))!;
    expect(s.headline).toBe('Overdue ₹1,23,456.50');
    expect(factOf('credit_dod', 'Limit available')).toBe('₹1,00,000 of ₹5,00,000');
    expect(factOf('credit_dod', 'Limit used')).toBe('80%');
    expect(factOf('credit_dod', 'Review')).toBe('31 Dec 2026');
  });

  it('credit and DOD: a back-dated card says so', () => {
    const data = { ...DATA.credit_dod, backdated: true, verdict: 'settled' } as ReportData;
    const s = summarizeReport({ kind: 'credit_dod', status: 'ok', data })!;
    expect(s.headline).toBe('No dues');
    expect(s.facts.find((f) => f.label === 'Note')?.value).toMatch(/Back-dated/);
  });

  it('ledger watch, subsidy claim, water checks and supply status', () => {
    expect(summarizeReport(tag('ledger_watch'))!.headline).toBe('3 entries on the account');
    expect(factOf('ledger_watch', 'Most serious')).toBe('Alert');
    expect(factOf('ledger_watch', 'Latest')).toBe('22 Nov 2026: Unknown fee ₹1,500');
    expect(summarizeReport(tag('calibration_claim'))!.headline).toBe('Claim of ₹30,000 filed');
    expect(factOf('calibration_claim', 'Nozzles')).toBe('6 of 8 included');
    expect(summarizeReport(tag('water_ingress'))!.headline).toBe('10 of 12 checks recorded (83%)');
    expect(factOf('water_ingress', 'Missed')).toBe('2');
    expect(factOf('water_ingress', 'Note')).toBe('The last portal check failed');
    expect(summarizeReport(tag('ro_supply'))!.headline).toBe('Fuel lifting is stopped');
    expect(factOf('ro_supply', 'Failing')).toBe('2');
  });

  it('DU OTP, declaration, mock drill, electrical audit, papers and Kavach', () => {
    expect(summarizeReport(tag('du_otp'))!.headline).toBe('Waiting for the OTP');
    expect(factOf('du_otp', 'Events')).toBe('1 (+2 more)');
    expect(factOf('du_otp', 'First')).toBe('Gilbarco Encore, nozzle 3');
    expect(summarizeReport(tag('declaration_filed'))!.headline).toBe('Safety declaration (daily) filed by MDG');
    expect(factOf('declaration_filed', 'Note')).toBe('Filed late');
    expect(factOf('declaration_filed', 'Days in a row')).toBe('9');
    expect(summarizeReport(tag('mock_drill'))!.headline).toBe('Drill filed on the portal');
    expect(factOf('mock_drill', 'Portal')).toBe('Waiting for approval');
    expect(summarizeReport(tag('electrical_audit'))!.headline).toBe('Partly filed');
    expect(factOf('electrical_audit', 'Points')).toBe('4');
    expect(factOf('paper_expiry', 'Most urgent')).toBe('MH12AB1234 PUC, 3 days left');
    expect(summarizeReport(tag('kavach'))!.headline).toBe('Score 86%');
    expect(factOf('kavach', 'Points')).toBe('190 of 220');
  });

  it('Kavach: an unpublishable score is not printed', () => {
    const data = { ...DATA.kavach, scorePublishable: false } as ReportData;
    const s = summarizeReport({ kind: 'kavach', status: 'info', data })!;
    expect(s.headline).toBe('Score not shown yet');
    expect(s.facts.find((f) => f.label === 'Points')).toBeUndefined();
  });

  it('announcement: tone and whether the dealer must tap Got it (never repeats the words)', () => {
    const s = summarizeReport(tag('announcement', 'attention'))!;
    expect(factOf('announcement', 'Tone')).toBe('Important');
    expect(factOf('announcement', 'Dealer taps "Got it"')).toBe('yes');
    expect(JSON.stringify(s)).not.toContain('TT now at night');
  });
});

describe('summarizeReport: the day', () => {
  it('falls back to the tag day when the snapshot has none', () => {
    const data = { ...DATA.electrical_audit, filedAt: 'garbage' } as ReportData;
    expect(summarizeReport({ kind: 'electrical_audit', status: 'ok', day: '2026-11-20', data })!.day).toBe('20 Nov 2026');
  });
  it('uses the IST day of an instant (late evening UTC is the next day in India)', () => {
    const data = { ...DATA.electrical_audit, filedAt: '2026-11-23T20:00:00.000Z' } as ReportData;
    expect(summarizeReport({ kind: 'electrical_audit', status: 'ok', data })!.day).toBe('24 Nov 2026');
  });
});

describe('formatters', () => {
  it('group digits the Indian way and show paise only when there are some', () => {
    expect(fmtLitres(1234567)).toBe('12,34,567 L');
    expect(fmtLitres(null)).toBe('—');
    expect(fmtRupees(99)).toBe('₹99');
    expect(fmtRupees(1000.5)).toBe('₹1,000.50');
    expect(fmtRupees(-1250)).toBe('₹-1,250');
  });
  it('write days and IST clock times without the machine locale', () => {
    expect(fmtDay('2026-01-05')).toBe('5 Jan 2026');
    expect(fmtDay('soon')).toBe('soon');
    expect(fmtInstant('2026-11-24T00:10:00.000Z')).toBe('24 Nov, 5:40 am');
    expect(fmtInstant('2026-11-24T06:30:00.000Z')).toBe('24 Nov, 12:00 pm');
  });
});

describe('dealerSeesLine', () => {
  it('names the kind when the message has a snapshot', () => {
    expect(dealerSeesLine(tag('dsr_sales'))).toBe('Dealer sees: Daily sales report on Today');
    expect(dealerSeesLine(tag('credit_dod'))).toBe('Dealer sees: Credit & DOD report on Today');
  });
  it('keeps the older line for a message with no snapshot', () => {
    expect(dealerSeesLine({ kind: 'dsr_sales', status: 'ok' })).toBe('Dealer sees: text + Today page');
  });
});
