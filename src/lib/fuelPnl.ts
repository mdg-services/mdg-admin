/**
 * Turning the DSR's litres into rupees — the whole calculation, in one pure file.
 *
 * It lives apart from the screen for the reason every decidable rule in this
 * admin does: there is no test runner here, so the only way a formula can be
 * checked is by being readable and by being callable without a browser.
 *
 * The shape of the answer, per grade:
 *
 *   gross margin  =  litres × (pump price − landed cost)
 *   fuel lost     =  litres × loss rate                     (signed; −ve = gone)
 *   profit        =  gross margin + (fuel lost × a rate)
 *
 * Everything interesting is in the three inputs that are NOT litres, and all
 * three are shown on the screen beside the answer:
 *
 *   • the two rates per grade, because nothing we collect publishes either one;
 *   • what testing fuel did, because the engine assumes it went back in the tank
 *     and if it did not, most of the reported shortage is not a shortage;
 *   • whether lost fuel is valued at what it cost or at what it would have sold
 *     for, because dealers and accountants answer that differently.
 */

/**
 * What actually happened to the litres the report charged as testing.
 *
 * The DSR assumes `RETURNED`: fuel is drawn into a measure, the meter counts it,
 * and it is poured back down the fill point. On that assumption it is neither
 * revenue nor loss, which is why the engine subtracts it from the meter before
 * comparing with the dip.
 *
 * If it was in fact `SOLD` — or given away, or spilt — then it left the tank for
 * good and the subtraction is wrong: the meter reading was honest and the engine
 * has been quietly booking those litres as a shortage. Flipping this moves the
 * variation by the whole since-inspection testing total, which at a busy outlet
 * is most of the reported loss.
 *
 * Nobody measures testing. It is `testingPerActivePumpLitres` × the number of
 * nozzles that moved, every day, so this switch is a genuine open question and
 * not a preference.
 */
export type TestingTreatment = 'RETURNED' | 'SOLD';

/**
 * What a lost litre is worth.
 *
 * `COST` — it cost what the dealer paid for it. The standard treatment for
 * inventory that disappears, and the smaller of the two numbers.
 *
 * `RETAIL` — value it at the pump price, i.e. count the margin he would have
 * earned on it as forgone too. This is how a dealer instinctively reckons it
 * ("that's ₹50,000 of diesel gone"), and it is the same thing as saying revenue
 * is only earned on the litres that actually reached a customer.
 */
export type LossBasis = 'COST' | 'RETAIL';

/** The two rupee figures per grade that nothing in the system collects. */
export interface GradeRates {
  /** Landed cost per litre — off the tanker invoice. */
  buyPerLitre: number | null;
  /** Pump price per litre. */
  sellPerLitre: number | null;
}

export interface FuelPnlSettings {
  /** Rates by `productKey`. */
  rates: Record<string, GradeRates>;
  testing: TestingTreatment;
  lossBasis: LossBasis;
}

/* ───────────────────────── starting figures ───────────────────────── */

/**
 * Where the starting rates come from, in one sentence, for the screen to quote.
 *
 * Named and dated on purpose. A prefilled rate that cannot say where it came
 * from is exactly the hidden constant this page exists to abolish — the only
 * thing that makes seeding them defensible is that the source is on the screen
 * next to them and one keystroke overrides it.
 */
export const RATE_DEFAULTS_SOURCE =
  "IndianOil tax invoice 7010045406 (22 Aug 2026) for the cost, and the Patna pump price on 25 Aug 2026 for the sale.";

interface DefaultRate extends GradeRates {
  /** Why this figure, said in the admin's words. Shown under the field. */
  note: string;
}

/**
 * A first guess per grade, so the page arrives with numbers in it.
 *
 * The two diesel/petrol figures are real and checkable: the cost is that
 * invoice's own "Total for material" divided by its litres (₹5,86,544.18 ÷
 * 6,000 for diesel, ₹6,61,896.73 ÷ 6,000 for petrol — both reconcile to the
 * paisa), and the pump price is what Patna was charging three days later.
 *
 * They are a STARTING POINT and nothing more. The invoice belongs to one outlet
 * on one day; VAT differs by state, the pump price moves daily, and diesel in
 * Patna swung ₹3 in the week these were read. The screen says so, and every
 * field is editable.
 *
 * The premium grades are the weak ones and are marked as such. We have never
 * captured an invoice money line for XtraPremium or XtraGreen, so they start on
 * their ordinary grade's figures — which understates BOTH sides, since premium
 * costs more to buy and sells for more. Correct them per dealer.
 */
const DEFAULTS: Record<string, DefaultRate> = {
  HSD: {
    buyPerLitre: 97.76,
    sellPerLitre: 99.34,
    note: 'From a real tanker invoice and the Patna pump price. Check against this dealer.',
  },
  MS: {
    buyPerLitre: 110.32,
    sellPerLitre: 111.21,
    note: 'From a real tanker invoice and the Patna pump price. The ₹0.89 margin looks thin against the ₹2.50–3.00 usually quoted for petrol — worth confirming with the dealer.',
  },
  XP: {
    buyPerLitre: 110.32,
    sellPerLitre: 111.21,
    note: 'Ordinary petrol’s figures — no premium invoice line has been captured yet. Both the real cost and the real pump price are higher than this.',
  },
  XG: {
    buyPerLitre: 97.76,
    sellPerLitre: 99.34,
    note: 'Ordinary diesel’s figures — no premium invoice line has been captured yet. Both the real cost and the real pump price are higher than this.',
  },
};

/** The starting figures for a grade, or `null` when we have nothing to offer. */
export function defaultRatesFor(productKey: string): DefaultRate | null {
  return DEFAULTS[productKey] ?? null;
}

/**
 * Seed any grade the admin has never given a rate for.
 *
 * Only ever fills a gap — a figure already in `rates`, including one deliberately
 * cleared back to `null`, is returned untouched. That distinction is the whole
 * reason this is a separate function rather than a spread: re-seeding a field
 * somebody blanked on purpose would make the page argue with its operator.
 */
export function withDefaultRates(
  rates: Record<string, GradeRates>,
  productKeys: readonly string[],
): Record<string, GradeRates> {
  const next = { ...rates };
  for (const key of productKeys) {
    if (next[key]) continue;
    const d = defaultRatesFor(key);
    if (d) next[key] = { buyPerLitre: d.buyPerLitre, sellPerLitre: d.sellPerLitre };
  }
  return next;
}

/* ─────────────────────────────── inputs ─────────────────────────────── */

/** One delivery, as the API hands it over. */
export interface PnlLoadInput {
  businessDate: string;
  litres: number;
  irasReceipt: number | null;
  source: 'iras' | 'manual' | 'inferred';
}

/** One grade's litres for the window, plus its loss context. */
export interface PnlProductInput {
  productKey: string;
  labelEn: string;
  leakagePct: number;
  permissiblePct: number;
  salesLitres: number;
  testingLitres: number;
  receiptLitres: number;
  closedDays: number;
  closingStock: number;
  variation: {
    litres: number;
    notWithinLimit: number;
    sinceDate: string;
    asOf: string;
    receiptsSinceInspection: number;
    testingSinceInspection: number;
    meterSalesSinceInspection: number;
  } | null;
  loads: PnlLoadInput[];
}

/* ─────────────────────────────── outputs ─────────────────────────────── */

/** One delivery, priced. Every money field is `null` when a rate is missing. */
export interface PnlLoad extends PnlLoadInput {
  /** `litres − irasReceipt`, i.e. what the 500 L round-up added. `null` with no portal figure. */
  roundedUpBy: number | null;
  cost: number | null;
  /** Litres of this load expected to reach a customer, after its share of the loss. */
  sellableLitres: number;
  revenue: number | null;
  grossMargin: number | null;
  /** This load's share of the fuel that went missing. Signed; negative ⇒ lost. */
  lostLitres: number;
  lostValue: number | null;
  profit: number | null;
  /** Profit as a percent of what the load cost — the return on the money tied up. */
  returnPct: number | null;
}

export interface PnlProduct {
  productKey: string;
  labelEn: string;
  rates: GradeRates;
  /** True when both rates are present, i.e. the money columns mean something. */
  priced: boolean;

  /** Litres sold in the window, under the chosen testing treatment. */
  soldLitres: number;
  testingLitres: number;
  receiptLitres: number;
  closingStock: number;
  closedDays: number;

  /**
   * The variation under the chosen testing treatment, and the rate it implies.
   *
   * `lossRate` is litres lost per litre received since the inspection — the only
   * defensible way to attribute a cumulative, since-inspection figure to one
   * delivery inside it.
   */
  loss: {
    /** Litres, signed. Negative ⇒ stock is short. */
    variationLitres: number;
    /** As the report itself states it, before any testing re-treatment. */
    reportedVariationLitres: number;
    /** What flipping the testing treatment moves the variation by. */
    testingSwingLitres: number;
    lossRate: number;
    sinceDate: string;
    asOf: string;
    receiptsSinceInspection: number;
  } | null;

  grossMargin: number | null;
  lostLitres: number;
  lostValue: number | null;
  profit: number | null;
  /** Profit per litre sold. */
  profitPerLitre: number | null;

  loads: PnlLoad[];
}

export interface FuelPnlResult {
  products: PnlProduct[];
  totals: {
    soldLitres: number;
    receiptLitres: number;
    grossMargin: number | null;
    lostLitres: number;
    lostValue: number | null;
    profit: number | null;
    /** True when EVERY priced grade had both rates — a total is otherwise partial. */
    complete: boolean;
  };
}

/* ────────────────────────────── the maths ────────────────────────────── */

/**
 * The variation, restated for what testing actually did.
 *
 * The engine computes `variation = (meter − testing) − dipSales`. That middle
 * subtraction is the assumption. If testing fuel never came back, the meter
 * reading needed no correction and the testing total has to be added straight
 * back on.
 */
function variationUnder(
  reported: number,
  testingSinceInspection: number,
  treatment: TestingTreatment,
): number {
  return treatment === 'SOLD' ? reported + testingSinceInspection : reported;
}

/** A finite, non-zero number, or `null`. Guards every division below. */
function usable(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n !== 0 ? n : null;
}

/**
 * How many litres the margin is earned on — and why it depends on the loss basis.
 *
 * There is only ONE profit on a load, and these are two correct ways of arriving
 * at it. Mixing them is what makes a table stop adding up.
 *
 *   bought 10,000 L at ₹90, pump ₹95, 100 L vanish
 *   → he paid ₹9,00,000, 9,900 L reached customers for ₹9,40,500, profit ₹40,500
 *
 *   COST   — margin on the 9,900 that SOLD, less what the missing 100 cost:
 *            9,900 × ₹5 − 100 × ₹90  = 49,500 − 9,000 = ₹40,500 ✓
 *   RETAIL — margin on all 10,000 BOUGHT, less the revenue the 100 never earned:
 *            10,000 × ₹5 − 100 × ₹95 = 50,000 − 9,500 = ₹40,500 ✓
 *
 * Take the margin on everything bought AND charge the loss at cost and you get
 * ₹41,000 — ₹500 too high, because the margin on the vanished litres has been
 * counted as earned. That was the original bug here, and it showed up as a table
 * whose own Cost and Revenue columns did not subtract to its Profit column.
 */
function marginLitres(bought: number, lostLitres: number, basis: LossBasis): number {
  return basis === 'COST' ? bought + lostLitres : bought;
}

export function computeFuelPnl(
  products: PnlProductInput[],
  settings: FuelPnlSettings,
): FuelPnlResult {
  const out = products.map((p) => priceProduct(p, settings));

  const priced = out.filter((p) => p.priced);
  const complete = out.length > 0 && priced.length === out.length;
  const sum = (pick: (p: PnlProduct) => number | null): number | null =>
    priced.length === 0 ? null : priced.reduce((s, p) => s + (pick(p) ?? 0), 0);

  return {
    products: out,
    totals: {
      soldLitres: out.reduce((s, p) => s + p.soldLitres, 0),
      receiptLitres: out.reduce((s, p) => s + p.receiptLitres, 0),
      grossMargin: sum((p) => p.grossMargin),
      lostLitres: out.reduce((s, p) => s + p.lostLitres, 0),
      lostValue: sum((p) => p.lostValue),
      profit: sum((p) => p.profit),
      complete,
    },
  };
}

function priceProduct(p: PnlProductInput, settings: FuelPnlSettings): PnlProduct {
  const rates = settings.rates[p.productKey] ?? { buyPerLitre: null, sellPerLitre: null };
  const buy = rates.buyPerLitre;
  const sell = rates.sellPerLitre;
  const priced =
    typeof buy === 'number' && Number.isFinite(buy) &&
    typeof sell === 'number' && Number.isFinite(sell);
  const margin = priced ? sell! - buy! : null;

  // Testing fuel that was SOLD is fuel that left the tank AND was paid for. Both
  // halves follow from the one switch: the litres sold go up by the testing
  // total, and the variation stops carrying it as a shortage.
  const soldLitres =
    settings.testing === 'SOLD' ? p.salesLitres + p.testingLitres : p.salesLitres;

  let loss: PnlProduct['loss'] = null;
  let lossRate = 0;
  if (p.variation) {
    const restated = variationUnder(
      p.variation.litres,
      p.variation.testingSinceInspection,
      settings.testing,
    );
    const base = usable(p.variation.receiptsSinceInspection);
    // With no receipts since the inspection there is nothing to spread the loss
    // across, so it is left at zero rather than divided by nothing. The variation
    // is still reported — it is real, it just cannot be attributed per load.
    lossRate = base ? restated / base : 0;
    loss = {
      variationLitres: restated,
      reportedVariationLitres: p.variation.litres,
      testingSwingLitres: p.variation.testingSinceInspection,
      lossRate,
      sinceDate: p.variation.sinceDate,
      asOf: p.variation.asOf,
      receiptsSinceInspection: p.variation.receiptsSinceInspection,
    };
  }

  const lossValueRate = settings.lossBasis === 'COST' ? buy : sell;

  const loads: PnlLoad[] = p.loads.map((l) => {
    const lostLitres = l.litres * lossRate;
    const sellableLitres = l.litres + lostLitres;
    const cost = priced ? l.litres * buy! : null;
    // See `marginLitres` — the margin base has to match the loss valuation or
    // the two halves double-count the margin on the fuel that vanished.
    const grossMargin =
      margin === null ? null : marginLitres(l.litres, lostLitres, settings.lossBasis) * margin;
    const lostValue =
      typeof lossValueRate === 'number' && Number.isFinite(lossValueRate)
        ? lostLitres * lossValueRate
        : null;
    const profit =
      grossMargin === null || lostValue === null ? null : grossMargin + lostValue;
    return {
      ...l,
      // A hand-entered figure has no portal figure behind it, and an inferred one
      // IS the rounding — neither has a meaningful round-up to report.
      roundedUpBy:
        l.source === 'iras' && typeof l.irasReceipt === 'number'
          ? l.litres - l.irasReceipt
          : null,
      cost,
      sellableLitres,
      revenue: priced ? sellableLitres * sell! : null,
      grossMargin,
      lostLitres,
      lostValue,
      profit,
      returnPct: profit !== null && cost ? (profit / cost) * 100 : null,
    };
  });

  // The period figures are computed from the period's own litres, NOT by summing
  // the loads: a window can contain sales from a delivery that arrived before it
  // began, and it usually does.
  const lostLitres = soldLitres * lossRate;
  const grossMargin =
    margin === null
      ? null
      : marginLitres(soldLitres - lostLitres, lostLitres, settings.lossBasis) * margin;
  const lostValue =
    typeof lossValueRate === 'number' && Number.isFinite(lossValueRate)
      ? lostLitres * lossValueRate
      : null;
  const profit = grossMargin === null || lostValue === null ? null : grossMargin + lostValue;

  return {
    productKey: p.productKey,
    labelEn: p.labelEn,
    rates,
    priced,
    soldLitres,
    testingLitres: p.testingLitres,
    receiptLitres: p.receiptLitres,
    closingStock: p.closingStock,
    closedDays: p.closedDays,
    loss,
    grossMargin,
    lostLitres,
    lostValue,
    profit,
    profitPerLitre: profit !== null && soldLitres ? profit / soldLitres : null,
    loads,
  };
}
