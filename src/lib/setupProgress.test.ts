import { describe, expect, it } from 'vitest';

import {
  SERVICE_PACKAGE_STEP_LABELS,
  SERVICE_PACKAGE_STEPS,
  type ServicePackageState,
  type ServicePackageStepKey,
  type ServicePackageStepView,
  type ServicePackageView,
} from '@dk/shared';

import { figureRows, generalRows, leadLine, nextTryText, readinessOf } from './setupProgress';

const NOW = Date.parse('2026-11-21T09:00:00.000Z');

function step(key: ServicePackageStepKey, over: Partial<ServicePackageStepView> = {}): ServicePackageStepView {
  return {
    key,
    label: SERVICE_PACKAGE_STEP_LABELS[key],
    state: 'pending',
    message: null,
    notes: [],
    startedAt: null,
    finishedAt: null,
    progress: null,
    retryAt: null,
    tries: 0,
    watch: null,
    waitsFor: [],
    ...over,
  };
}

/** 56E on 21 Nov: the day close waits for IRAS, credit is working, the rest follow. */
function fiftySixE(): ServicePackageView {
  const done = (k: ServicePackageStepKey) => step(k, { state: 'done' });
  const steps: Record<ServicePackageStepKey, ServicePackageStepView> = {
    logins: done('logins'),
    basic: done('basic'),
    inspection: done('inspection'),
    shift_time: step('shift_time', {
      state: 'waiting',
      retryAt: '2026-11-21T10:00:00.000Z',
      tries: 2,
      watch: {
        verdict: 'retrying',
        headline: "IRAS has no closing readings from this pump for the last three days yet.",
        action: 'Nothing to do: the setup tries again by itself at 3:30 pm.',
        by: 'rules',
        at: '2026-11-21T09:00:00.000Z',
      },
    }),
    credit: step('credit', { state: 'running' }),
    shift_days: step('shift_days', { waitsFor: [SERVICE_PACKAGE_STEP_LABELS.shift_time] }),
    invoices: step('invoices', { state: 'running', progress: { done: 12, total: 40 } }),
    ledger_check: step('ledger_check', { waitsFor: [SERVICE_PACKAGE_STEP_LABELS.invoices] }),
    dsr: step('dsr', {
      waitsFor: [
        SERVICE_PACKAGE_STEP_LABELS.shift_days,
        SERVICE_PACKAGE_STEP_LABELS.invoices,
        SERVICE_PACKAGE_STEP_LABELS.ledger_check,
      ],
    }),
    planner: step('planner', { waitsFor: [SERVICE_PACKAGE_STEP_LABELS.dsr] }),
    first_runs: done('first_runs'),
  };
  return {
    dealerId: 'd1',
    status: 'waiting',
    startedAt: '2026-11-21T06:21:00.000Z',
    startedBy: { kind: 'auto', name: null },
    updatedAt: '2026-11-21T09:00:00.000Z',
    steps: SERVICE_PACKAGE_STEPS.map((k) => steps[k]),
    held: [],
    releasedAt: null,
    found: [],
    review: null,
  };
}

function pkg(setup: ServicePackageView | null, over: Partial<ServicePackageState> = {}): ServicePackageState {
  return {
    company: 'iocl',
    setup,
    services: [],
    cannotStart: null,
    inspection: null,
    servicesStartedAt: null,
    autoStart: 'soon',
    ...over,
  };
}

describe('the four services that need figures, one line each', () => {
  it('56E: IRAS waits with its next try, credit works, the DSR and planner say what they wait for', () => {
    const rows = figureRows(fiftySixE());
    expect(rows.map((r) => [r.key, r.readiness.kind])).toEqual([
      ['iras-shift-data', 'waiting'],
      ['credit-dod-monitoring', 'working'],
      ['dsr-report', 'working'],
      ['load-planner', 'after'],
    ]);
    const iras = rows[0]!.readiness;
    expect(iras.kind === 'waiting' && iras.detail).toContain('no closing readings');
    const dsr = rows[2]!.readiness;
    expect(dsr.kind === 'working' && dsr.detail).toBe('Read every tanker invoice since the inspection: 12 of 40');
    const planner = rows[3]!.readiness;
    expect(planner.kind === 'after' && planner.detail).toMatch(/^Starts after /);
  });

  it('a service whose steps are all finished is ready, and a blocked step needs a person', () => {
    const s = fiftySixE();
    s.steps = s.steps.map((x) =>
      x.key === 'credit'
        ? {
            ...x,
            state: 'blocked',
            watch: {
              verdict: 'needs_dealer',
              headline: 'SDMS turned the saved login away.',
              action: 'Ask the owner for the right login.',
              by: 'rules',
              at: '2026-11-21T09:00:00.000Z',
            },
          }
        : x,
    );
    expect(readinessOf(s, ['credit'])).toEqual({
      kind: 'needs_you',
      detail: 'SDMS turned the saved login away.',
      action: 'Ask the owner for the right login.',
      dealer: true,
    });
    expect(readinessOf(s, ['inspection'])).toEqual({ kind: 'ready' });
  });

  it('a stuck step that belongs to no one service is shown on its own', () => {
    const s = fiftySixE();
    expect(generalRows(s)).toEqual([]);
    s.steps = s.steps.map((x) => (x.key === 'first_runs' ? { ...x, state: 'blocked', message: 'RO supply status failed its first run.' } : x));
    expect(generalRows(s).map((r) => r.key)).toEqual(['first_runs']);
  });
});

describe('the lead sentence', () => {
  const outlet = (stage: 'logins' | 'setup' | 'watch' | 'live', started: string | null = null, until: string | null = null) => ({
    stage,
    milestones: {
      approvedAt: null,
      firstSignInAt: null,
      companySavedAt: null,
      billingSavedAt: null,
      billSentAt: null,
      paidAt: null,
      loginsDoneAt: null,
      servicesStartedAt: started,
      watchUntil: until,
      liveAt: null,
    },
  });

  it('says the services start by themselves once the logins work', () => {
    expect(leadLine(outlet('logins'), null, NOW)).toContain('start by themselves once they work');
    expect(leadLine(outlet('setup'), pkg(fiftySixE()), NOW)).toBe(
      'The logins work. The services start by themselves within a minute.',
    );
    expect(leadLine(outlet('setup'), pkg(null), NOW)).toContain('being attached');
  });

  it('41E: served for days but never started is the team’s call, said plainly', () => {
    expect(leadLine(outlet('setup'), pkg(fiftySixE(), { autoStart: 'served' }), NOW)).toContain('Press Start now');
  });

  it('once started: since when, and until when the team checks the messages', () => {
    const line = leadLine(outlet('watch', '2026-11-21T06:22:00.000Z', '2026-11-23T06:22:00.000Z'), pkg(fiftySixE()), NOW)!;
    expect(line).toMatch(/^Services running since .+ · messages checked by the team until .+\.$/);
    expect(leadLine(outlet('live', '2026-11-21T06:22:00.000Z'), null, NOW)).toMatch(/^Services running since /);
  });
});

describe('the next try', () => {
  it('reads as a time, or as now once it has passed', () => {
    expect(nextTryText(null, NOW)).toBe('tried again by itself');
    expect(nextTryText('2026-11-21T08:00:00.000Z', NOW)).toBe('trying again now');
    expect(nextTryText('2026-11-21T10:00:00.000Z', NOW)).toMatch(/^next try /);
  });
});
