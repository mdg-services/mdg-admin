import { formatDateTime } from '@/lib/format';
import type { DealerService } from '@dk/shared';

export interface ScheduleSummary {
  /** `warning` = it will never fire again, and that is not what was asked for. */
  intent: 'info' | 'warning';
  text: string;
}

/**
 * One honest sentence about when an attachment will next run.
 *
 * The scheduler claims work strictly on `status: ACTIVE` + `nextRunAt <= now`;
 * it never looks at the cadence. So only three states matter: paused (nothing
 * fires), a real `nextRunAt` (it fires then), or no `nextRunAt` at all. The
 * last one is normal for ON_DEMAND without a cron and a silent stall on
 * anything else — the backend stores a cron it cannot parse and simply leaves
 * `nextRunAt` empty, so this is the only place that failure ever surfaces.
 */
export function describeSchedule(ds: DealerService): ScheduleSummary {
  if (ds.status === 'PAUSED') {
    return {
      intent: 'info',
      text: 'Paused — it will not run until you resume it.',
    };
  }
  if (ds.nextRunAt) {
    return { intent: 'info', text: `Next run ${formatDateTime(ds.nextRunAt)}.` };
  }
  if (ds.cadence === 'ON_DEMAND' && !ds.customCron) {
    return {
      intent: 'info',
      text: 'On demand — it runs only when you press Run now.',
    };
  }
  return {
    intent: 'warning',
    text: 'No next run could be computed, so it will not run on a timer. Check the custom cron.',
  };
}
