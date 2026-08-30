/**
 * The Fuel P&L as one shareable card — the strings, decided here.
 *
 * A screen is not a shareable thing. Someone who wants to put this in front of
 * a dealer, or a partner, or a colleague on WhatsApp, needs one image whose
 * figures cannot drift from the assumptions behind them. That is the whole
 * design constraint: the answer and everything it rests on travel together, in
 * the same file, so a profit figure can never be forwarded on its own.
 *
 * So the card carries, in this order:
 *
 *   1. BOTH answers, side by side — the profit if the testing fuel went back in
 *      the tank and the profit if it was sold. Neither is known. Printing only
 *      the selected one would forward a guess as a fact.
 *   2. What was MEASURED — litres, from the day book. These are counted.
 *   3. What was ASSUMED — the two rates per grade, and the report's own
 *      constants. Every one of them is a number somebody chose.
 *
 * This file builds strings only, and does no layout. It is the readable half of
 * the pair: this admin has no test runner, so the way a formula gets checked is
 * by being callable without a browser and by being read.
 */
import { dealerCodeLabel } from '@dk/shared';

import type { DsrPnlResponse } from '@/hooks/api/useDsr';

import { formatInrWhole, formatLitres, formatYmd } from './format';
import {
  computeFuelPnl,
  defaultRatesFor,
  RATE_DEFAULTS_SOURCE,
  SUSPICIOUS_GAIN_RATE,
  type FuelPnlResult,
  type FuelPnlSettings,
  type GradeRates,
} from './fuelPnl';

/** A labelled figure, with an optional second line and a "this is a loss" flag. */
export interface CardKv {
  label: string;
  value: string;
  hint?: string;
  bad?: boolean;
}

/** One answer to the testing question, priced. */
export interface CardScenario {
  heading: string;
  subheading: string;
  /** The treatment the admin currently has selected on the screen. */
  selected: boolean;
  profit: string;
  profitBad: boolean;
  rows: CardKv[];
  /** Stock variation per grade under this treatment — the non-money consequence. */
  variation: CardKv[];
}

export interface CardTable {
  columns: { header: string; right?: boolean }[];
  rows: string[][];
}

export interface PnlCardModel {
  outlet: string;
  period: string;
  prepared: string;
  /** False when not one grade has both rates — every rupee below is an em dash. */
  priced: boolean;
  /** Exactly two, always: poured back, then sold. */
  scenarios: CardScenario[];
  /** The one sentence that says what the unanswered question is worth. */
  swing: string | null;
  /** A surplus too large to be real, if either answer produces one. */
  caution: string | null;
  /** Grades whose loss could not be priced, because no report exists yet. */
  unpriced: string | null;
  measured: CardKv[];
  rates: CardTable;
  rateSource: string;
  /** Named grades still sitting on the shipped starting figures, if any. */
  rateWarning: string | null;
  engine: CardKv[];
  grades: CardTable;
  footer: string[];
}

/** A rate, to the paisa. Blank is "not known", which is not zero. */
function rate(n: number | null): string {
  return typeof n === 'number' && Number.isFinite(n) ? `₹${n.toFixed(2)}` : '—';
}

/**
 * Money, with one blank marker for the whole card.
 *
 * `formatInrWhole` writes an unknown as an ASCII hyphen, which is right in a
 * table on a screen and wrong here: set at 30px under FUEL PROFIT it reads as a
 * stray mark or a half-drawn glyph rather than as "nobody has told us the
 * price". Everything unknown on this card is an em dash.
 */
function money(n: number | null): string {
  const s = formatInrWhole(n);
  return s === '-' ? '—' : s;
}

/** "Fuel lost" unless there is a genuine surplus to name — as on the screen. */
function lossLabel(litres: number): string {
  return litres > 0 ? 'Fuel gained' : 'Fuel lost';
}

function scenario(
  heading: string,
  subheading: string,
  res: FuelPnlResult,
  selected: boolean,
): CardScenario {
  const t = res.totals;
  // With no report generated there is no variation, so the engine's loss rate is
  // zero — and printing that as "Fuel lost 0 L" claims a measurement nobody made.
  const measuredLoss = res.products.some((p) => p.loss);
  return {
    heading,
    subheading,
    selected,
    profit: money(t.profit),
    profitBad: t.profit !== null && t.profit < 0,
    rows: [
      { label: 'Fuel sold', value: formatLitres(t.soldLitres) },
      { label: 'Margin on sales', value: money(t.grossMargin) },
      measuredLoss
        ? {
            label: lossLabel(t.lostLitres),
            value: money(t.lostValue),
            hint: formatLitres(t.lostLitres, { sign: true }),
            // Red only for fuel actually gone, and never for an em dash — a
            // coloured "—" reads as a loss somebody measured.
            bad: t.lostValue !== null && t.lostLitres < 0,
          }
        : { label: 'Fuel lost', value: '—', hint: 'not measured yet' },
    ],
    variation: res.products.map((p) => ({
      label: p.labelEn,
      value: p.loss ? formatLitres(p.loss.variationLitres, { sign: true }) : '—',
      bad: !!p.loss && p.loss.variationLitres < 0,
    })),
  };
}

/** True when a grade's rates are still exactly what this app shipped. */
function untouched(entered: GradeRates | undefined, key: string): boolean {
  const d = defaultRatesFor(key);
  if (!d || !entered) return false;
  return entered.buyPerLitre === d.buyPerLitre && entered.sellPerLitre === d.sellPerLitre;
}

/**
 * The warning the screen makes per grade, said once for the card.
 *
 * A surplus above {@link SUSPICIOUS_GAIN_RATE} is counted as profit by the
 * arithmetic and should not be believed — it is what a delivery missing from the
 * portal looks like. It matters most on the "sold" side, where re-treating the
 * testing litres can flip a shortage into an excess large enough to be a
 * sales-suspension event in its own right, so the card must not forward that
 * higher profit without saying where it came from.
 */
function suspicious(
  a: FuelPnlResult,
  aLabel: string,
  b: FuelPnlResult,
  bLabel: string,
): string | null {
  const names = (res: FuelPnlResult, label: string): string | null => {
    const hit = res.products
      .filter((p) => p.loss && p.loss.lossRate > SUSPICIOUS_GAIN_RATE)
      .map((p) => p.labelEn);
    return hit.length ? `${hit.join(', ')} (testing ${label})` : null;
  };
  const parts = [names(a, aLabel), names(b, bLabel)].filter((x): x is string => x !== null);
  if (parts.length === 0) return null;
  return `More fuel than the books account for, counted here as profit: ${parts.join('; ')}. An excess that size almost always means a delivery is missing from the records rather than that the fuel was free — check the shift data before trusting the gain.`;
}

export function buildPnlCard(
  data: DsrPnlResponse,
  settings: FuelPnlSettings,
  now: Date = new Date(),
): PnlCardModel {
  // Both, always, whichever the screen is showing. The card exists precisely so
  // that the question travels with the answer.
  const returned = computeFuelPnl(data.products, { ...settings, testing: 'RETURNED' });
  const sold = computeFuelPnl(data.products, { ...settings, testing: 'SOLD' });

  const swingValue =
    returned.totals.profit !== null && sold.totals.profit !== null
      ? sold.totals.profit - returned.totals.profit
      : null;

  const sum = (pick: (p: DsrPnlResponse['products'][number]) => number): number =>
    data.products.reduce((s, p) => s + pick(p), 0);

  const measured: CardKv[] = [
    { label: 'Fuel bought', value: formatLitres(sum((p) => p.receiptLitres)) },
    { label: 'Metered sales', value: formatLitres(sum((p) => p.salesLitres)) },
    {
      label: 'Testing charged',
      value: formatLitres(sum((p) => p.testingLitres)),
      hint: 'Not measured',
    },
    { label: 'Deliveries', value: String(sum((p) => p.loads.length)) },
    {
      label: 'Days counted',
      value: String(data.products.reduce((n, p) => Math.max(n, p.closedDays), 0)),
    },
  ];

  const stale = data.products
    .filter((p) => untouched(settings.rates[p.productKey], p.productKey))
    .map((p) => p.labelEn);

  const cfg = data.config;
  const engine: CardKv[] = [
    {
      label: 'Testing charged',
      value: `${cfg.testingPerActivePumpLitres} L per pump per day`,
      hint: 'Assumed — nobody measures it',
    },
    {
      label: 'Pump counts as active',
      value: `Meter moved ${cfg.testingMinDeltaLitres} L or more`,
    },
    {
      label: 'Delivery figure used',
      value: cfg.receiptBasis === 'INVOICE' ? 'Invoiced litres' : 'Dipped-in litres',
      hint: 'Rounded up to the next 500 L',
    },
    {
      label: 'Variation counted since',
      value: formatYmd(cfg.sinceDate),
      hint: 'The last inspection',
    },
    {
      label: 'Lost fuel valued at',
      value: settings.lossBasis === 'COST' ? 'What it cost' : 'The pump price',
      hint: 'Changes how the profit is explained, not the profit',
    },
    ...data.products.map((p) => ({
      label: `${p.labelEn} allowances`,
      value: `${p.leakagePct}% evaporation + ${p.permissiblePct}% stock`,
      hint: 'Forgiven before it counts as a loss',
    })),
  ];

  const byKey = (res: FuelPnlResult, key: string) =>
    res.products.find((p) => p.productKey === key) ?? null;

  return {
    // `dealerCodeLabel` answers a missing code with an em dash, which is right
    // in a table cell and looks like a failed render at 34px on a shared image.
    outlet: data.outletCode ? dealerCodeLabel(data.outletCode) : 'Unknown outlet',
    period: `${formatYmd(data.from)} — ${formatYmd(data.to)}`,
    prepared: formatYmd(
      // The card is stamped with a plain calendar day, read in the browser's own
      // zone, because that is the day the person holding it will call it.
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`,
    ),
    priced: returned.products.some((p) => p.priced),
    scenarios: [
      scenario(
        'Testing fuel poured back in',
        'What the report assumes',
        returned,
        settings.testing === 'RETURNED',
      ),
      scenario('Testing fuel sold', 'Metered, paid for, gone', sold, settings.testing === 'SOLD'),
    ],
    swing:
      swingValue !== null && Math.abs(swingValue) >= 1
        ? `Was the testing fuel sold, or poured back into the tank? Nobody measures it, so nobody knows. Answering it moves the profit by ${money(
            Math.abs(swingValue),
          )} over this period — that is the whole gap between the two figures above.`
        : null,
    caution: suspicious(returned, 'poured back', sold, 'sold'),
    unpriced: (() => {
      const names = returned.products.filter((p) => !p.loss).map((p) => p.labelEn);
      if (names.length === 0) return null;
      return `No stock variation has been measured for ${names.join(
        ', ',
      )}, so no fuel loss is priced into the figures above — for ${
        names.length === 1 ? 'that grade' : 'those grades'
      } this is the margin alone. Generate a Daily Sales Report for this dealer to get one.`;
    })(),
    measured,
    rates: {
      columns: [
        { header: 'Grade' },
        { header: 'Cost / litre', right: true },
        { header: 'Pump price / litre', right: true },
        { header: 'Margin / litre', right: true },
      ],
      rows: data.products.map((p) => {
        const r = settings.rates[p.productKey] ?? { buyPerLitre: null, sellPerLitre: null };
        const margin =
          r.buyPerLitre !== null && r.sellPerLitre !== null ? r.sellPerLitre - r.buyPerLitre : null;
        return [p.labelEn, rate(r.buyPerLitre), rate(r.sellPerLitre), rate(margin)];
      }),
    },
    rateSource: `Starting figures come from ${RATE_DEFAULTS_SOURCE}`,
    rateWarning:
      stale.length > 0
        ? `Still on those starting figures, not this dealer's own: ${stale.join(', ')}.`
        : null,
    engine,
    grades: {
      columns: [
        { header: 'Grade' },
        { header: 'Bought', right: true },
        { header: 'Profit — poured back', right: true },
        { header: 'Profit — sold', right: true },
        { header: 'Difference', right: true },
      ],
      rows: data.products.map((p) => {
        const a = byKey(returned, p.productKey);
        const b = byKey(sold, p.productKey);
        const diff =
          a?.profit !== null && a?.profit !== undefined && b?.profit !== null && b?.profit !== undefined
            ? b.profit - a.profit
            : null;
        return [
          p.labelEn,
          formatLitres(p.receiptLitres),
          money(a?.profit ?? null),
          money(b?.profit ?? null),
          money(diff),
        ];
      }),
    },
    footer: [
      'Litres are counted from the Daily Sales Report. The rates are not: no portal we read publishes a fuel price, so they are typed in by hand and every rupee figure here rests on them.',
      'Fuel only. Nothing here includes rent, salaries, power, interest or any other cost of running the outlet. Not a statement of account.',
    ],
  };
}
