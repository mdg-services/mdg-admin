import type { MessageReport, ReportData, ReportKind, ReportStatus } from '@dk/shared';
import { reportDataOf } from '@dk/shared';

/**
 * The team's plain-English reading of a report's snapshot (ADR 0056).
 *
 * From 24 Nov 2026 a report message carries no picture: the dealer's app draws the
 * report on Today from `report.data`. The inbox thread has no such screen, so this
 * turns the same snapshot into a short summary the team can read at a glance: the
 * kind, the verdict, the day and the key figures. It is for the team only, in
 * English, and it never changes what the dealer sees.
 *
 * Every figure is read defensively: a snapshot is trusted typed code on the way in,
 * but a held or old message may be missing a field, and a thread must never crash
 * on one bubble.
 */

/** One line of the summary: a label and its value. */
export interface ReportFact {
  label: string;
  value: string;
}

export interface ReportSummary {
  kind: ReportKind;
  /** "Daily sales", "Credit & DOD": reads as "<name> report". */
  name: string;
  status: ReportStatus;
  /** The verdict in a word, never colour alone: "Fine", "Needs a look", "For information". */
  statusWord: string;
  /** The day the report is about, "23 Nov 2026", when the snapshot (or the tag) has one. */
  day?: string;
  /** The one-line answer the report gives, when it gives one. */
  headline?: string;
  facts: ReportFact[];
}

/** Short names that read right in "Dealer sees: <name> report on Today". */
export const REPORT_KIND_SHORT_NAME: Record<ReportKind, string> = {
  dsr_sales: 'Daily sales',
  dsr_variation: 'Stock variation',
  credit_dod: 'Credit & DOD',
  water_ingress: 'Water checks',
  ro_supply: 'Supply status',
  stock_check: 'Stock check',
  load_plan: 'Tanker plan',
  tanker_density: 'Tanker density',
  tt_ack: 'Tanker receipt',
  fuel_order: 'Fuel order',
  declaration_filed: 'Declaration filed',
  du_otp: 'DU OTP',
  mock_drill: 'Mock drill',
  kavach: 'Kavach',
  ledger_watch: 'Ledger watch',
  announcement: 'Announcement',
  electrical_audit: 'Electrical audit',
  calibration_claim: 'Calibration claim',
  paper_expiry: 'Papers running out',
};

const STATUS_WORD: Record<ReportStatus, string> = {
  ok: 'Fine',
  attention: 'Needs a look',
  info: 'For information',
};

// ─── small formatters (all deterministic: no locale, no local time zone) ───

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Indian digit grouping: 1234567 → "12,34,567". */
function group(n: number, decimals = 0): string {
  const fixed = Math.abs(n).toFixed(decimals);
  const [whole = '0', frac] = fixed.split('.');
  const head = whole.slice(0, -3);
  const tail = whole.slice(-3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}` : tail;
  const sign = n < 0 && Number(fixed) !== 0 ? '-' : '';
  return `${sign}${grouped}${frac ? `.${frac}` : ''}`;
}

/** "12,345 L" (litres are whole numbers on every report). */
export function fmtLitres(n: unknown): string {
  return isNum(n) ? `${group(Math.round(n))} L` : '—';
}

/** "+120 L" / "-480 L". */
function fmtSignedLitres(n: unknown): string {
  if (!isNum(n)) return '—';
  const r = Math.round(n);
  return `${r > 0 ? '+' : ''}${group(r)} L`;
}

/** "₹1,23,456" or "₹1,234.50" when there are paise. */
export function fmtRupees(n: unknown): string {
  if (!isNum(n)) return '—';
  const hasPaise = Math.abs(n - Math.round(n)) >= 0.005;
  return `₹${group(n, hasPaise ? 2 : 0)}`;
}

function fmtKl(n: unknown): string {
  return isNum(n) ? `${group(n, Number.isInteger(n) ? 0 : 1)} KL` : '—';
}

/** `2026-11-23` → "23 Nov 2026". Anything else comes back as it was. */
export function fmtDay(iso: unknown): string {
  if (typeof iso !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** An instant as IST wall clock: "24 Nov, 7:05 pm". */
export function fmtInstant(iso: unknown): string {
  if (typeof iso !== 'string') return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const ist = new Date(t + 5.5 * 3600_000);
  const h24 = ist.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}, ${h12}:${mm} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** The IST day of an instant, as `YYYY-MM-DD`. */
function istDay(iso: unknown): string | undefined {
  if (typeof iso !== 'string') return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return new Date(t + 5.5 * 3600_000).toISOString().slice(0, 10);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function daysWord(days: unknown): string {
  if (!isNum(days)) return '—';
  const d = Math.round(days * 10) / 10;
  if (d < 0) return `lapsed ${plural(Math.abs(Math.round(d)), 'day')} ago`;
  if (d === 0) return 'today';
  return `${plural(d, 'day')} left`;
}

const fact = (label: string, value: string | number | null | undefined): ReportFact | null => {
  if (value === null || value === undefined || value === '') return null;
  return { label, value: String(value) };
};

function compact(list: Array<ReportFact | null>): ReportFact[] {
  return list.filter((f): f is ReportFact => f !== null);
}

const SEVERITY_WORD = { INFO: 'Information', NOTICE: 'Worth a look', ALERT: 'Alert' } as const;

const FUEL_ORDER_EVENT_WORD: Record<string, string> = {
  placed: 'Order placed',
  refused: 'Order refused',
  unclear: 'Result unclear',
  not_placed: 'Order not placed',
  tanker_assigned: 'Tanker assigned',
  cancelled: 'Order cancelled',
  not_executed_reason: 'Not executed',
  no_tanker_by_afternoon: 'No tanker by afternoon',
  lapsed_not_executed: 'Lapsed, not executed',
  closed_on_portal: 'Closed on the portal',
  tanker_changed: 'Tanker changed',
  tanker_details_added: 'Tanker details added',
  possible_duplicate: 'Possible duplicate',
  delayed: 'Order delayed',
  check_result: 'Order check',
  tracking_stopped: 'Tracking stopped',
};

const FUEL_ORDER_STAGE_WORD: Record<string, string> = {
  being_placed: 'being placed',
  waiting: 'waiting for a tanker',
  tanker_assigned: 'tanker assigned',
  invoiced: 'invoiced',
  closed: 'closed',
  refused: 'refused',
  cancelled: 'cancelled',
  never_sent: 'never sent',
};

const ELECTRICAL_OUTCOME_WORD: Record<string, string> = {
  submitted: 'Submitted',
  nothing_open: 'Nothing open to file',
  partly: 'Partly filed',
  failed: 'Could not file',
  login_rejected: 'Portal login refused',
};

const MOCK_DRILL_PORTAL_WORD: Record<string, string> = {
  pending_approval: 'Waiting for approval',
  returned: 'Returned by the portal',
  none: 'Nothing pending',
  unknown: 'Not known',
};

// ─── one reader per kind ───

type Body = Pick<ReportSummary, 'headline' | 'facts'> & { day?: string };

function dsrSales(d: Extract<ReportData, { kind: 'dsr_sales' }>): Body {
  const products = d.products ?? [];
  const closed = products.filter((p) => p.sales?.state === 'closed' && isNum(p.sales.soldL));
  const total = closed.reduce((sum, p) => sum + (p.sales.soldL ?? 0), 0);
  return {
    day: d.businessDate,
    headline: closed.length > 0 ? `Sold ${fmtLitres(total)} across ${plural(closed.length, 'fuel')}` : 'Sales not worked out yet',
    facts: compact([
      ...products.map((p) =>
        fact(
          p.key,
          p.sales?.state === 'pending'
            ? 'not worked out yet'
            : `sold ${fmtLitres(p.sales?.soldL)} · month ${fmtLitres(p.sales?.monthToDateL)}`,
        ),
      ),
      fact('Shift time', d.shiftTime),
      d.revised ? fact('Note', 'Re-sent after a change') : null,
    ]),
  };
}

const VARIATION_TONE_WORD = { ok: 'within limit', low: 'short, outside limit', high: 'over, outside limit' } as const;

function dsrVariation(d: Extract<ReportData, { kind: 'dsr_variation' }>): Body {
  const products = d.products ?? [];
  const off = products.filter((p) => p.variation && p.variation.tone !== 'ok');
  return {
    day: d.businessDate,
    headline: d.beforeInspection
      ? 'Before the first inspection: figures for information'
      : off.length > 0
        ? `Outside the limit: ${off.map((p) => `${p.key} ${p.variation.tone === 'low' ? 'short' : 'over'}`).join(', ')}`
        : 'All fuels within the limit',
    facts: compact([
      ...products.map((p) =>
        fact(
          p.key,
          `${fmtSignedLitres(p.variation?.variationL)} (limit ±${fmtLitres(p.variation?.permissibleL)}), ${
            VARIATION_TONE_WORD[p.variation?.tone] ?? ''
          }`,
        ),
      ),
      (d.sheets ?? []).includes('sales') ? fact('Also carries', 'the sales sheet') : null,
      d.revised ? fact('Note', 'Re-sent after a change') : null,
    ]),
  };
}

function stockCheck(d: Extract<ReportData, { kind: 'stock_check' }>): Body {
  const fuels = d.fuels ?? [];
  return {
    day: istDay(d.readingAt ?? d.capturedAt),
    headline: d.stale ? 'Old reading: the gauge has not been read recently' : undefined,
    facts: compact([
      ...fuels.map((f) =>
        fact(
          f.fuelKey,
          `${fmtLitres(f.totalL)} in ${plural(f.tanksRead ?? 0, 'tank')}${
            f.tanksNoReading ? `, ${f.tanksNoReading} with no reading` : ''
          }`,
        ),
      ),
      fact('Read at', d.readingAt ? fmtInstant(d.readingAt) : 'no reading'),
      d.cover?.fuels?.length
        ? fact(
            'Cover',
            d.cover.fuels.map((f) => `${f.fuelKey} ${isNum(f.daysLeft) ? `${f.daysLeft} days` : '—'}`).join(' · '),
          )
        : null,
    ]),
  };
}

const LOAD_VERDICT: Record<string, (d: Extract<ReportData, { kind: 'load_plan' }>) => string> = {
  ORDER_NOW_RUNNING_OUT: () => 'Order now: a tank is running out',
  ORDER_NOW_DEPOT_CLOSED: () => 'Order now: the depot closes soon',
  ORDER_TODAY: () => 'Order today',
  NEXT_ORDER: (d) => `Next order on ${fmtDay(d.verdict.nextOrderOn)}`,
  NONE_IN_WINDOW: (d) => `No order needed in the next ${d.verdict.horizonDays ?? 4} days`,
};

function loadPlan(d: Extract<ReportData, { kind: 'load_plan' }>): Body {
  const verdict = d.verdict;
  const pools = d.pools ?? [];
  const lowest = pools
    .filter((p) => isNum(p.daysLeft))
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];
  return {
    day: d.planDay,
    headline: verdict ? (LOAD_VERDICT[verdict.code]?.(d) ?? undefined) : undefined,
    facts: compact([
      verdict?.tankers ? fact('Tankers', `${verdict.tankers} (${(verdict.products ?? []).join(', ')})`) : null,
      d.order ? fact('Arrives', `${fmtDay(d.order.arriveDate ?? d.order.arriveOn)}${d.order.arriveTime ? ` at ${d.order.arriveTime}` : ''}`) : null,
      lowest ? fact('Lowest cover', `${lowest.product} ${lowest.daysLeft} days (${fmtLitres(lowest.stockL)})`) : null,
      (d.inTransit ?? []).length > 0 ? fact('On the way', plural(d.inTransit.length, 'load')) : null,
      (d.depotClosed ?? []).length > 0 ? fact('Depot closed', d.depotClosed.map(fmtDay).join(', ')) : null,
      d.credit && isNum(d.credit.availableRs) ? fact('Credit available', fmtRupees(d.credit.availableRs)) : null,
    ]),
  };
}

function tankerDensity(d: Extract<ReportData, { kind: 'tanker_density' }>): Body {
  return {
    day: d.invoiceDate,
    facts: compact([
      fact('Tanker', d.vehicleNo),
      fact('Invoice', d.invoiceNo),
      ...(d.lines ?? []).map((l) => fact(l.productKey, `density ${l.density15Raw}`)),
      d.droppedLines ? fact('Not shown', plural(d.droppedLines, 'more line')) : null,
    ]),
  };
}

function ttAck(d: Extract<ReportData, { kind: 'tt_ack' }>): Body {
  const SHORT_WORD = { none: 'no shortage', short: 'shortage', unknown: 'shortage not known' } as const;
  return {
    day: istDay(d.ackedAt),
    headline: d.anyShort ? 'A shortage was recorded' : 'Received with no shortage',
    facts: compact([
      fact('Tanker', d.vehicleNo),
      fact('Acknowledged', fmtInstant(d.ackedAt)),
      ...(d.rows ?? []).map((r) =>
        fact(
          `Invoice ${r.invoiceNo}`,
          r.short === 'short' && isNum(r.totalShortL) ? `short ${fmtLitres(r.totalShortL)}` : SHORT_WORD[r.short],
        ),
      ),
    ]),
  };
}

function fuelOrder(d: Extract<ReportData, { kind: 'fuel_order' }>): Body {
  return {
    day: d.deliveryDay ?? istDay(d.asOf),
    headline: FUEL_ORDER_EVENT_WORD[d.event] ?? d.event,
    facts: compact([
      fact('Stage', FUEL_ORDER_STAGE_WORD[d.stage] ?? d.stage),
      fact('Order no', d.orderNo),
      (d.lines ?? []).length > 0
        ? fact('Fuel', d.lines.map((l) => `${l.product ?? l.material} ${fmtKl(l.kl)}`).join(' · '))
        : null,
      fact('Tanker', d.ttNo),
      fact('Delivery', d.deliveryDay ? fmtDay(d.deliveryDay) : null),
      fact('Portal says', d.portalReason ?? d.portalStatus),
      isNum(d.shortByRs) ? fact('Short by', fmtRupees(d.shortByRs)) : null,
    ]),
  };
}

const CREDIT_HEADLINE: Record<string, (d: Extract<ReportData, { kind: 'credit_dod' }>) => string> = {
  overdue: (d) => `Overdue ${fmtRupees(d.money.amount)}`,
  overdue_lag: (d) => `Overdue ${fmtRupees(d.money.amount)}, payment may still be on its way`,
  due_today: (d) => `Due today ${fmtRupees(d.money.amount)}`,
  due_soon: (d) => `Due ${fmtDay(d.money.date)} ${fmtRupees(d.money.amount)}`,
  due: (d) => `Due ${fmtDay(d.money.date)} ${fmtRupees(d.money.amount)}`,
  advance: (d) => `Advance ${fmtRupees(d.money.amount)}`,
  settled: () => 'No dues',
};

function creditDod(d: Extract<ReportData, { kind: 'credit_dod' }>): Body {
  return {
    day: d.asOf,
    headline: d.money ? CREDIT_HEADLINE[d.verdict]?.(d) : undefined,
    facts: compact([
      d.limit ? fact('Limit available', `${fmtRupees(d.limit.available)} of ${fmtRupees(d.limit.current)}`) : null,
      d.limit && isNum(d.limit.usedPct) ? fact('Limit used', `${Math.round(d.limit.usedPct)}%`) : null,
      d.limit?.form ? fact('Form', d.limit.form) : null,
      d.review ? fact('Review', `${fmtDay(d.review.on)}${d.review.lapsed ? ' (lapsed)' : ''}`) : null,
      d.backdated ? fact('Note', 'Back-dated card, does not replace today’s') : null,
    ]),
  };
}

function ledgerWatch(d: Extract<ReportData, { kind: 'ledger_watch' }>): Body {
  const first = (d.movements ?? [])[0];
  return {
    day: istDay(d.generatedAt),
    headline: `${plural(d.totalMovements ?? 0, 'entry', 'entries')} on the account`,
    facts: compact([
      fact('Charged', fmtRupees(d.charged)),
      fact('Received', fmtRupees(d.received)),
      fact('Most serious', SEVERITY_WORD[d.topSeverity] ?? d.topSeverity),
      d.window ? fact('Window', `${fmtDay(d.window.from)} to ${fmtDay(d.window.to)}`) : null,
      first ? fact('Latest', `${fmtDay(first.date)}: ${first.title?.en ?? ''} ${fmtRupees(first.amount)}`.trim()) : null,
    ]),
  };
}

function calibrationClaim(d: Extract<ReportData, { kind: 'calibration_claim' }>): Body {
  return {
    day: istDay(d.filedAt),
    headline: `Claim of ${fmtRupees(d.totalAmount)} filed`,
    facts: compact([
      fact('Financial year', d.financialYear),
      fact('Nozzles', `${d.nozzlesIncluded} of ${d.nozzleCount} included`),
      fact('Per nozzle', fmtRupees(d.amountPerNozzle)),
      fact('Reference', d.reference),
    ]),
  };
}

function waterIngress(d: Extract<ReportData, { kind: 'water_ingress' }>): Body {
  return {
    day: d.businessDate,
    headline: `${d.recordedSlots} of ${d.totalSlots} checks recorded (${Math.round(d.compliancePercent ?? 0)}%)`,
    facts: compact([
      fact('Missed', d.missedSlots),
      fact('Still open', d.openSlots),
      fact('Day', d.dayState === 'running' ? 'still running' : 'finished'),
      d.lastCheckFailed ? fact('Note', 'The last portal check failed') : null,
    ]),
  };
}

function roSupply(d: Extract<ReportData, { kind: 'ro_supply' }>): Body {
  return {
    day: istDay(d.capturedAt),
    headline:
      d.blocked === true ? 'Fuel lifting is stopped' : d.blocked === false ? 'Nothing is holding fuel lifting' : 'Supply status not known',
    facts: compact([
      d.failingCount ? fact('Failing', d.failingCount) : null,
      d.unknownCount ? fact('Not known', d.unknownCount) : null,
      fact('Portal read', d.read === 'ok' ? 'complete' : d.read === 'partial' ? 'partly read' : 'unclear'),
      d.lastGoodIsOld ? fact('Note', 'A later read failed: this is the last good one') : null,
    ]),
  };
}

function duOtp(d: Extract<ReportData, { kind: 'du_otp' }>): Body {
  const first = (d.events ?? [])[0];
  return {
    day: istDay(d.submittedAt ?? d.readAt),
    headline: d.phase === 'submitted' ? 'OTP submitted' : 'Waiting for the OTP',
    facts: compact([
      fact('Events', `${(d.events ?? []).length}${d.moreCount ? ` (+${d.moreCount} more)` : ''}`),
      first ? fact('First', `${first.duMake} ${first.duModel}, nozzle ${first.nozzleNo}`.trim()) : null,
      d.phase === 'pending' && typeof d.supplyBlocked === 'boolean'
        ? fact('Fuel lifting', d.supplyBlocked ? 'stopped' : 'not stopped')
        : null,
    ]),
  };
}

function declarationFiled(d: Extract<ReportData, { kind: 'declaration_filed' }>): Body {
  const HOW = { submitted: 'filed by MDG', settled: 'settled', already_on_portal: 'already on the portal' } as const;
  return {
    day: d.day,
    headline: `${d.declaration === 'safety' ? 'Safety declaration (daily)' : 'Washroom declaration (weekly)'} ${HOW[d.how] ?? ''}`.trim(),
    facts: compact([
      d.late ? fact('Note', 'Filed late') : null,
      isNum(d.streak) ? fact('Days in a row', d.streak) : null,
      d.nextDueDay ? fact('Next due', fmtDay(d.nextDueDay)) : null,
      d.photos?.length ? fact('Photos', d.photos.length) : null,
    ]),
  };
}

function mockDrill(d: Extract<ReportData, { kind: 'mock_drill' }>): Body {
  return {
    day: d.drillDay ?? istDay(d.filedAt ?? d.receivedAt),
    headline: d.stage === 'filed' ? 'Drill filed on the portal' : 'Drill received, not filed yet',
    facts: compact([
      fact('Scenario', d.scenario?.label ?? d.scenario?.family),
      d.startTime ? fact('Started', d.startTime) : null,
      isNum(d.durationMinutes) ? fact('Took', `${d.durationMinutes} min`) : null,
      fact('Level', d.level),
      isNum(d.personsPresent) ? fact('Persons', d.personsPresent) : null,
      fact('Portal', MOCK_DRILL_PORTAL_WORD[d.portalState] ?? d.portalState),
    ]),
  };
}

function electricalAudit(d: Extract<ReportData, { kind: 'electrical_audit' }>): Body {
  return {
    day: istDay(d.filedAt),
    headline: ELECTRICAL_OUTCOME_WORD[d.outcome] ?? d.outcome,
    facts: compact([
      fact('Audits', (d.audits ?? []).length),
      fact('Points', d.pointsTotal),
    ]),
  };
}

function paperExpiry(d: Extract<ReportData, { kind: 'paper_expiry' }>): Body {
  const items = d.items ?? [];
  const first = items[0];
  return {
    day: d.sentOn,
    headline: d.allLapsed ? 'Every paper has lapsed' : `${plural(items.length + (d.moreCount ?? 0), 'paper')} running out`,
    facts: compact([
      fact('For', d.scope === 'tanker' ? 'tankers' : 'the outlet'),
      first
        ? fact('Most urgent', `${first.vehicleReg ? `${first.vehicleReg} ` : ''}${first.docLabel || first.docType}, ${daysWord(first.daysLeft)}`)
        : null,
      d.moreCount ? fact('Not listed', `${d.moreCount} more`) : null,
    ]),
  };
}

function kavach(d: Extract<ReportData, { kind: 'kavach' }>): Body {
  const showScore = d.scored && d.scorePublishable && isNum(d.pct);
  return {
    day: d.businessDate,
    headline: showScore ? `Score ${Math.round(d.pct as number)}%` : 'Score not shown yet',
    facts: compact([
      showScore ? fact('Points', `${d.validPoints} of ${d.totalPoints}`) : null,
      fact('Waiting on the dealer', (d.asks ?? []).length),
      fact('Waiting on MDG', (d.pending ?? []).length + (d.pendingOverflow ?? 0)),
      d.unverifiedCount ? fact('Not yet verified', d.unverifiedCount) : null,
    ]),
  };
}

function announcement(d: Extract<ReportData, { kind: 'announcement' }>): Body {
  const TONE = { new: 'New', notice: 'Notice', important: 'Important' } as const;
  return {
    day: istDay(d.sentAt),
    facts: compact([
      fact('Tone', TONE[d.tone] ?? d.tone),
      fact('Dealer taps "Got it"', d.ackable ? 'yes' : 'no'),
      d.videoId ? fact('Guide video', 'attached') : null,
    ]),
  };
}

function read(data: ReportData): Body {
  switch (data.kind) {
    case 'dsr_sales':
      return dsrSales(data);
    case 'dsr_variation':
      return dsrVariation(data);
    case 'stock_check':
      return stockCheck(data);
    case 'load_plan':
      return loadPlan(data);
    case 'tanker_density':
      return tankerDensity(data);
    case 'tt_ack':
      return ttAck(data);
    case 'fuel_order':
      return fuelOrder(data);
    case 'credit_dod':
      return creditDod(data);
    case 'ledger_watch':
      return ledgerWatch(data);
    case 'calibration_claim':
      return calibrationClaim(data);
    case 'water_ingress':
      return waterIngress(data);
    case 'ro_supply':
      return roSupply(data);
    case 'du_otp':
      return duOtp(data);
    case 'declaration_filed':
      return declarationFiled(data);
    case 'mock_drill':
      return mockDrill(data);
    case 'electrical_audit':
      return electricalAudit(data);
    case 'paper_expiry':
      return paperExpiry(data);
    case 'kavach':
      return kavach(data);
    case 'announcement':
      return announcement(data);
  }
}

/**
 * The summary of a report message, or null when it carries no usable snapshot: an
 * old message (it keeps its picture), a snapshot of a version this app does not
 * know, or one whose kind differs from its tag. The thread then draws the message
 * exactly as before.
 */
export function summarizeReport(report: MessageReport | null | undefined): ReportSummary | null {
  if (!report) return null;
  const data = reportDataOf(report.data, report.kind);
  if (!data) return null;
  let body: Body;
  try {
    body = read(data);
  } catch {
    // A malformed snapshot must never take the thread down: say what we know.
    body = { facts: [] };
  }
  const day = body.day ?? report.day;
  return {
    kind: report.kind,
    name: REPORT_KIND_SHORT_NAME[report.kind],
    status: report.status,
    statusWord: STATUS_WORD[report.status],
    ...(day ? { day: fmtDay(day) } : {}),
    ...(body.headline ? { headline: body.headline } : {}),
    facts: body.facts,
  };
}
