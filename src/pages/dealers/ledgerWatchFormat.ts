/**
 * Ledger Watch, in words and in order — every decision the two screens make
 * that can be got right or wrong on its own.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------
 * `mdg-admin` has no test runner. Not "an unused one", not "one nobody runs" —
 * there is no `test` script in its `package.json`, so nothing here can be
 * asserted by a machine. The only defence left is that the decidable parts are
 * small, pure and readable side by side: which class a chip names, which
 * finding sorts above which, whether the four figures at the top of the pane
 * actually add up. Every one of those lives in this file as a function over
 * plain data, so a reviewer can check them by reading rather than by clicking
 * through a dealer's month. The components import from here and hold no rules
 * of their own.
 *
 * THE RULE THIS FILE IS MOST CAREFUL ABOUT
 * ----------------------------------------
 * A screen must never state a figure that the calculation behind it reads
 * differently. That has been the recurring fault in this product, so
 * {@link summaryFigures} does not simply print `netOther`: it re-derives
 * `received − charged` and compares the two with the contract's own 0.05
 * epsilon. When they disagree, the pane says so instead of printing a headline
 * it cannot back — see {@link SummaryFigures.netAgrees}.
 *
 * DATES ARE `dd-mm-yyyy` STRINGS AND MUST NEVER BE SORTED AS STRINGS
 * -----------------------------------------------------------------
 * `01-09-2026` sorts before `02-04-2026` because the day comes first, so a
 * lexicographic "newest first" quietly orders an inbox by day of month. Every
 * comparison here goes through {@link dmyToNum}, which turns the string into a
 * `yyyymmdd` integer first. The backend hit the same trap and stores a derived
 * `dateNum` for its index; this is the browser's half of the same fix.
 */
import type { Intent } from '@/lib/statusIntent';
import {
  isRoutineClass,
  LEDGER_MONEY_EPSILON,
  MOVEMENT_CLASSES,
  sameMoney,
  type LedgerFlagDto,
  type LedgerFlagKind,
  type LedgerFlagSeverity,
  type LedgerFlagStatus,
  type LedgerPeriodSummaryDto,
  type MovementClass,
} from '@dk/shared';

/* ─────────────────────────────── Vocabulary ─────────────────────────────── */

/**
 * What each class is CALLED on an admin screen.
 *
 * Deliberately not the enum with its underscores swapped for spaces. "Fee" on
 * its own tells an admin nothing about whether the dealer paid it or was paid
 * it, and `CARD_SETTLEMENT` reads as jargon; the wording below is the sentence
 * a dealer would use on the phone. Kept short enough to sit in a 22px pill
 * beside a rupee figure on a 360px screen.
 *
 * Note `FEE` and `REVERSAL` in particular: the portal's own noun for the K0
 * charge is "INCENTIVE" and the money comes off the dealer, so the label here
 * says charge. Copying the portal's word onto a debit is the trap the contract
 * calls out, and the label is where a reader would meet it.
 */
export const MOVEMENT_CLASS_LABEL: Record<MovementClass, string> = {
  FUEL_PURCHASE: 'Fuel purchase',
  DEALER_DEPOSIT: 'Deposit',
  CARD_SETTLEMENT: 'Card settlement',
  COMMISSION: 'Commission',
  INTEREST: 'Interest',
  FEE: 'Fee',
  RECOVERY: 'Recovery',
  REVERSAL: 'Reversal',
  UNCLASSIFIED: 'Unnamed',
};

/**
 * The colour a class chip carries.
 *
 * Three deliberate choices:
 *  - The PAIR is `neutral`. It is 97% of the rows and it is the ledger working
 *    normally; a colour on it would drown the 3% this product exists to show.
 *  - Money coming BACK to the dealer (commission, card settlement) is
 *    `success`; money taken OFF them (interest, fee, recovery) is `warning`.
 *    Direction is the first thing an admin needs from a glance.
 *  - `REVERSAL` and `UNCLASSIFIED` are `danger`. Both mean the ledger is doing
 *    something it has not done before — a class on a side it never uses, or a
 *    line nobody can name — and both are `ALERT` findings on the detector side.
 *    A chip that agreed with the detector everywhere except here would be
 *    telling an admin two different things about one row.
 */
export function movementClassIntent(movementClass: MovementClass): Intent {
  switch (movementClass) {
    case 'FUEL_PURCHASE':
    case 'DEALER_DEPOSIT':
      return 'neutral';
    case 'CARD_SETTLEMENT':
    case 'COMMISSION':
      return 'success';
    case 'INTEREST':
    case 'FEE':
    case 'RECOVERY':
      return 'warning';
    case 'REVERSAL':
    case 'UNCLASSIFIED':
      return 'danger';
  }
}

/** What each finding is called in the inbox's Kind column and its filter. */
export const FLAG_KIND_LABEL: Record<LedgerFlagKind, string> = {
  OTHER_MOVEMENT: 'Other movement',
  UNKNOWN_ENTRY: 'Unnamed entry',
  WRONG_SIDE: 'Wrong side',
  AMOUNT_OUTLIER: 'Unusual amount',
  PEER_OUTLIER: 'Unusual vs other dealers',
  DUPLICATE: 'Posted twice',
  MISSING_RECURRING: 'Did not arrive',
  RECONCILE_BREAK: 'Balance does not match',
};

export const FLAG_SEVERITY_LABEL: Record<LedgerFlagSeverity, string> = {
  ALERT: 'Alert',
  NOTICE: 'Notice',
  INFO: 'Info',
};

export const FLAG_STATUS_LABEL: Record<LedgerFlagStatus, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Resolved',
  IGNORED: 'Ignored',
};

export function flagSeverityIntent(severity: LedgerFlagSeverity): Intent {
  if (severity === 'ALERT') return 'danger';
  if (severity === 'NOTICE') return 'warning';
  return 'info';
}

/**
 * The colour of a flag's status pill.
 *
 * `IGNORED` is `neutral` and not `success`: somebody decided this finding does
 * not matter, which is not the same as the finding having been dealt with, and
 * a green pill on a dismissed alert would read as the latter.
 */
export function flagStatusIntent(status: LedgerFlagStatus): Intent {
  switch (status) {
    case 'OPEN':
      return 'warning';
    case 'ACKNOWLEDGED':
      return 'info';
    case 'RESOLVED':
      return 'success';
    case 'IGNORED':
      return 'neutral';
  }
}

/* ──────────────────────────── Dates and ordering ────────────────────────── */

/**
 * A `dd-mm-yyyy` business date as a sortable `yyyymmdd` integer.
 *
 * Returns 0 for anything that is not a real-looking date, which sorts such a
 * row to the bottom of a newest-first list rather than to the top — an
 * unparseable date is a data fault, and a data fault that jumps the queue would
 * push real findings off the first screen.
 */
export function dmyToNum(dmy: string | null | undefined): number {
  if (!dmy) return 0;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy.trim());
  if (!m) return 0;
  return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
}

/**
 * A `yyyy-mm` month as `Aug 2026`.
 *
 * Built by hand from a fixed month table rather than through `Intl`: the input
 * is a month, not an instant, and every route from `yyyy-mm` to a `Date` picks
 * a day and a timezone on the reader's behalf — which is how a month heading
 * ends up one month out for anyone west of Greenwich.
 */
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function monthLabel(month: string | null | undefined): string {
  if (!month) return '—';
  const m = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!m) return month;
  const name = MONTH_NAMES[Number(m[2]) - 1];
  return name ? `${name} ${m[1]}` : month;
}

/**
 * The `yyyy-mm` months an admin can pick, newest first, ending at `anchorMonth`.
 *
 * `anchorMonth` is passed in — never read from the clock in here — because the
 * business month is IST and this file must stay pure. The caller derives it
 * from `istTodayYmd()`, which is the same IST rule the backend applies.
 */
export function recentMonths(anchorMonth: string, count = 6): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(anchorMonth.trim());
  if (!m) return [anchorMonth];
  let year = Number(m[1]);
  let month = Number(m[2]);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return out;
}

/** ALERT first, then NOTICE, then INFO. Higher sorts earlier. */
const SEVERITY_RANK: Record<LedgerFlagSeverity, number> = {
  ALERT: 3,
  NOTICE: 2,
  INFO: 1,
};

/**
 * The order the inbox is read in: worst first, then newest.
 *
 * Severity leads because the three ALERT kinds mean the ledger itself is saying
 * something impossible — an unnameable line, a class on a side it never uses,
 * a balance that will not reconcile — and one of those outranks any number of
 * ordinary ₹1,062 fees no matter how fresh they are. Within one severity the
 * newest row leads, by the row's own business date, then by when detection
 * first raised it so two findings dated the same day still have a stable order.
 *
 * Stable to the last tiebreak on `id`, because an unstable comparator makes a
 * list re-order itself on every re-render — which on a phone reads as the page
 * fighting the thumb.
 */
export function compareFlags(a: LedgerFlagDto, b: LedgerFlagDto): number {
  return (
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
    dmyToNum(b.date) - dmyToNum(a.date) ||
    (b.firstSeenAt < a.firstSeenAt ? -1 : b.firstSeenAt > a.firstSeenAt ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** The same order, as a new array. The components never sort in place. */
export function sortFlags(flags: readonly LedgerFlagDto[]): LedgerFlagDto[] {
  return [...flags].sort(compareFlags);
}

/* ──────────────────────────── The month summary ─────────────────────────── */

/** One of the figures the pane prints across the top of a dealer's month. */
export interface SummaryFigure {
  key: 'fuelPurchased' | 'deposited' | 'cardSettled' | 'charged' | 'received';
  label: string;
  /** Rupees. Always positive — the direction is in the label, not in the sign. */
  value: number;
  /** The one line under the figure that says what it does and does not cover. */
  hint: string;
}

export interface SummaryFigures {
  /**
   * FIVE tiles, in reading order: the three ROUTINE figures a pump's ledger
   * carries every month — fuel bought, money paid in, card sales settled — then
   * the two this feature is actually about, charged and paid.
   *
   * The settlement sits with the routine three because that is what it is: the
   * dealer's own card sales paid through, not IndianOil doing anything to the
   * account. It was briefly folded into "paid to the dealer", where on outlet 5E
   * in August 2026 it made a ₹30,000 commission read as ₹1,22,92,358.61.
   */
  figures: SummaryFigure[];
  /**
   * Fleet-card settlements for the month — the dealer's own card sales routed
   * back through IndianOil. Zero on an outlet that takes no fleet card, in which
   * case both screens omit the line rather than print ₹0.00.
   */
  cardSettled: number;
  /** `received − charged`, computed here from the two figures above it. */
  net: number;
  /**
   * Did the server's own `netOther` agree with `received − charged`?
   *
   * Compared with the contract's 0.05 epsilon, never `===`: these are floats
   * parsed out of a portal's HTML and summed, so two figures that print
   * identically are routinely not equal. When this is false the pane must say
   * the two disagree rather than pick one — a headline the calculation behind
   * it does not support is the exact fault this product was built to catch, and
   * printing it here would be the product committing it.
   */
  netAgrees: boolean;
  /** What the server sent, kept so the pane can show both sides of a mismatch. */
  reportedNet: number;
}

/**
 * The four figures, the net, and the check that they agree.
 *
 * WHY `charged` LOOKS SO SMALL NEXT TO `fuelPurchased`, said in the hints:
 * `fuelPurchased` and `deposited` are the pair and stand alone; `charged` and
 * `received` count only the rows that are NOT the pair. A month with ₹1.2 crore
 * of fuel invoices reports a few thousand rupees charged, and that is correct.
 * Every admin meeting this screen for the first time reads it as a missing
 * figure, so the hint under each tile answers it before they ask.
 */
export function summaryFigures(summary: LedgerPeriodSummaryDto): SummaryFigures {
  // NO SUBTRACTION HERE ANY MORE. `received` used to carry fleet-card
  // settlements and this function took them out; the contract now treats a
  // settlement as ROUTINE traffic — like fuel bought and money paid in — so the
  // server excludes it from both `charged` and `received` before either reaches
  // a screen. The arithmetic lives in one place again.
  const net = summary.received - summary.charged;
  return {
    figures: [
      {
        key: 'fuelPurchased',
        label: 'Fuel bought',
        value: summary.fuelPurchased,
        hint: 'Product supply invoices only',
      },
      {
        key: 'deposited',
        label: 'Deposited',
        value: summary.deposited,
        hint: "The dealer's own money paid in",
      },
      {
        key: 'cardSettled',
        label: 'Card sales settled',
        value: summary.cardSettled,
        hint: "The dealer's own fleet-card sales, routed back",
      },
      {
        key: 'charged',
        label: 'Charged to the dealer',
        value: summary.charged,
        hint: 'Fees, interest, recoveries — not fuel',
      },
      {
        key: 'received',
        label: 'Paid to the dealer',
        value: summary.received,
        hint: 'Commission and rebates — not card sales',
      },
    ],
    cardSettled: summary.cardSettled,
    net,
    netAgrees: sameMoney(net, summary.netOther, LEDGER_MONEY_EPSILON),
    reportedNet: summary.netOther,
  };
}

/**
 * The sentence under the net figure. Positive means the month gave money back.
 *
 * Zero is its own case and not folded into either side: "took ₹0.00 off this
 * dealer" is a sentence about a month in which nothing happened, and it reads
 * as a failure to load.
 */
export function netOtherSentence(net: number): string {
  if (sameMoney(net, 0)) {
    return 'Outside buying fuel and paying for it, this month was flat.';
  }
  return net > 0
    ? 'Outside buying fuel and paying for it, this month put money back.'
    : 'Outside buying fuel and paying for it, this month took money off the dealer.';
}

export function netOtherIntent(net: number): Intent {
  if (sameMoney(net, 0)) return 'neutral';
  return net > 0 ? 'success' : 'warning';
}

/**
 * The class breakdown in a fixed order, whatever order the server sent.
 *
 * `MOVEMENT_CLASSES` is the contract's own order, so a pane shows the same
 * classes in the same places every month — a reader who learns that interest
 * sits third does not have to re-find it in November. Within a class, money
 * charged is listed before money received, because `REVERSAL` really can carry
 * both directions in one month and the charge is the half worth reading first.
 *
 * The pair is filtered out defensively. The summary is documented as excluding
 * it, and a `byClass` that ever carried a fuel invoice would put ₹1.2 crore in
 * a list whose other rows are three-figure fees — the breakdown would become
 * unreadable rather than wrong, which is harder to notice.
 */
export function orderedClassTotals(
  summary: LedgerPeriodSummaryDto,
): LedgerPeriodSummaryDto['byClass'] {
  const rank = new Map<MovementClass, number>(
    MOVEMENT_CLASSES.map((c, i) => [c, i]),
  );
  return summary.byClass
    .filter((t) => !isRoutineClass(t.movementClass))
    .slice()
    .sort(
      (a, b) =>
        (rank.get(a.movementClass) ?? 99) - (rank.get(b.movementClass) ?? 99) ||
        (a.direction === b.direction ? 0 : a.direction === 'CHARGED' ? -1 : 1),
    );
}

/* ───────────────────────── The cross-dealer roll-up ─────────────────────── */

/**
 * One dealer's line above the inbox: how much is open, and how bad.
 *
 * NOT `LedgerWatchDealerRowDto`, and the difference is deliberate. That
 * contract type carries the month's `charged` / `received` / `netOther`, which
 * only the per-dealer summary endpoint can supply — the inbox reads flags, and
 * eleven summary calls to draw a header strip would cost more than the strip is
 * worth on a 908 MB box. So this is a strictly smaller, honestly named shape
 * built from the flags already on screen. If a roll-up endpoint ever lands,
 * this function goes and the DTO takes its place.
 *
 * It also covers only the flags LOADED so far, exactly as the work queue's
 * groups do. The page says so out loud whenever more pages remain, rather than
 * letting a partial count read as a complete one.
 */
export interface DealerFlagRollup {
  dealerId: string;
  /** The outlet code — a dealer IS its code, and it leads every row. */
  dealerCode: string;
  openFlags: number;
  alerts: number;
  notices: number;
  infos: number;
  /** Open `UNKNOWN_ENTRY` flags: the catalogue itself is missing a rule. */
  unknownEntries: number;
  /** The worst-then-newest flag for this dealer, by {@link compareFlags}. */
  leadFlag: LedgerFlagDto;
}

/**
 * Group the loaded flags by dealer, worst dealer first.
 *
 * Only OPEN flags are counted. An acknowledged flag is one somebody has already
 * taken on, and counting it would keep a dealer at the top of the list for work
 * that is already owned — the roll-up is a queue, not a history.
 */
export function rollupByDealer(
  flags: readonly LedgerFlagDto[],
): DealerFlagRollup[] {
  const byDealer = new Map<string, LedgerFlagDto[]>();
  for (const flag of flags) {
    const bucket = byDealer.get(flag.dealerId);
    if (bucket) bucket.push(flag);
    else byDealer.set(flag.dealerId, [flag]);
  }

  const rows: DealerFlagRollup[] = [];
  for (const [dealerId, dealerFlags] of byDealer) {
    const sorted = sortFlags(dealerFlags);
    const leadFlag = sorted[0];
    if (!leadFlag) continue;
    const open = sorted.filter((f) => f.status === 'OPEN');
    rows.push({
      dealerId,
      // A flag can be read back before the join that denormalises the code, so
      // the DTO makes it optional. An empty leading column would be a row an
      // admin cannot act on, so fall back to the id's tail — ugly, findable,
      // and never blank.
      dealerCode: leadFlag.dealerCode || `#${dealerId.slice(-6)}`,
      openFlags: open.length,
      alerts: open.filter((f) => f.severity === 'ALERT').length,
      notices: open.filter((f) => f.severity === 'NOTICE').length,
      infos: open.filter((f) => f.severity === 'INFO').length,
      unknownEntries: open.filter((f) => f.kind === 'UNKNOWN_ENTRY').length,
      leadFlag,
    });
  }

  return rows.sort(
    (a, b) =>
      b.alerts - a.alerts ||
      b.unknownEntries - a.unknownEntries ||
      b.openFlags - a.openFlags ||
      a.dealerCode.localeCompare(b.dealerCode),
  );
}

/* ───────────────────── The PAD ledger's class chip ──────────────────────── */

/**
 * One PAD ledger row, as much of it as the chip needs.
 *
 * A structural type rather than an import of `CreditDodLedgerRow`, so this
 * module stays a pure function of its arguments and the ledger table can hand
 * it whatever shape it holds.
 */
export interface ClassifiedLedgerRowLike {
  movementClass?: string | null;
}

/**
 * Is this string one of the nine classes?
 *
 * The field arrives as a plain `string | null` from the API — a stored value
 * written by a run that may predate a class being added or renamed — so it is
 * checked against the contract rather than cast to it. An unrecognised value is
 * treated as no classification at all, which shows as "not classified" instead
 * of putting a chip on screen with an enum name inside it.
 */
export function asMovementClass(
  value: string | null | undefined,
): MovementClass | null {
  if (!value) return null;
  return (MOVEMENT_CLASSES as readonly string[]).includes(value)
    ? (value as MovementClass)
    : null;
}

/** Is this row part of the routine buy/pay pair? Unclassified rows are not. */
export function isRoutineRow(row: ClassifiedLedgerRowLike): boolean {
  const cls = asMovementClass(row.movementClass);
  return cls !== null && isRoutineClass(cls);
}

/**
 * The ledger rows an admin wants to see, given the "hide routine traffic"
 * toggle.
 *
 * With the toggle off this is the identity — the ledger is the ledger. With it
 * on, the routine traffic drops out — fuel invoices, deposits and fleet-card
 * settlements, 3,016 of the 3,163 rows production holds — and what remains is
 * every fee, every interest posting and every line nobody could name. A row
 * with NO classification survives the filter deliberately: "we do not know what
 * this is" is the single most important thing on this screen, and a filter that
 * quietly swallowed it would hide the one row an admin came for.
 */
export function visibleLedgerRows<T extends ClassifiedLedgerRowLike>(
  rows: readonly T[],
  hideRoutine: boolean,
): T[] {
  if (!hideRoutine) return [...rows];
  return rows.filter((r) => !isRoutineRow(r));
}

/**
 * How many of the loaded rows carry a classification at all.
 *
 * The toggle is only offered once this is above zero. Before Ledger Watch has
 * run for a dealer every row is unclassified, so "hide routine traffic" would
 * hide nothing and read as broken; the table says the rows are not classified
 * yet instead of offering a control that cannot work.
 */
export function classifiedRowCount(
  rows: readonly ClassifiedLedgerRowLike[],
): number {
  return rows.reduce((n, r) => n + (asMovementClass(r.movementClass) ? 1 : 0), 0);
}
