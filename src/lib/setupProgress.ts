/**
 * Where an outlet's setup stands, in the words the team uses: services, not steps
 * (ADR 0050). Pure, so every sentence is a plain unit test.
 *
 * The standard package works in eleven steps, but a person asks two questions:
 * "is it running?" and "is anything waiting on me?". So the steps are folded into
 * the four services whose figures they work out — IRAS shift data, Credit & dues,
 * the DSR, the Load planner — each with ONE line: ready, working now, waiting for
 * something outside (and when it is tried again), waiting for another service, or
 * needing a person (and what to do). The other services need no figures and run
 * from the moment the services start.
 */
import { istStamp } from '@/lib/intake';
import { serviceLabel } from '@/lib/serviceLabel';
import type {
  OutletSetupAdmin,
  ServicePackageState,
  ServicePackageStepKey,
  ServicePackageStepView,
  ServicePackageView,
  SetupWatchNote,
} from '@dk/shared';

/** The four services whose starting figures the package works out, and the steps that do it. */
export const FIGURE_SERVICES: ReadonlyArray<{
  serviceId: string;
  steps: readonly ServicePackageStepKey[];
}> = [
  { serviceId: 'iras-shift-data', steps: ['shift_time', 'shift_days'] },
  { serviceId: 'credit-dod-monitoring', steps: ['credit'] },
  { serviceId: 'dsr-report', steps: ['inspection', 'invoices', 'ledger_check', 'dsr'] },
  { serviceId: 'load-planner', steps: ['planner'] },
];

/** Steps that belong to no one service: a problem in one is shown on its own. */
const GENERAL_STEPS: readonly ServicePackageStepKey[] = ['logins', 'basic', 'first_runs'];

export type Readiness =
  | { kind: 'ready' }
  | { kind: 'working'; detail: string }
  | { kind: 'waiting'; detail: string; retryAt: string | null; tries: number }
  | { kind: 'needs_you'; detail: string; action: string | null; dealer: boolean }
  | { kind: 'after'; detail: string };

export interface ReadinessRow {
  key: string;
  name: string;
  readiness: Readiness;
}

const done = (s: ServicePackageStepView | undefined) =>
  !!s && (s.state === 'done' || s.state === 'skipped');

/** "next try 3:30 pm" / "next try 22 Nov, 9:00 am". */
export function nextTryText(iso: string | null, now: number): string {
  if (!iso) return 'tried again by itself';
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return 'tried again by itself';
  if (at <= now) return 'trying again now';
  return `next try ${istStamp(iso, now)}`;
}

function troubleOf(step: ServicePackageStepView): Readiness {
  const w: SetupWatchNote | null = step.watch;
  if (step.state === 'blocked') {
    return {
      kind: 'needs_you',
      detail: w?.headline ?? step.message ?? `${step.label} could not finish.`,
      action: w?.action ?? null,
      dealer: w?.verdict === 'needs_dealer',
    };
  }
  return {
    kind: 'waiting',
    detail: w?.headline ?? step.message ?? `${step.label} is waiting.`,
    retryAt: step.retryAt,
    tries: step.tries,
  };
}

/** One service's line, from its steps. */
export function readinessOf(
  setup: ServicePackageView,
  steps: readonly ServicePackageStepKey[],
): Readiness {
  const own = steps
    .map((k) => setup.steps.find((s) => s.key === k))
    .filter((s): s is ServicePackageStepView => !!s);
  if (own.length > 0 && own.every(done)) return { kind: 'ready' };
  const blocked = own.find((s) => s.state === 'blocked');
  if (blocked) return troubleOf(blocked);
  const running = own.find((s) => s.state === 'running');
  if (running) {
    return {
      kind: 'working',
      detail: running.progress
        ? `${running.label}: ${running.progress.done} of ${running.progress.total}`
        : `${running.label}…`,
    };
  }
  const waiting = own.find((s) => s.state === 'waiting');
  if (waiting) return troubleOf(waiting);
  // Pending: what it waits for, outside its own steps (inside them it is just "next").
  const ownLabels = new Set(own.map((s) => s.label));
  const outside = own.flatMap((s) => s.waitsFor).filter((l) => !ownLabels.has(l));
  if (outside.length > 0) {
    const waitedService = FIGURE_SERVICES.find((f) =>
      f.steps.some((k) => outside.includes(setup.steps.find((s) => s.key === k)?.label ?? '')),
    );
    return {
      kind: 'after',
      detail: waitedService
        ? `Starts after ${serviceLabel(waitedService.serviceId)}`
        : `Waits for: ${outside[0]}`,
    };
  }
  return { kind: 'working', detail: 'Next in line' };
}

/** The four figure services, one line each. */
export function figureRows(setup: ServicePackageView): ReadinessRow[] {
  return FIGURE_SERVICES.map((f) => ({
    key: f.serviceId,
    name: serviceLabel(f.serviceId),
    readiness: readinessOf(setup, f.steps),
  }));
}

/** A problem in a step that belongs to no one service (the logins, attaching, the first runs). */
export function generalRows(setup: ServicePackageView): ReadinessRow[] {
  return setup.steps
    .filter(
      (s) => GENERAL_STEPS.includes(s.key) && (s.state === 'blocked' || s.state === 'waiting'),
    )
    .map((s) => ({ key: s.key, name: s.label, readiness: troubleOf(s) }));
}

/** How many of the package's services are running now, and how many are still getting ready. */
export function serviceCounts(state: ServicePackageState): {
  running: number;
  gettingReady: number;
} {
  const running = state.services.filter((s) => s.attached && s.status === 'ACTIVE').length;
  return { running, gettingReady: Math.max(0, state.services.length - running) };
}

/**
 * The one sentence at the top of the Setup card: where the outlet stands. Null for
 * the stages before the logins, where the card's other lines already say it.
 */
export function leadLine(
  outlet: Pick<OutletSetupAdmin, 'stage' | 'milestones'>,
  pkg: ServicePackageState | null | undefined,
  now: number,
): string | null {
  const { stage, milestones } = outlet;
  if (stage === 'logins') {
    return "Waiting for the dealer's portal logins. The services start by themselves once they work.";
  }
  if (stage === 'setup') {
    const auto = pkg?.autoStart ?? null;
    if (auto === 'served') {
      return 'Its services have been running for days but were never marked started, so they are not started by themselves. Press Start now to mark them started.';
    }
    if (auto === 'off' || auto === 'not_iocl')
      return 'The logins work. Press Start now to start the services.';
    const basic = pkg?.setup?.steps.find((s) => s.key === 'basic');
    if (!pkg?.setup || !done(basic)) {
      return 'The logins work. The services are being attached and start by themselves within a few minutes.';
    }
    return 'The logins work. The services start by themselves within a minute.';
  }
  if (stage === 'watch' || stage === 'live') {
    const since = milestones.servicesStartedAt
      ? ` since ${istStamp(milestones.servicesStartedAt, now)}`
      : '';
    const watch =
      stage === 'watch' && milestones.watchUntil
        ? ` · messages checked by the team until ${istStamp(milestones.watchUntil, now)}`
        : '';
    return `Services running${since}${watch}.`;
  }
  return null;
}

/** True while some figure service is not ready yet, or a general step has a problem. */
export function stillGettingReady(setup: ServicePackageView | null | undefined): boolean {
  if (!setup) return false;
  return setup.steps.some((s) => s.state !== 'done' && s.state !== 'skipped');
}
