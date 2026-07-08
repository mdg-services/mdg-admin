/**
 * Presentation helpers for the Staff Points work catalog (domains, units,
 * distributions) shared across the dealer Staff tab, the per-dealer Work-list
 * tab, and the super-admin Work-list-defaults page. Keeps bilingual/label copy
 * in one place so the three surfaces stay consistent.
 */
import type {
  StaffPointDistribution,
  StaffWorkDomain,
  StaffWorkUnit,
} from '@dk/shared';

export const DOMAIN_ORDER: StaffWorkDomain[] = [
  'cleaning',
  'du',
  'equipment',
  'automation',
  'tanker',
  'sales',
  'office',
  'customer',
  'misc',
];

export const DOMAIN_LABELS: Record<StaffWorkDomain, string> = {
  cleaning: 'Cleaning',
  du: 'Dispensing units',
  equipment: 'Equipment',
  automation: 'Automation',
  tanker: 'Tanker',
  sales: 'Sales',
  office: 'Office',
  customer: 'Customer',
  misc: 'Miscellaneous',
};

export const UNIT_LABELS: Record<StaffWorkUnit, string> = {
  vehicle: 'per vehicle',
  'rupee-1000': 'per ₹1,000',
  guest: 'per guest',
  customer: 'per customer',
  transaction: 'per transaction',
  item: 'per item',
  tank: 'per tank',
  photo: 'per photo',
};

export const DISTRIBUTION_LABELS: Record<StaffPointDistribution, string> = {
  FLAT: 'Flat (each worker)',
  SPLIT: 'Split among workers',
  EACH: 'Each worker (full)',
  PER_UNIT: 'Per unit',
};

export function domainLabel(d: StaffWorkDomain): string {
  return DOMAIN_LABELS[d];
}

export function unitLabel(u?: StaffWorkUnit): string {
  return u ? UNIT_LABELS[u] : '';
}

export function distributionLabel(d: StaffPointDistribution): string {
  return DISTRIBUTION_LABELS[d];
}

/** Trim points to at most 2 dp, dropping trailing zeros (points may be fractional). */
export function fmtPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** Local YYYY-MM-DD (used as the default workDate for awards). */
export function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** A short, non-cryptographic id for keying local-only list rows. */
export function makeLocalId(): string {
  return `local-${Math.random().toString(36).slice(2, 10)}`;
}
