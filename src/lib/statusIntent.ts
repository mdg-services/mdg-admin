import type {
  Cadence,
  DealerServiceStatus,
  DealerStatus,
  IrasDayState,
  IrasSnapshotStatus,
  ServiceRunStatus,
  SlaTier,
} from '@dk/shared';

export type Intent = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * Single source of truth for domain status -> intent. Components should NOT
 * branch on raw status strings; they should call statusIntent(...) and pass
 * the result to <StatusChip /> / <Badge />.
 */
export function statusIntent(
  kind: 'dealer',
  v: DealerStatus,
): Intent;
export function statusIntent(
  kind: 'dealerService',
  v: DealerServiceStatus,
): Intent;
export function statusIntent(
  kind: 'run',
  v: ServiceRunStatus,
): Intent;
export function statusIntent(kind: 'sla', v: SlaTier): Intent;
export function statusIntent(kind: 'cadence', v: Cadence): Intent;
export function statusIntent(
  kind: 'irasSnapshot',
  v: IrasSnapshotStatus,
): Intent;
export function statusIntent(kind: 'irasDayState', v: IrasDayState): Intent;
export function statusIntent(kind: string, v: string): Intent {
  switch (kind) {
    case 'dealer':
      if (v === 'ACTIVE') return 'success';
      if (v === 'ONBOARDING') return 'warning';
      if (v === 'SUSPENDED') return 'danger';
      return 'neutral';
    case 'dealerService':
      if (v === 'ACTIVE') return 'success';
      if (v === 'PAUSED') return 'neutral';
      return 'neutral';
    case 'run':
      if (v === 'PENDING') return 'neutral';
      if (v === 'RUNNING') return 'info';
      if (v === 'SUCCESS') return 'success';
      if (v === 'FAILED') return 'danger';
      return 'neutral';
    case 'sla':
      if (v === 'BRONZE') return 'neutral';
      if (v === 'SILVER') return 'info';
      if (v === 'GOLD') return 'warning';
      return 'neutral';
    case 'cadence':
      if (v === 'ON_DEMAND') return 'info';
      return 'neutral';
    case 'irasSnapshot':
      if (v === 'COMPLETE') return 'success';
      if (v === 'PARTIAL') return 'warning';
      if (v === 'FAILED') return 'danger';
      return 'neutral';
    case 'irasDayState':
      // A day with no data at all is `danger`, the same weight as a failed
      // collection: the consequence is identical — the day is absent from every
      // report that covers it — and the only difference is whether anything
      // tried. An admin scanning the month needs both to catch the eye.
      if (v === 'MISSING') return 'danger';
      if (v === 'FAILED') return 'danger';
      if (v === 'PARTIAL') return 'warning';
      if (v === 'MISMATCH') return 'warning';
      // Accepted, not fine: `info` rather than `success`, because the gap is
      // still there and somebody chose to live with it.
      if (v === 'MISMATCH_OK') return 'info';
      if (v === 'OK') return 'success';
      // OPEN — today, on every dealer, every day. Nothing is wrong with it.
      return 'neutral';
    default:
      return 'neutral';
  }
}

export const INTENT_CLASSES: Record<Intent, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-neutral-soft text-neutral',
};
