/**
 * Presentation helpers for Dealer Kavach — labels, intents and the one-line
 * explanations behind the states an admin has to read at a glance.
 *
 * Kept in one place because three surfaces now render the same vocabulary (the
 * global defaults editor, the per-dealer overlay tab and the dealer's Kavach
 * panel) and a status that reads "Held" on one screen and "Blocked" on another
 * is how an admin stops trusting either.
 */
import type { Intent } from '@/lib/statusIntent';
import type {
  KavachCadenceBucket,
  KavachDomain,
  KavachEvidenceMode,
  KavachItemStatus,
  KavachRequestState,
  KavachTier,
  KavachVerificationMode,
} from '@dk/shared';
import { KAVACH_COMPLIANT_STATUSES, KAVACH_PENDING_STATUSES } from '@dk/shared';

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

/**
 * Mirrors the server's `bucketFromCadenceDays`. Duplicated on purpose so the
 * defaults editor can show which group a task will land in BEFORE it is saved;
 * the server still derives the stored value, this never sends one.
 */
export function cadenceBucketFor(cadenceDays: number | null): KavachCadenceBucket {
  if (cadenceDays === null) return 'SOS';
  if (cadenceDays <= 1) return 'DAILY';
  if (cadenceDays <= 7) return 'WEEKLY';
  if (cadenceDays <= 15) return 'FORTNIGHTLY';
  if (cadenceDays <= 30) return 'MONTHLY';
  if (cadenceDays <= 90) return 'QUARTERLY';
  if (cadenceDays <= 180) return 'HALF_YEARLY';
  if (cadenceDays <= 365) return 'YEARLY';
  return 'BIENNIAL';
}

/** "Every 30 days" / "Every day" / "No clock". */
export function cadenceLabel(cadenceDays?: number | null): string {
  if (cadenceDays == null) return 'No clock';
  if (cadenceDays === 1) return 'Every day';
  return `Every ${cadenceDays} days`;
}

/* ─────────────────────────────── Item status ─────────────────────────────── */

/** Admin-facing status label (admins see machine truth, per spec §4). */
export const ITEM_STATUS_LABEL: Record<KavachItemStatus, string> = {
  VALID: 'Valid',
  EXPIRING_SOON: 'Expiring soon',
  EXPIRED: 'Expired',
  PAUSED: 'Paused',
  NOT_YET_VERIFIED: 'Never checked',
  HELD: 'Held — ours',
  SOS_OK: 'SOS OK',
  SOS_FLAGGED: 'SOS flagged',
};

/**
 * The sentence behind each status, for tooltips and legends. The two new states
 * are the whole reason this map exists: "Never checked" and "Held" both look
 * like failure on a chip and are not, and an admin who reads them as failure
 * will chase a dealer for something MDG has not done.
 */
export const ITEM_STATUS_HINT: Record<KavachItemStatus, string> = {
  VALID: 'Verified and still inside its cadence.',
  EXPIRING_SOON: 'Still valid, but due for another check shortly.',
  EXPIRED: 'The clock ran out and nobody has certified it since.',
  PAUSED: 'Excluded from this dealer’s score and from the work queue.',
  NOT_YET_VERIFIED:
    'Nobody at MDG has ever checked this. An absence, not a failure — and ours to close.',
  HELD:
    'The automation that proves this could not run. Our problem, not the dealer’s, so it counts as compliant until the hold lapses.',
  SOS_OK: 'Available on the last look. No clock — this one is event-driven.',
  SOS_FLAGGED: 'Flagged unavailable on a visit; a live non-compliance to act on.',
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
    // Neither is the dealer's failure, and neither is nothing: amber for the
    // automation we owe, blue for the look we have not taken yet.
    case 'HELD':
      return 'warning';
    case 'NOT_YET_VERIFIED':
      return 'info';
    case 'PAUSED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** "We owe this dealer a look." Reads the shared list so screens can't diverge. */
export function isPendingStatus(status: KavachItemStatus): boolean {
  return KAVACH_PENDING_STATUSES.includes(status);
}

/** Contributes its full points to the compliant numerator. */
export function isCompliantStatus(status: KavachItemStatus): boolean {
  return KAVACH_COMPLIANT_STATUSES.includes(status);
}

/* ──────────────────────────────── Tier ───────────────────────────────────── */

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

/* ─────────────────────────── Verification & evidence ─────────────────────── */

/** WHO may certify the task. The dealer is deliberately not an option. */
export const VERIFICATION_LABEL: Record<KavachVerificationMode, string> = {
  ADMIN: 'MDG admin',
  AUTOMATION: 'Automation',
  DEALER_EVIDENCE_THEN_ADMIN: 'Dealer evidence, then admin',
};

export const VERIFICATION_HINT: Record<KavachVerificationMode, string> = {
  ADMIN: 'An admin judges it, usually from a photo or a visit.',
  AUTOMATION: 'A portal or vault signal proves it. No human in the loop.',
  DEALER_EVIDENCE_THEN_ADMIN:
    'We ask the dealer for a photo or a note, then an admin rules on what they send.',
};

export function verificationIntent(mode: KavachVerificationMode): Intent {
  switch (mode) {
    case 'AUTOMATION':
      return 'success';
    case 'DEALER_EVIDENCE_THEN_ADMIN':
      return 'info';
    case 'ADMIN':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** WHAT the closing admin must attach. Not what the dealer must send. */
export const EVIDENCE_LABEL: Record<KavachEvidenceMode, string> = {
  NONE: 'Nothing',
  PHOTO: 'Photo',
  NOTE: 'Note',
  PHOTO_OR_NOTE: 'Photo or note',
};

export const EVIDENCE_HINT: Record<KavachEvidenceMode, string> = {
  NONE: 'The closer attaches nothing.',
  PHOTO: 'The closing admin must attach a photo.',
  NOTE: 'The closing admin must write a note.',
  PHOTO_OR_NOTE: 'The closing admin must attach a photo or write a note.',
};

/* ───────────────────────────── Evidence exchange ─────────────────────────── */

export const REQUEST_STATE_LABEL: Record<KavachRequestState, string> = {
  NONE: 'Nothing outstanding',
  ASKED: 'Waiting on dealer',
  SUBMITTED: 'Dealer replied — needs review',
  REJECTED: 'Sent back to dealer',
};

export function requestStateIntent(state: KavachRequestState): Intent {
  switch (state) {
    case 'SUBMITTED':
      return 'warning';
    case 'ASKED':
      return 'info';
    case 'REJECTED':
      return 'danger';
    case 'NONE':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/* ──────────────────────────────── Domain ─────────────────────────────────── */

export const KAVACH_DOMAIN_ORDER: KavachDomain[] = [
  'daily-ops',
  'cleanliness',
  'safety',
  'statutory-license',
  'sdms-filing',
  'documentation-display',
  'equipment',
];

export const KAVACH_DOMAIN_LABEL: Record<KavachDomain, string> = {
  'daily-ops': 'Daily ops',
  cleanliness: 'Cleanliness',
  safety: 'Safety',
  'statutory-license': 'Statutory / license',
  'sdms-filing': 'SDMS filing',
  'documentation-display': 'Documentation / display',
  equipment: 'Equipment',
};

/* ──────────────────────────────── Score ──────────────────────────────────── */

/**
 * "Days since anyone at MDG verified anything here" → intent.
 *
 * This is the one alarm for the failure mode ADR 0011 introduces: not a dealer
 * ignoring us, but US not getting round to a dealer. `null` means nobody ever
 * has, which is the worst case and reads as such.
 */
export function stalenessIntent(days: number | null, staleAfter: number): Intent {
  if (days === null) return 'danger';
  if (days >= staleAfter * 2) return 'danger';
  if (days >= staleAfter) return 'warning';
  return 'success';
}

/** Operational-% → semantic intent (≥90 green, ≥70 amber, else red). */
export function operationalIntent(pct: number): Intent {
  if (pct >= 90) return 'success';
  if (pct >= 70) return 'warning';
  return 'danger';
}

/**
 * The percentage, and what it does not know, in one line.
 *
 * A bare "97%" hides the eleven tasks nobody has looked at and the two the
 * automation could not prove. Once the number is MDG's own statement about a
 * dealer, it has to be sayable with its own gaps attached, so every surface
 * that prints the score prints this string instead.
 */
export function scoreDisclosureParts(input: {
  overallPct: number;
  notYetVerifiedCount: number;
  heldCount: number;
}): string[] {
  const parts = [`${Math.round(input.overallPct)}%`];
  if (input.notYetVerifiedCount > 0) {
    parts.push(`${input.notYetVerifiedCount} never checked`);
  }
  if (input.heldCount > 0) parts.push(`${input.heldCount} held`);
  return parts;
}

/** The same disclosure as one line, for anywhere a single string is needed. */
export function scoreDisclosure(input: {
  overallPct: number;
  notYetVerifiedCount: number;
  heldCount: number;
}): string {
  return scoreDisclosureParts(input).join(' · ');
}

/** A local key for an unsaved overlay row (custom tasks have no code yet). */
export function makeLocalId(): string {
  return `local-${Math.random().toString(36).slice(2, 10)}`;
}
