
import { formatDmy, formatInrWhole, formatLitres, formatYmd, inrFormat } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import {
  daysBetweenIsoDays,
  type LoadPlan,
  type LoadPlanChamber,
  type LoadPlanCredit,
  type LoadPlanInTransit,
  type LoadPlanLeadTime,
  type LoadPlanOutcome,
  type LoadPlanPool,
  type LoadPlanScorecard,
  type LoadPlanStatus,
  type LoadPlanSummary,
  type LoadPlanTank,
  type LoadPlanTruck,
} from '@dk/shared';

/**
 * Every decision the Load Planner pane makes, taken out of the components.
 *
 * `mdg-admin` has no test runner (see `ttDensity/format.ts`'s header, which this
 * file follows exactly), so a rule written inside a `.tsx` is a rule nothing can
 * ever check. The ten sections of the pane each read one or two functions here —
 * labels, colours, which figures are highlighted, which buttons are enabled — and
 * the components are left with nothing to get wrong but layout.
 *
 * NO JARGON IN THE OUTPUT. "Pool" never reaches a label here — every function
 * that needs a fuel group's name is handed the plan's own `label` (e.g. "Diesel
 * (tanks 4 + 6)") through `poolLabelMap`, never the stable `key` ("HSD").
 */

const NO_VALUE = '—';

/* ─────────────────────── section 1 — headline + status ─────────────────── */

export type HeadlineTone = 'urgent' | 'orderToday' | 'clear';

/** Urgent beats orderToday beats clear — a plan that is both urgent and asking
 *  for an order today is shown as urgent, the stronger of the two facts. */
export function headlineTone(plan: Pick<LoadPlan, 'urgent' | 'orderToday'>): HeadlineTone {
  if (plan.urgent) return 'urgent';
  if (plan.orderToday) return 'orderToday';
  return 'clear';
}

export interface HeadlineStyle {
  tone: HeadlineTone;
  borderClass: string;
  bgClass: string;
  textClass: string;
}

export function headlineStyle(tone: HeadlineTone): HeadlineStyle {
  if (tone === 'urgent') {
    return { tone, borderClass: 'border-danger/40', bgClass: 'bg-danger-soft/40', textClass: 'text-danger' };
  }
  if (tone === 'orderToday') {
    return { tone, borderClass: 'border-warning/40', bgClass: 'bg-warning-soft/40', textClass: 'text-warning' };
  }
  return { tone, borderClass: 'border-success/40', bgClass: 'bg-success-soft/40', textClass: 'text-success' };
}

const STATUS_LABEL: Record<LoadPlanStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Sent',
  DISMISSED: 'Dismissed',
  SUPERSEDED: 'Replaced',
};

/** The status chip's word. Never the raw enum — "APPROVED" says nothing about
 *  a card that was actually sent into a chat. */
export function statusChipLabel(status: LoadPlanStatus): string {
  return STATUS_LABEL[status];
}

export function statusChipIntent(status: LoadPlanStatus): Intent {
  switch (status) {
    case 'DRAFT':
      return 'neutral';
    case 'APPROVED':
      return 'success';
    case 'DISMISSED':
      return 'warning';
    case 'SUPERSEDED':
      return 'neutral';
  }
}

/** "Stock at 6 AM, 11 Aug 2026" — the morning the figures in this plan were read. */
export function stockAsOfLine(businessDate: string): string {
  return `Stock at 6 AM, ${formatYmd(businessDate)}`;
}

/**
 * How stale the latest plan is, in words — `null` when it is this morning's.
 *
 * A plan is only ever made for a past or current morning, never a future one,
 * so a non-positive age is treated as "current" rather than printed as a
 * negative number nobody asked for.
 */
export function planAgeNote(businessDate: string, todayYmd: string): string | null {
  const age = daysBetweenIsoDays(businessDate, todayYmd);
  if (!Number.isFinite(age) || age <= 0) return null;
  return age === 1
    ? "This is yesterday morning's plan — nothing newer has run yet."
    : `This plan is ${age} days old — nothing newer has run yet.`;
}

/* ───────────────────────────── section 2 — warnings ──────────────────────── */

export function warningsHeading(count: number): string {
  return count === 1 ? 'One thing to check before sending' : `${count} things to check before sending`;
}

/* ─────────────────────────────── shared: pool labels ──────────────────────── */

/** `{ HSD: "Diesel (tanks 4 + 6)", ... }` — every label lookup in this file goes
 *  through a map built from the PLAN ITSELF, so a relabelled pool in the config
 *  shows its new name without this file knowing the config exists. */
export function poolLabelMap(pools: readonly Pick<LoadPlanPool, 'key' | 'label'>[]): Record<string, string> {
  return Object.fromEntries(pools.map((p) => [p.key, p.label]));
}

function labelFor(key: string | null, map: Record<string, string>, fallback = 'Empty'): string {
  if (!key) return fallback;
  return map[key] ?? key;
}

/* ───────────────────────────── section 3 — the truck ─────────────────────── */

export function truckDatesLine(truck: Pick<LoadPlanTruck, 'orderOn' | 'arriveOn'>): string {
  return `Order on ${formatYmd(truck.orderOn)} · unload on ${formatYmd(truck.arriveOn)}`;
}

export interface ChamberTile {
  key: string;
  fuelLabel: string;
  litresLabel: string;
  tankLabel: string;
  why: string;
  empty: boolean;
}

export function chamberTiles(
  chambers: readonly LoadPlanChamber[],
  poolLabelByKey: Record<string, string>,
): ChamberTile[] {
  return chambers.map((c, i) => ({
    key: `${i}-${c.poolKey ?? 'empty'}`,
    fuelLabel: labelFor(c.poolKey, poolLabelByKey),
    litresLabel: formatLitres(c.litres),
    tankLabel: c.tankNo != null ? `Tank ${c.tankNo}` : NO_VALUE,
    why: c.why,
    empty: !c.poolKey,
  }));
}

/** The next-truck sketch's one-liner: `18 Aug → unload 19 Aug: Diesel 4,000 L`. */
export function nextTruckLine(truck: LoadPlanTruck, poolLabelByKey: Record<string, string>): string {
  const filled = truck.chambers.filter((c): c is LoadPlanChamber & { poolKey: string } => !!c.poolKey);
  const fuels = filled
    .map((c) => `${labelFor(c.poolKey, poolLabelByKey)} ${formatLitres(c.litres)}`)
    .join(' · ');
  return `${formatYmd(truck.orderOn)} → unload ${formatYmd(truck.arriveOn)}: ${fuels || 'nothing yet decided'}`;
}

export function estimatedCostLine(cost: number | null): string {
  return cost == null ? 'Cost not known — a fuel price is missing' : formatInrWhole(cost);
}

/* ───────────────────────────── section 4 — fuel table ────────────────────── */

export interface FuelRow {
  key: string;
  label: string;
  stock: string;
  lowStockLine: string;
  spare: string;
  spareNegative: boolean;
  sellsPerDay: string;
  daysLeft: string;
  runsOut: string;
  onTheWay: string;
  atLine: boolean;
}

function sellsPerDayLabel(normal: number | null, busy: number | null): string {
  if (normal == null) return 'No data yet';
  const normalText = formatLitres(normal);
  if (busy == null || busy <= normal) return normalText;
  return `${normalText} · ${formatLitres(busy)} busy`;
}

export function fuelRow(pool: LoadPlanPool): FuelRow {
  return {
    key: pool.key,
    label: pool.label,
    stock: formatLitres(pool.stock),
    lowStockLine: formatLitres(pool.lowStock),
    spare: formatLitres(pool.spare, { sign: true }),
    spareNegative: pool.spare < 0,
    sellsPerDay: sellsPerDayLabel(pool.ratePerDay, pool.busyPerDay),
    daysLeft: pool.daysLeft == null ? NO_VALUE : `${pool.daysLeft.toFixed(1)} days`,
    runsOut: pool.runOutOn ? formatYmd(pool.runOutOn) : NO_VALUE,
    onTheWay: pool.onTheWay > 0 ? formatLitres(pool.onTheWay) : NO_VALUE,
    atLine: pool.atLine,
  };
}

/** The classes for a fuel row that is already at its line — the one highlight
 *  rule in the whole table, so a dealer about to run dry is never just another
 *  row in a list an admin has to read every cell of. */
export function fuelRowClasses(row: Pick<FuelRow, 'atLine'>): string {
  return row.atLine ? 'bg-danger-soft/40' : '';
}

const SKIP_WHY: Record<LoadPlanPool['daysSkipped'][number]['why'], string> = {
  AT_LINE: 'At the low-stock line',
  NO_DATA: 'No data',
  OTHER_FUEL_DRY: 'Another fuel was dry — its customers bought this one',
};

export interface SkippedDayLine {
  date: string;
  why: string;
}

/** Newest first — the day that makes a reader doubt the figure is usually the
 *  most recent one. */
export function daysSkippedLines(pool: Pick<LoadPlanPool, 'daysSkipped'>): SkippedDayLine[] {
  return pool.daysSkipped
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((d) => ({ date: formatYmd(d.date), why: SKIP_WHY[d.why] }));
}

/** The collapsed summary line: `12 of 14 days counted, 2 left out`. */
export function daysSkippedSummary(
  pool: Pick<LoadPlanPool, 'daysSkipped' | 'rateDaysUsed'> & { rateWindowDays?: number },
): string {
  const skipped = pool.daysSkipped.length;
  const counted = pool.rateDaysUsed;
  // Plans made before the window could widen carry no `rateWindowDays`.
  const span = pool.rateWindowDays ? ` of the last ${pool.rateWindowDays} days` : '';
  if (skipped === 0) return `All ${counted} day${counted === 1 ? '' : 's'}${span} counted.`;
  return `${counted} day${counted === 1 ? '' : 's'}${span} counted, ${skipped} left out`;
}

/* ───────────────────────────────── section 5 — tanks ──────────────────────── */

export interface TankRow {
  key: number;
  label: string;
  stock: string;
  fillUpTo: string;
  room: string;
  noReading: boolean;
}

export function tankRow(tank: LoadPlanTank): TankRow {
  return {
    key: tank.tankNo,
    label: `Tank ${tank.tankNo}`,
    stock: tank.stock == null ? 'No reading this morning' : formatLitres(tank.stock),
    fillUpTo: formatLitres(tank.capacityLitres),
    room: tank.room == null ? NO_VALUE : formatLitres(tank.room),
    noReading: tank.stock == null,
  };
}

/* ──────────────────── section 6 — on the way, credit, lead time ──────────── */

export function inTransitLine(item: LoadPlanInTransit, poolLabelByKey: Record<string, string>): string {
  const fuel = labelFor(item.poolKey, poolLabelByKey, item.product);
  // A tanker read off the purchase ledger before its invoice was downloaded:
  // the litres are worked out from rupees, so they are "about" and say where
  // they came from.
  const litres = item.estimated ? `about ${formatLitres(item.litres)}` : formatLitres(item.litres);
  const parts = [fuel, litres, `invoice ${item.invoiceNo}`, formatYmd(item.invoiceDate)];
  if (item.vehicleNo) parts.push(item.vehicleNo);
  if (item.estimated) parts.push('estimated from the purchase ledger');
  return parts.join(' · ');
}

export interface CreditBoxLines {
  available: string;
  due: string;
  truckCost: string;
  /** `null` when the shortfall cannot be worked out (a price or the credit
   *  reading is missing) — the box must say that plainly rather than hide the
   *  row, since "nothing shown" reads as "covered". */
  deposit: string;
}

export function creditBoxLines(credit: LoadPlanCredit): CreditBoxLines {
  const available = credit.available == null ? 'Not known' : inrFormat(credit.available);
  const due =
    credit.dueAmount == null
      ? 'Not known'
      : credit.dueDate
        ? `${inrFormat(credit.dueAmount)} due ${formatDmy(credit.dueDate)}`
        : inrFormat(credit.dueAmount);
  const truckCost =
    credit.truckCost == null ? 'Not known — a fuel price is missing' : formatInrWhole(credit.truckCost);
  const deposit =
    credit.shortBy == null
      ? 'Cannot be worked out — the credit reading or a fuel price is missing'
      : credit.shortBy <= 0
        ? 'Covered — no deposit needed'
        : `Deposit ${formatInrWhole(credit.shortBy)} before ordering`;
  return { available, due, truckCost, deposit };
}

export function measuredLeadTimeLine(leadTime: LoadPlanLeadTime): string {
  if (leadTime.medianHours == null || leadTime.samples === 0) return 'Not measured yet';
  const hours = Math.round(leadTime.medianHours * 10) / 10;
  return `Median ${hours} h over ${leadTime.samples} truck${leadTime.samples === 1 ? '' : 's'}`;
}

export function leadTimeSettingLine(days: number): string {
  return `Setting: ${days} day${days === 1 ? '' : 's'} from order to unloading`;
}

/* ───────────────────────── section 8 — card + actions ─────────────────────── */

/** Approve and Dismiss share one gate: a plan that was never sent to anyone and
 *  is not a stand-in made after the fact from stored data. */
export function canActOnPlan(plan: Pick<LoadPlan, 'status' | 'backfilled'>): boolean {
  return plan.status === 'DRAFT' && !plan.backfilled;
}

/** Why the actions are disabled, for a tooltip or a line under them — `null`
 *  when they are not. */
export function cannotActReason(plan: Pick<LoadPlan, 'status' | 'backfilled'>): string | null {
  if (plan.backfilled) return 'This plan was made later from stored data and was never shown to anyone — it cannot be sent now.';
  if (plan.status !== 'DRAFT') return `This plan is already ${statusChipLabel(plan.status).toLowerCase()}.`;
  return null;
}

export function approveConfirmDescription(dealerLabel: string): string {
  return `Send this plan to ${dealerLabel}'s chat? They will see the card above.`;
}

const MIN_DISMISS_REASON = 3;
const MAX_DISMISS_REASON = 500;

/** `null` when the reason is good to submit. */
export function dismissReasonProblem(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length < MIN_DISMISS_REASON) return `Say a little more — at least ${MIN_DISMISS_REASON} characters.`;
  if (trimmed.length > MAX_DISMISS_REASON) return `Keep it under ${MAX_DISMISS_REASON} characters.`;
  return null;
}

/* ───────────────────────────── section 9 — scorecard ──────────────────────── */

export function scorecardWindowLabel(sc: Pick<LoadPlanScorecard, 'from' | 'to'>): string {
  return `${formatYmd(sc.from)} – ${formatYmd(sc.to)}`;
}

export interface ScorecardOrdersLine {
  summary: string;
  detail: string | null;
}

/** "6 of 7 sent orders arrived on time", with "1 late, 0 missing" underneath —
 *  or a plain empty state when nobody asked for an order in this window. */
export function scorecardOrdersLine(sc: LoadPlanScorecard): ScorecardOrdersLine {
  if (sc.ordersAsked === 0) {
    return { summary: 'No orders were asked for in this window.', detail: null };
  }
  return {
    summary: `${sc.ordersOnTime} of ${sc.ordersAsked} sent orders arrived on time`,
    detail: `${sc.ordersLate} late · ${sc.ordersMissing} missing`,
  };
}

export interface ScorecardPoolLine {
  key: string;
  label: string;
  value: string;
}

function poolLines(
  record: Record<string, number | null>,
  poolLabelByKey: Record<string, string>,
  render: (v: number | null) => string,
): ScorecardPoolLine[] {
  return Object.entries(record).map(([key, v]) => ({
    key,
    label: poolLabelByKey[key] ?? key,
    value: render(v),
  }));
}

export function dryMorningLines(sc: LoadPlanScorecard, poolLabelByKey: Record<string, string>): ScorecardPoolLine[] {
  return poolLines(sc.dryDays, poolLabelByKey, (v) =>
    v == null || v === 0 ? 'None' : `${v} morning${v === 1 ? '' : 's'}`,
  );
}

export function forecastMissLines(
  sc: LoadPlanScorecard,
  poolLabelByKey: Record<string, string>,
): ScorecardPoolLine[] {
  return poolLines(sc.forecastMissPct, poolLabelByKey, (v) => (v == null ? 'No data' : `${v}% off`));
}

export function spareAtArrivalLines(
  sc: LoadPlanScorecard,
  poolLabelByKey: Record<string, string>,
): ScorecardPoolLine[] {
  return poolLines(sc.coverAtArrival, poolLabelByKey, (v) => (v == null ? 'No data' : `${v.toFixed(1)} days`));
}

/* ───────────────────────────── section 10 — history ───────────────────────── */

const OUTCOME_LABEL: Record<LoadPlanOutcome['truck'], string> = {
  ON_TIME: 'On time',
  LATE: 'Late',
  MISSING: 'Missing',
  PENDING: 'Waiting',
  NOT_APPLICABLE: NO_VALUE,
};

export function outcomeChipLabel(outcome: LoadPlanOutcome | null): string {
  if (!outcome) return NO_VALUE;
  if (outcome.truck === 'LATE' && outcome.lateByDays) {
    return `Late ${outcome.lateByDays} day${outcome.lateByDays === 1 ? '' : 's'}`;
  }
  return OUTCOME_LABEL[outcome.truck];
}

export function outcomeChipIntent(outcome: LoadPlanOutcome | null): Intent {
  if (!outcome) return 'neutral';
  switch (outcome.truck) {
    case 'ON_TIME':
      return 'success';
    case 'LATE':
      return 'warning';
    case 'MISSING':
      return 'danger';
    case 'PENDING':
    case 'NOT_APPLICABLE':
      return 'neutral';
  }
}

export interface HistoryRow {
  id: string;
  date: string;
  statusLabel: string;
  statusIntent: Intent;
  orderedThatDay: string;
  truckLine: string;
  outcomeLabel: string;
  outcomeIntent: Intent;
  /** "Made later — never sent", shown only on a backfilled row. */
  backfilledLabel: string | null;
}

export function historyRow(summary: LoadPlanSummary): HistoryRow {
  return {
    id: summary.id,
    date: formatYmd(summary.businessDate),
    statusLabel: statusChipLabel(summary.status),
    statusIntent: statusChipIntent(summary.status),
    orderedThatDay: summary.orderToday ? 'Yes' : 'No',
    truckLine: summary.truckLine || NO_VALUE,
    outcomeLabel: outcomeChipLabel(summary.outcome),
    outcomeIntent: outcomeChipIntent(summary.outcome),
    backfilledLabel: summary.backfilled ? 'Made later — never sent' : null,
  };
}
