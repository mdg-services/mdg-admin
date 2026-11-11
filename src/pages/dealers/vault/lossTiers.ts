/**
 * The two-tier loss allowance in plain words, for the two places an admin reads
 * it: the variation note on a report, and the product's setup.
 *
 * MDG 2024 §5.1.11 gives a fuel one evaporation-and-handling rate up to an
 * annual quantity (600 KL) and a lower one beyond. The setup stores the annual
 * threshold; a report stores the threshold already spread over the days it
 * covers. These turn either into a sentence, so a reader sees the two rates
 * rather than one blended percent that matches neither.
 */
import type { DsrLossTiers, DsrVariationSummary } from '@dk/shared';

const LITRES = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** `0.2` → `0.20%` — MDG's own figures carry two decimals (0.75 / 0.60 / 0.25 / 0.20). */
function rate(pct: number): string {
  return `${pct.toFixed(2)}%`;
}

function litres(n: number): string {
  return `${LITRES.format(Math.round(n))} L`;
}

type ReportTiers = NonNullable<DsrVariationSummary['breakdown']['lossTiers']>;

/** Whether a stored tier block is complete enough to print. */
function usable(t: Partial<Record<keyof ReportTiers, unknown>> | null | undefined): boolean {
  return (
    !!t &&
    Number.isFinite(t.firstPct) &&
    Number.isFinite(t.restPct) &&
    Number.isFinite(t.thresholdLitres)
  );
}

/**
 * What a report's variation note says about the evaporation allowance when the
 * product uses two tiers: `0.25% on the first 49,315 L sold and 0.20% beyond`.
 * `null` when the report carries no tiers (or an unreadable block), so the
 * caller keeps its one-rate wording.
 */
export function reportTiersSentence(tiers: ReportTiers | null | undefined): string | null {
  if (!tiers || !usable(tiers)) return null;
  return `${rate(tiers.firstPct)} on the first ${litres(tiers.thresholdLitres)} sold and ${rate(tiers.restPct)} beyond`;
}

/**
 * What a product's setup says: `0.25% on the first 6,00,000 L sold in a year and
 * 0.20% beyond`. `null` when the product has no tiers.
 */
export function setupTiersSentence(tiers: DsrLossTiers | null | undefined): string | null {
  if (
    !tiers ||
    !Number.isFinite(tiers.firstPct) ||
    !Number.isFinite(tiers.restPct) ||
    !Number.isFinite(tiers.annualThresholdLitres)
  ) {
    return null;
  }
  return `${rate(tiers.firstPct)} on the first ${litres(tiers.annualThresholdLitres)} sold in a year and ${rate(tiers.restPct)} beyond`;
}
