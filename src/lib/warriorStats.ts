/**
 * Everything the warrior detail view knows how to count, as pure functions.
 *
 * The aggregation lives here rather than inside the drawer for one reason: it is
 * the part that can be *wrong*. A component that both fetches and folds is one
 * where a rounding slip or an off-by-one day is invisible; separated, each of
 * these is a function with an input and an answer.
 *
 * The per-award detail comes from the ledger the API already serves
 * (`GET /dealers/:id/staff/awards?employeeId=&from=&to=`), so a new panel did
 * not mean a new endpoint. Two INPUTS are joined in by the caller and are not
 * optional decoration: `leaveDates` decides which days count as worked, and
 * `workMeta` decides what a per-unit quantity is a quantity OF. Pass either one
 * empty and the answers are wrong rather than merely coarse — leave days
 * re-enter the working-day denominator, and vehicles, guests and rupees all
 * collapse into one bucket.
 *
 * One caveat this cannot paper over: the ledger is capped at 1000 rows
 * server-side, so on a very long window these totals describe the newest 1000
 * awards while the leaderboard's own figure is an uncapped `$sum`. The drawer
 * says so out loud when it happens.
 */
import type {
  EffectiveWorkItem,
  StaffPointAward,
  StaffWorkDomain,
  StaffWorkUnit,
} from '@dk/shared';

import { DOMAIN_LABELS, UNIT_COUNT_LABELS } from './staffWork';

/* ─────────────────────────────── Day arithmetic ─────────────────────────── */

/**
 * Calendar days are counted in UTC even though they are IST business dates.
 * A `YYYY-MM-DD` here is a label, not an instant: adding 86 400 000 ms to a
 * *local* midnight lands on 23:00 or 01:00 on a DST boundary and eventually
 * skips or repeats a day, while UTC has no such boundary to trip over.
 */
function ymdToUtc(ymd: string): number {
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
}

function utcToYmd(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * The most days this will ever enumerate. Callers are expected to cap their own
 * picker well below it (the staff tab passes `maxRangeDays` to
 * `DateRangeFilter`); this exists so a date typo that slips past a caller cannot
 * turn into a million-iteration loop and a frozen tab.
 */
export const MAX_ENUMERATED_DAYS = 2000;

/** Every calendar day in an inclusive window, in order. Capped; see above. */
export function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  const end = ymdToUtc(to);
  for (let t = ymdToUtc(from); t <= end && out.length < MAX_ENUMERATED_DAYS; t += 86_400_000) {
    out.push(utcToYmd(t));
  }
  return out;
}

/**
 * The same-length window ending the day before this one — the comparison the
 * stat tiles measure change against.
 *
 * Same-length-immediately-before is used for EVERY preset, including the two
 * month ones, on purpose. Comparing a month-to-date "This month" against a full
 * previous calendar month would put 14 days next to 31 and call the difference a
 * drop. Callers name the resulting dates in the delta label, so an unusual
 * window ("31 May – 30 Jun" for a 31-day July) explains itself.
 */
export function previousWindow(from: string, to: string): { from: string; to: string } {
  const len = Math.max(1, enumerateDays(from, to).length);
  const end = ymdToUtc(from) - 86_400_000;
  return { from: utcToYmd(end - (len - 1) * 86_400_000), to: utcToYmd(end) };
}

/** Points carry 2 dp; summing floats without this leaks `0.30000000000000004`. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ───────────────────────────────── Work metadata ────────────────────────── */

export interface WorkMeta {
  domain?: StaffWorkDomain;
  unit?: StaffWorkUnit;
}

/**
 * code → domain/unit, from the dealer's EFFECTIVE work list.
 *
 * The award ledger snapshots a work's label and points but not its domain or
 * unit, so those have to be joined back. The effective list is the right source
 * (it covers the dealer's custom works too) but it is the list as it stands
 * TODAY: a work the dealer has since hidden, or a retired catalog item, has
 * awards in the window and no entry here. Those fall to "Other" rather than
 * being dropped — a missing grouping is a smaller lie than a missing 40 points.
 */
export function buildWorkMeta(items: EffectiveWorkItem[] | undefined): Map<string, WorkMeta> {
  const map = new Map<string, WorkMeta>();
  for (const it of items ?? []) map.set(it.code, { domain: it.domain, unit: it.unit });
  return map;
}

/* ─────────────────────────────────── Shapes ─────────────────────────────── */

export interface WarriorDay {
  /** `YYYY-MM-DD`. */
  date: string;
  points: number;
  awardCount: number;
  onLeave: boolean;
}

export interface Tally {
  key: string;
  label: string;
  points: number;
  count: number;
}

export interface UnitTally {
  key: string;
  label: string;
  quantity: number;
}

export interface WarriorStats {
  /** One entry per calendar day in the window, zero-filled. */
  days: WarriorDay[];
  totalDays: number;
  /** Days marked as leave, whether or not any points were earned on them. */
  leaveDays: number;
  /** Leave days that earned nothing — the ones actually held out of the average. */
  leaveOnlyDays: number;
  /** Days the worker was at the pump — the fair denominator. */
  workedDays: number;
  /** Days that earned at least one point. */
  activeDays: number;
  totalPoints: number;
  awardCount: number;
  avgPerWorkedDay: number;
  bestDay?: WarriorDay;
  /** Days at or above the per-day target. */
  daysAtTarget: number;
  /** Longest run of consecutive at-target days; leave days do not break it. */
  longestTargetRun: number;
  byWork: Tally[];
  byDomain: Tally[];
  byAwarder: Tally[];
  /** Non-money PER_UNIT output, e.g. 42 vehicles. */
  units: UnitTally[];
  /** Rupees logged through `per ₹1,000` sales works. */
  amountRupees: number;
  distinctWorks: number;
}

/* ─────────────────────────────── The aggregation ────────────────────────── */

export function buildWarriorStats(params: {
  awards: StaffPointAward[];
  from: string;
  to: string;
  /** Days THIS worker was on leave, already filtered to them and the window. */
  leaveDates: ReadonlySet<string>;
  targetPerDay: number;
  workMeta: Map<string, WorkMeta>;
}): WarriorStats {
  const { awards, from, to, leaveDates, targetPerDay, workMeta } = params;

  const dayList = enumerateDays(from, to);
  const dayIndex = new Map<string, WarriorDay>();
  for (const date of dayList) {
    dayIndex.set(date, {
      date,
      points: 0,
      awardCount: 0,
      onLeave: leaveDates.has(date),
    });
  }

  // Belt and braces: the query is already bounded to this window, so this drops
  // nothing in practice. It matters when it isn't true — a cached response from
  // a wider window, or a `from`/`to` that moved between the fetch and this
  // render — because then the headline total and the day series would be built
  // from different sets of rows and quietly disagree with each other AND with
  // the leaderboard, which the server bounds the same way.
  //
  // Bounded by the LAST ENUMERATED DAY, not by `to`. They are the same day
  // unless `enumerateDays` hit its cap, and if it ever does, an award past the
  // cut-off has no bucket to land in: counting it in the total anyway is how a
  // panel ends up printing "1,500 pts earned" over an all-zero chart and
  // "Best day —". One window, one set of rows, even in the degenerate case.
  const lastDay = dayList[dayList.length - 1] ?? to;
  const inWindow = awards.filter((a) => a.workDate >= from && a.workDate <= lastDay);

  const works = new Map<string, Tally>();
  const domains = new Map<string, Tally>();
  const awarders = new Map<string, Tally>();
  const units = new Map<string, number>();
  let amountRupees = 0;
  let totalPoints = 0;

  for (const a of inWindow) {
    totalPoints += a.points;

    const day = dayIndex.get(a.workDate);
    if (day) {
      day.points += a.points;
      day.awardCount += 1;
    }

    const work = works.get(a.workItemCode);
    if (work) {
      work.points += a.points;
      work.count += 1;
    } else {
      works.set(a.workItemCode, {
        key: a.workItemCode,
        label: a.workLabelEn,
        points: a.points,
        count: 1,
      });
    }

    const meta = workMeta.get(a.workItemCode);
    const domainKey = meta?.domain ?? 'other';
    const domain = domains.get(domainKey);
    if (domain) {
      domain.points += a.points;
      domain.count += 1;
    } else {
      domains.set(domainKey, {
        key: domainKey,
        label: meta?.domain !== undefined ? DOMAIN_LABELS[meta.domain] : 'Other / retired',
        points: a.points,
        count: 1,
      });
    }

    const awarderKey = a.awardedByUserId || a.awardedByName || 'unknown';
    const awarder = awarders.get(awarderKey);
    if (awarder) {
      awarder.points += a.points;
      awarder.count += 1;
    } else {
      awarders.set(awarderKey, {
        key: awarderKey,
        label: a.awardedByName ?? 'Unknown',
        points: a.points,
        count: 1,
      });
    }

    // Physical output. Only PER_UNIT rows carry a quantity; the rest are a flat
    // "this job was done" and counting them as units would invent throughput.
    if (a.distribution === 'PER_UNIT') {
      const qty = a.quantity ?? 1;
      // `amountRupees` is only denormalised when the award was ENTERED as an
      // amount. A per-₹1,000 work entered as a raw quantity still means money,
      // and the server's own conversion (quantity = rupees / 1000) inverts
      // exactly — so read it back rather than dropping the sale.
      if (meta?.unit === 'rupee-1000' || a.amountRupees !== undefined) {
        amountRupees += a.amountRupees ?? qty * 1000;
      } else {
        const unitKey = meta?.unit ?? 'unit';
        units.set(unitKey, (units.get(unitKey) ?? 0) + qty);
      }
    }
  }

  const days = dayList.map((d) => {
    const day = dayIndex.get(d)!;
    return { ...day, points: round2(day.points) };
  });

  const leaveDays = days.filter((d) => d.onLeave).length;
  const activeDays = days.filter((d) => d.points > 0).length;
  // A day off that still earned points was WORKED. Leave and awards are written
  // by two paths that never consult each other (a worker marked छुट्टी in the
  // morning who then comes in for a half shift is an ordinary Tuesday), so the
  // overlap is reachable — and subtracting those days would put them in the
  // numerator of the average and out of its denominator, and let "days at
  // target" exceed "working days". The at-target loop below already draws the
  // line in exactly this place.
  const leaveOnlyDays = days.filter((d) => d.onLeave && d.points === 0).length;
  const workedDays = days.length - leaveOnlyDays;

  let bestDay: WarriorDay | undefined;
  for (const d of days) {
    if (d.points > 0 && (!bestDay || d.points > bestDay.points)) bestDay = d;
  }

  let daysAtTarget = 0;
  let longestTargetRun = 0;
  let run = 0;
  for (const d of days) {
    // A day off is neither a hit nor a miss: it neither counts toward the run
    // nor resets it. Resetting would punish a worker for taking their leave.
    if (d.onLeave && d.points === 0) continue;
    if (targetPerDay > 0 && d.points >= targetPerDay) {
      daysAtTarget += 1;
      run += 1;
      if (run > longestTargetRun) longestTargetRun = run;
    } else {
      run = 0;
    }
  }

  const byPoints = (a: Tally, b: Tally) => b.points - a.points || a.label.localeCompare(b.label);
  const finish = (m: Map<string, Tally>): Tally[] =>
    [...m.values()].map((t) => ({ ...t, points: round2(t.points) })).sort(byPoints);

  return {
    days,
    totalDays: days.length,
    leaveDays,
    leaveOnlyDays,
    workedDays,
    activeDays,
    totalPoints: round2(totalPoints),
    awardCount: inWindow.length,
    avgPerWorkedDay: round2(totalPoints / Math.max(workedDays, 1)),
    bestDay,
    daysAtTarget,
    longestTargetRun,
    byWork: finish(works),
    byDomain: finish(domains),
    byAwarder: finish(awarders),
    units: [...units.entries()]
      .map(([key, quantity]) => ({
        key,
        // `key` is a StaffWorkUnit for every award whose work we could resolve,
        // and the `UNKNOWN_UNIT` sentinel for the rest — hence the lookup rather
        // than a cast. `rupee-1000` never reaches here; it is summed as money.
        label:
          key in UNIT_COUNT_LABELS
            ? UNIT_COUNT_LABELS[key as keyof typeof UNIT_COUNT_LABELS]
            : 'Units',
        quantity: round2(quantity),
      }))
      .sort((a, b) => b.quantity - a.quantity),
    amountRupees: round2(amountRupees),
    distinctWorks: works.size,
  };
}

/* ──────────────────────────── Chart-ready bucketing ─────────────────────── */

export interface PointsBucket {
  key: string;
  /** Short axis tick. */
  tick: string;
  /** Full label for the readout. */
  label: string;
  /** POINTS PER DAY — a plain day's total, or a block's mean. */
  value: number;
  /** Whole block was leave (only ever true for a single-day block). */
  onLeave: boolean;
  days: number;
  leaveDays: number;
  awardCount: number;
}

/**
 * Turn the day series into at most `maxColumns` chart columns.
 *
 * The value is always **points per day**, never a block total. That is what
 * keeps the 100-point target line honest at every window length: a block sum
 * would need the target scaled by the block size, and the final short block
 * would then sit under a line that does not apply to it. A mean needs no such
 * asterisk, and a one-day block's mean is just that day's points.
 */
export function bucketDays(
  days: WarriorDay[],
  formatDay: (ymd: string) => string,
  formatTick: (ymd: string) => string,
  maxColumns = 62,
): PointsBucket[] {
  if (days.length === 0) return [];
  const size = Math.ceil(days.length / maxColumns);
  if (size <= 1) {
    return days.map((d) => ({
      key: d.date,
      tick: formatTick(d.date),
      label: formatDay(d.date),
      value: d.points,
      onLeave: d.onLeave,
      days: 1,
      leaveDays: d.onLeave ? 1 : 0,
      awardCount: d.awardCount,
    }));
  }

  const out: PointsBucket[] = [];
  for (let i = 0; i < days.length; i += size) {
    const block = days.slice(i, i + size);
    const first = block[0]!;
    const last = block[block.length - 1]!;
    const points = block.reduce((s, d) => s + d.points, 0);
    out.push({
      key: first.date,
      tick: formatTick(first.date),
      label:
        block.length === 1
          ? formatDay(first.date)
          : `${formatDay(first.date)} – ${formatDay(last.date)}`,
      value: round2(points / block.length),
      onLeave: false,
      days: block.length,
      leaveDays: block.filter((d) => d.onLeave).length,
      awardCount: block.reduce((s, d) => s + d.awardCount, 0),
    });
  }
  return out;
}
