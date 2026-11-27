import { describe, expect, it } from 'vitest';

import type { PlannerView } from '@dk/shared';

import {
  convertErrorSentence,
  convertFormDefaults,
  isPlannerCode,
  isPlannerStatus,
  planStateWords,
  plannerStateLabel,
  validateConvertForm,
} from './planner';

function view(over: Partial<PlannerView> = {}): PlannerView {
  return {
    active: false,
    paidThrough: null,
    bill: { state: 'none', amountPaise: 23482, autopay: false },
    resendInApp: false,
    priceBeforeGstPaise: 19900,
    priceTotalPaise: 23482,
    stateCode: '06',
    district: null,
    oilCompany: 'iocl',
    stage: 'exploring',
    questionsToday: 0,
    convertedAt: null,
    ...over,
  };
}

describe('telling a planner apart', () => {
  it('reads the PLANNING status', () => {
    expect(isPlannerStatus('PLANNING')).toBe(true);
    expect(isPlannerStatus('ONBOARDING')).toBe(false);
    expect(isPlannerStatus(undefined)).toBe(false);
  });

  it('reads the P code series and never an outlet code', () => {
    expect(isPlannerCode('P1')).toBe(true);
    expect(isPlannerCode(' P27 ')).toBe(true);
    expect(isPlannerCode('15E')).toBe(false);
    expect(isPlannerCode('P')).toBe(false);
    expect(isPlannerCode('PE1')).toBe(false);
    expect(isPlannerCode(undefined)).toBe(false);
  });

  it('names the state with its GST code', () => {
    expect(plannerStateLabel('06')).toBe('Haryana (06)');
    expect(plannerStateLabel('00')).toBe('00');
    expect(plannerStateLabel(null)).toBe('-');
  });
});

describe('planStateWords', () => {
  it('a first bill closed unpaid after 7 days', () => {
    const w = planStateWords(view({ bill: { state: 'closed', amountPaise: 23482, autopay: false } }));
    expect(w.label).toBe('Closed unpaid (7 days)');
    expect(w.intent).toBe('warning');
    expect(w.detail).toContain('The first bill was not paid within 7 days');
  });

  it('says what happens when the person comes back, as the in-app resend switch has it', () => {
    const closed = { bill: { state: 'closed' as const, amountPaise: 23482, autopay: false } };
    const on = planStateWords(view({ ...closed, resendInApp: true })).detail;
    expect(on).toContain('a fresh bill goes on WhatsApp and SMS by itself (at most once a day)');
    expect(on).toContain('"Get the payment details again"');
    const off = planStateWords(view({ ...closed, resendInApp: false })).detail;
    expect(off).not.toMatch(/by itself \(/);
    expect(off).toContain('Nothing goes out by itself while the in-app resend is switched off');
    expect(off).toContain('web browser');

    const stopped = { bill: { state: 'stopped' as const, amountPaise: 23482, autopay: false } };
    expect(planStateWords(view({ ...stopped, resendInApp: true })).detail).toContain('tap "Start again" in the app for fresh payment details');
    expect(planStateWords(view({ ...stopped, resendInApp: false })).detail).toContain('The phone apps show no button');
  });

  it('a renewal bill closed unpaid says when the paid month ended', () => {
    const w = planStateWords(
      view({ paidThrough: '2026-11-20', bill: { state: 'closed', amountPaise: 23482, autopay: false } }),
    );
    expect(w.label).toBe('Closed unpaid (7 days)');
    expect(w.detail).toMatch(/^The paid month ended on .+\. The renewal bill was not paid within 7 days/);
  });

  it('waiting for the first payment', () => {
    const w = planStateWords(view({ bill: { state: 'sent', amountPaise: 23482, autopay: true } }));
    expect(w.label).toBe('Waiting for payment');
    expect(w.intent).toBe('warning');
    expect(w.detail).toContain('₹234.82');
    expect(w.detail).toContain('No answers until it is paid');
  });

  it('paid with autopay', () => {
    const w = planStateWords(
      view({ active: true, paidThrough: '2026-12-25', bill: { state: 'paid', amountPaise: 23482, autopay: true } }),
    );
    expect(w.label).toBe('Paid');
    expect(w.intent).toBe('success');
    expect(w.detail).toContain('25 Dec 2026');
    expect(w.detail).toContain('Autopay is on');
  });

  it('paid month still running after autopay stopped', () => {
    const w = planStateWords(
      view({ active: true, paidThrough: '2026-12-25', bill: { state: 'stopped', amountPaise: 23482, autopay: false } }),
    );
    expect(w.label).toBe('Paid · autopay stopped');
    expect(w.detail).toContain('25 Dec 2026');
  });

  it('stopped and ended', () => {
    const w = planStateWords(
      view({ paidThrough: '2026-11-20', bill: { state: 'stopped', amountPaise: 23482, autopay: false } }),
    );
    expect(w.label).toBe('Stopped');
    expect(w.intent).toBe('danger');
    expect(w.detail).toContain('20 Nov 2026');
  });

  it('a paid month that ran out', () => {
    const w = planStateWords(
      view({ paidThrough: '2026-11-20', bill: { state: 'paid', amountPaise: 23482, autopay: false } }),
    );
    expect(w.label).toBe('Ended');
  });

  it('no bill', () => {
    expect(planStateWords(view()).label).toBe('No bill yet');
  });

  it('switched to Dealer Kavach wins over everything', () => {
    const w = planStateWords(view({ active: true, convertedAt: '2026-11-26T06:00:00.000Z' }));
    expect(w.label).toBe('Switched to Dealer Kavach');
  });
});

describe('the switch form', () => {
  it('carries over a real oil company only', () => {
    expect(convertFormDefaults('bpcl').oilCompany).toBe('bpcl');
    expect(convertFormDefaults('undecided').oilCompany).toBe('');
    expect(convertFormDefaults('other').oilCompany).toBe('');
    expect(convertFormDefaults(null).oilCompany).toBe('');
  });

  it('names every missing field in a sentence', () => {
    const res = validateConvertForm({ sapCode: '  ', pumpName: '', siteType: '', oilCompany: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(Object.keys(res.errors).sort()).toEqual(['oilCompany', 'pumpName', 'sapCode', 'siteType']);
    expect(res.errors.sapCode).toMatch(/SAP code/);
  });

  it('refuses an over-long SAP code, as the server would', () => {
    const res = validateConvertForm({ sapCode: 'x'.repeat(61), pumpName: 'A', siteType: 'A', oilCompany: 'iocl' });
    expect(res.ok).toBe(false);
  });

  it('trims and builds the body the server takes', () => {
    const res = validateConvertForm({
      sapCode: ' 289456 ',
      pumpName: ' Shree Fuels ',
      siteType: 'B',
      oilCompany: 'hpcl',
    });
    expect(res).toEqual({
      ok: true,
      body: { sapCode: '289456', pumpName: 'Shree Fuels', siteType: 'B', oilCompany: 'hpcl' },
    });
  });
});

describe('convertErrorSentence', () => {
  it("shows the server's own sentence on a 409", () => {
    expect(convertErrorSentence({ status: 409, message: 'SAP code 289456 is already a client.' })).toBe(
      'SAP code 289456 is already a client.',
    );
  });

  it('still gives a sentence when a 409 has none', () => {
    expect(convertErrorSentence({ status: 409, message: '' })).toMatch(/already with another client/);
  });

  it('never shows a bare code for anything else', () => {
    expect(convertErrorSentence(null)).toMatch(/did not go through/);
    expect(convertErrorSentence({ status: 403 })).toMatch(/super admin/);
  });
});
