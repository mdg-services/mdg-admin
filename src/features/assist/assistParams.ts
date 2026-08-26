import type { MeterTone } from '@/components/charts';
import {
  DATE_RANGE_PRESETS,
  isValidDateRange,
  type DateRangeValue,
} from '@/components/ui';
import { formatDuration, isYmd } from '@/lib/format';
import {
  ASSIST_CHANNELS,
  ASSIST_FOLLOWUP_STATUSES,
  ASSIST_SESSION_STATUSES,
} from '@dk/shared';
import type {
  AssistChannel,
  AssistFollowupStatus,
  AssistSessionStatus,
} from '@dk/shared';

/**
 * Everything the Assistant console decides that is not a rendering decision:
 * which tab a URL means, whether a query param is a real value, what "Length"
 * says for a visit nobody spoke in, and which colour today's spend wears.
 *
 * It is a `.ts` with no JSX and no hooks on purpose. This repo has no test
 * runner, so the only way a rule like "a half-typed `?from=0002-08-1` must
 * never reach the API" ever gets checked is by keeping it in a plain function
 * somebody can read end to end — the same reason `assistFormat.ts` is shaped
 * this way.
 */

export const PAGE_SIZE = 25;
export const USAGE_DAYS = 30;

/**
 * How many of those days the chart plots below md.
 *
 * Thirty columns in a 296px card is 7.9px per column, and each column is the
 * only tap target for that day's figure. The window narrows; the totals and the
 * table underneath still cover all thirty, so the numbers mean the same thing
 * on a phone as on a laptop.
 */
export const USAGE_CHART_COLUMNS_BELOW_MD = 14;

export const TAB_IDS = ['conversations', 'leads', 'flagged', 'blocked', 'usage'] as const;
export type AssistTab = (typeof TAB_IDS)[number];

/**
 * `shortLabel` is not a nicety: five tabs at `px-3 text-sm` need ~402px and a
 * 360px screen offers ~328px, so "Usage" started entirely off the right edge
 * with no fade or peek to say the strip continued. "Chats" buys back ~58px,
 * which is enough for the fifth tab to show. The full word is restored at md.
 */
export const TABS: Array<{ id: AssistTab; label: string; shortLabel?: string }> = [
  { id: 'conversations', label: 'Conversations', shortLabel: 'Chats' },
  { id: 'leads', label: 'Leads' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'usage', label: 'Usage' },
];

export function isTab(v: string | null): v is AssistTab {
  return !!v && (TAB_IDS as readonly string[]).includes(v);
}

export function isChannel(v: string | null): v is AssistChannel {
  return !!v && (ASSIST_CHANNELS as readonly string[]).includes(v);
}

export function isStatus(v: string | null): v is AssistSessionStatus {
  return !!v && (ASSIST_SESSION_STATUSES as readonly string[]).includes(v);
}

export function isFollowup(v: string | null): v is AssistFollowupStatus {
  return !!v && (ASSIST_FOLLOWUP_STATUSES as readonly string[]).includes(v);
}

/**
 * The date window a URL describes, or none at all.
 *
 * A window is optional — the list opens on every date on record, so a lead from
 * last month is never quietly hidden behind a default. When one IS set both
 * ends must be real days in order, or there is no window: a half-typed
 * `?from=0002-08-1` must never reach the API.
 */
export function rangeFromParams(
  fromParam: string | null,
  toParam: string | null,
  presetParam: string | null,
): DateRangeValue | null {
  if (!isYmd(fromParam) || !isYmd(toParam)) return null;
  if (!isValidDateRange({ from: fromParam, to: toParam })) return null;
  return {
    preset: DATE_RANGE_PRESETS.some((p) => p.id === presetParam)
      ? (presetParam as DateRangeValue['preset'])
      : 'custom',
    from: fromParam,
    to: toParam,
  };
}

/** What the filter button has to admit to, so a filtered list is never a mystery. */
export function activeFilterCount(f: {
  channel?: AssistChannel;
  status?: AssistSessionStatus;
  followupStatus?: AssistFollowupStatus;
  q?: string;
  range: DateRangeValue | null;
}): number {
  let n = 0;
  if (f.channel) n += 1;
  if (f.status) n += 1;
  if (f.followupStatus) n += 1;
  if (f.q) n += 1;
  if (f.range) n += 1;
  return n;
}

/**
 * The "Length" of a session, for a reader rather than a developer.
 *
 * A session nobody sent anything in has no length worth printing:
 * `formatDuration(0)` says "0ms", which reads like a measurement rather than
 * like nothing having happened.
 */
export function sessionLength(s: { durationMs: number; turnCount: number }): string {
  if (s.turnCount === 0) return '—';
  return formatDuration(s.durationMs);
}

/** A whole-number share, for a label that sits beside the rupee figure. */
export function sharePct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function toneForSpend(todayPaise: number, budgetPaise: number): MeterTone {
  if (budgetPaise <= 0) return 'brand';
  const pct = (todayPaise / budgetPaise) * 100;
  if (pct >= 100) return 'danger';
  if (pct >= 80) return 'warning';
  return 'brand';
}
