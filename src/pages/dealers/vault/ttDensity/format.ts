import { formatYmd } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import {
  ttDensityFreshness,
  type TtDensityFreshness,
  type TtInvoiceSummary,
  type TtLatestDensity,
} from '@dk/shared';

/**
 * Every decision the TT Density pane makes, taken out of the components.
 *
 * `mdg-admin` has no test runner — `package.json` has `lint` and `typecheck` and
 * nothing else — so a rule written inside a `.tsx` is a rule nothing can ever
 * check. The whole of this feature's judgement therefore lives here as plain
 * functions over plain values: the freshness ladder, the age wording, the three
 * decimals, the row comparator, the calendar's cell states and its counter. The
 * components are left with nothing to get wrong but layout, and the day a runner
 * arrives this is the one file to point it at.
 *
 * The one rule worth naming twice: a density is ALWAYS printed to three
 * decimals. The invoice prints three, the dealer copies three into their book,
 * and an operator holding the paper beside the screen must not have to decide
 * whether `727.3` and `727.300` are the same figure. `toLocaleString` is
 * forbidden here for the same reason — it would drop the trailing zeros and,
 * on `en-IN`, group the thousands of a number that is never grouped.
 */

/** Placeholder for a figure we do not hold. Never a zero, never a blank cell. */
const NO_VALUE = '—';

/**
 * A density as it belongs on screen: three decimals, always.
 *
 * `density15Raw` is the invoice's own text and is preferred when the parsed
 * number is missing, because an unparsed line still printed *something* and the
 * operator can read it. When both are absent the caller gets a dash rather than
 * a `0.000` — a fabricated zero beside a real 820.500 is the one confusion this
 * screen cannot afford.
 */
export function formatDensity(
  value: number | null | undefined,
  raw?: string | null,
): string {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(3);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : NO_VALUE;
}

/**
 * How the age of a figure is said in the provenance line: `2 days ago`.
 *
 * Words, not just a colour — UX §5.3 trap 6. A reader who cannot resolve an
 * amber badge from a grey one still gets the fact.
 */
export function ageWords(ageDays: number): string {
  if (!Number.isFinite(ageDays) || ageDays < 0) return '';
  if (ageDays === 0) return 'today';
  if (ageDays === 1) return 'yesterday';
  return `${ageDays} days ago`;
}

/** How the same age is said on the staleness badge: `24 days old`. */
export function ageBadgeLabel(ageDays: number): string {
  if (ageDays === 1) return '1 day old';
  return `${ageDays} days old`;
}

/** Everything a hero tile needs to look its age, derived from one number. */
export interface DensityFreshnessStyle {
  freshness: TtDensityFreshness;
  /** Colour of the big figure. A stale figure recedes; it never disappears. */
  numberClass: string;
  /** Tile border. Only `stale` earns a coloured edge. */
  borderClass: string;
  /** Badge intent, or null when the figure is current and needs no label. */
  badgeIntent: Intent | null;
  /** Badge text, or null. Always the day count in words. */
  badgeLabel: string | null;
}

/**
 * The 7 / 21 ladder, rendered.
 *
 * The thresholds themselves are `ttDensityFreshness` in `@dk/shared` and are
 * deliberately not re-stated here: the dealer's app reads the same function, and
 * two surfaces that disagreed about what "old" means about the same figure is
 * exactly what putting them in `shared` prevents.
 *
 * A STALE TILE STILL SHOWS THE FIGURE. It is the last true reading and an
 * operator may need it; it goes muted and announces its age. A blanked tile
 * would be a worse lie than an old number that says how old it is.
 */
export function densityFreshnessStyle(ageDays: number): DensityFreshnessStyle {
  const freshness = ttDensityFreshness(ageDays);
  if (freshness === 'STALE') {
    return {
      freshness,
      numberClass: 'text-text-muted',
      borderClass: 'border-danger/40',
      badgeIntent: 'danger',
      badgeLabel: ageBadgeLabel(ageDays),
    };
  }
  if (freshness === 'AGEING') {
    return {
      freshness,
      numberClass: 'text-text',
      borderClass: 'border-border',
      badgeIntent: 'warning',
      badgeLabel: ageBadgeLabel(ageDays),
    };
  }
  return {
    freshness,
    numberClass: 'text-text',
    borderClass: 'border-border',
    badgeIntent: null,
    badgeLabel: null,
  };
}

/**
 * The eyebrow over the big figure: `DIESEL (HSD)`, or the invoice's own words.
 *
 * A product whose material code AND description we do not recognise is labelled
 * `16730 · EBMS` — exactly what IndianOil printed, with no friendly name
 * guessed on top of it. A guessed label sits beside a number the dealer copies
 * into a register, so the honest version wins even though it reads worse.
 */
export function heroEyebrow(product: TtLatestDensity): string {
  if (product.provisional) {
    const parts = [product.materialCode, product.description].filter(
      (v) => !!v && v.trim().length > 0,
    );
    return parts.length > 0 ? parts.join(' · ') : product.productKey;
  }
  if (product.family === 'DIESEL' || product.family === 'PETROL') {
    return `${product.family} (${product.productKey})`;
  }
  return product.labelEn || product.productKey;
}

/** `22 Aug 2026 · BR09GC8009 · 2 days ago`, skipping whatever is missing. */
export function heroProvenance(product: TtLatestDensity): string {
  return [formatYmd(product.invoiceDate), product.vehicleNo, ageWords(product.ageDays)]
    .filter((v): v is string => !!v && v !== '-')
    .join(' · ');
}

/**
 * The whole tile as one sentence, for a screen reader.
 *
 * The visual parts are `aria-hidden` and this replaces them, because reading the
 * tile as it is laid out gives "eight two zero point five zero zero" followed by
 * a bare registration. So the value is spoken at its natural precision and the
 * tanker is spelled letter by letter.
 */
export function heroSpokenLabel(product: TtLatestDensity): string {
  const name = product.provisional
    ? `${product.materialCode} ${product.description}`.trim()
    : `${product.family === 'UNKNOWN' ? product.labelEn : product.family}, ${spellOut(product.productKey)}`;
  const parts = [
    `${name}. Density at 15 degrees: ${product.density15} kilograms per cubic metre.`,
    `From invoice ${spellOut(product.sapInvoiceNo)} dated ${formatYmd(product.invoiceDate)}`,
  ];
  if (product.vehicleNo) parts.push(`tanker ${spellOut(product.vehicleNo)}`);
  const sentence = `${parts.join(', ')}.`;
  const age = ageWords(product.ageDays);
  return age ? `${sentence} Read ${age}.` : sentence;
}

/** `BR09GC8009` → `B R 0 9 G C 8 0 0 9`, so a reader spells it rather than guessing a word. */
export function spellOut(value: string): string {
  return value.trim().split('').join(' ');
}

/** One product line of an invoice row, ready to print. */
export interface DensityCellLine {
  key: string;
  /** Product chip text — the short key, e.g. `MS`. */
  chip: string;
  /** `727.300 · 6 KL`, or just the figure when the quantity is absent. */
  text: string;
}

/**
 * The density cell of one invoice row, capped.
 *
 * Three lines, then `+N more`. A four-grade invoice is possible and a row that
 * grew to four lines would push the neighbouring rows apart far enough that
 * scanning the date column stops working — and the drawer one click away shows
 * every line anyway.
 */
export function densityCellLines(
  densities: TtInvoiceSummary['densities'],
  maxLines = 3,
): { lines: DensityCellLine[]; moreCount: number } {
  const lines = densities.slice(0, maxLines).map((d, i) => ({
    key: `${d.productKey}-${i}`,
    chip: d.productKey,
    text: densityLineText(d),
  }));
  return { lines, moreCount: Math.max(0, densities.length - lines.length) };
}

/** `727.300 · 6 KL`. The quantity rides on the summary so a row never fetches an invoice. */
export function densityLineText(
  d: TtInvoiceSummary['densities'][number],
): string {
  const figure = formatDensity(d.density15, d.density15Raw);
  const quantity =
    typeof d.quantity === 'number' && Number.isFinite(d.quantity)
      ? `${d.quantity.toLocaleString('en-IN')}${d.unit ? ` ${d.unit}` : ''}`
      : null;
  return quantity ? `${figure} · ${quantity}` : figure;
}

/**
 * Invoice date descending, then SAP invoice number descending.
 *
 * Two tankers can land on the same day, and without the second key their order
 * is whatever the last fetch happened to produce — so a row an operator was
 * about to click moves under the cursor when the pane refreshes. The SAP number
 * is monotonic for an outlet, which makes it a stable tie-break rather than an
 * arbitrary one.
 */
export function compareInvoiceRows(a: TtInvoiceSummary, b: TtInvoiceSummary): number {
  if (a.invoiceDate !== b.invoiceDate) return a.invoiceDate < b.invoiceDate ? 1 : -1;
  if (a.sapInvoiceNo === b.sapInvoiceNo) return 0;
  return a.sapInvoiceNo < b.sapInvoiceNo ? 1 : -1;
}

/* ─────────────────────────────── the pane header ─────────────────────────── */

/**
 * The line under the pane title, degrading through three facts.
 *
 * A failed fetch says so and keeps the invoice count, because the count is still
 * true and blanking it would suggest the invoices went away with the fetch.
 */
export function paneSubtitle(input: {
  invoiceCount: number;
  lastRunAt: string | null;
  failed: boolean;
  formatWhen: (iso: string) => string;
}): string {
  const count = `${input.invoiceCount.toLocaleString('en-IN')} ${input.invoiceCount === 1 ? 'invoice' : 'invoices'}`;
  if (!input.lastRunAt) return 'Never fetched';
  const when = input.formatWhen(input.lastRunAt);
  return input.failed
    ? `${count} · last fetch failed ${when}`
    : `${count} · last fetched ${when}`;
}
