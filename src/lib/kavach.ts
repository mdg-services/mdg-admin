import type { Intent } from '@/lib/statusIntent';
import type {
  KavachCadenceBucket,
  KavachItemStatus,
  KavachTier,
  TicketPriority,
} from '@dk/shared';


/** Human label for a cadence bucket (admin-grade, ALL-CAPS enum → Title case). */
export const CADENCE_BUCKET_LABEL: Record<KavachCadenceBucket, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  FORTNIGHTLY: 'Fortnightly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half-yearly',
  YEARLY: 'Yearly',
  BIENNIAL: 'Biennial',
  SOS: 'On event (SOS)',
};

/** Stable display order for the grouped item list. */
export const CADENCE_BUCKET_ORDER: KavachCadenceBucket[] = [
  'DAILY',
  'WEEKLY',
  'FORTNIGHTLY',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
  'BIENNIAL',
  'SOS',
];

/** Admin-facing status label (admins see machine truth, per spec §4). */
export const ITEM_STATUS_LABEL: Record<KavachItemStatus, string> = {
  VALID: 'Valid',
  EXPIRING_SOON: 'Expiring soon',
  EXPIRED: 'Expired',
  PAUSED: 'Paused',
  SOS_OK: 'SOS OK',
  SOS_FLAGGED: 'SOS flagged',
};

export function itemStatusIntent(status: KavachItemStatus): Intent {
  switch (status) {
    case 'VALID':
    case 'SOS_OK':
      return 'success';
    case 'EXPIRING_SOON':
      return 'warning';
    case 'EXPIRED':
    case 'SOS_FLAGGED':
      return 'danger';
    case 'PAUSED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export const TIER_LABEL: Record<KavachTier, string> = {
  CRITICAL: 'Critical',
  STANDARD: 'Standard',
  LIGHT: 'Light',
};

export function tierIntent(tier: KavachTier): Intent {
  switch (tier) {
    case 'CRITICAL':
      return 'danger';
    case 'STANDARD':
      return 'warning';
    case 'LIGHT':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function priorityIntent(priority?: TicketPriority): Intent {
  switch (priority) {
    case 'urgent':
    case 'high':
      return 'danger';
    case 'normal':
      return 'warning';
    case 'low':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Operational-% → semantic intent (≥90 green, ≥70 amber, else red). */
export function operationalIntent(pct: number): Intent {
  if (pct >= 90) return 'success';
  if (pct >= 70) return 'warning';
  return 'danger';
}
