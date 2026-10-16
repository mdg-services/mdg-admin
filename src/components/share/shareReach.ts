import {
  OWNERS_ONLY_AUDIENCES,
  OWNERS_ONLY_REASON,
  SHARE_AUDIENCES,
  type ShareAudience,
} from '@dk/shared';

/**
 * Who holds one sent item — a card, a plan, a report — next to who is on the
 * app, as the server's `reach` field carries it. Pure, so the "who has it" line
 * and the "send to the people who missed it" button decide the same way on
 * every screen (this app has no test runner; keep the logic here, not in JSX).
 */
export interface ShareReachView {
  outlet: { owners: number; manager: boolean };
  holders: { owners: number; manager: boolean };
  /** Sent before MDG recorded every copy: the counts may be short. */
  unrecorded: boolean;
}

/** "2 owners and the manager", "the manager", "nobody". */
export function holdersPhrase(h: { owners: number; manager: boolean }): string {
  const parts: string[] = [];
  if (h.owners > 0) parts.push(h.owners === 1 ? '1 owner' : `${h.owners} owners`);
  if (h.manager) parts.push('the manager');
  return parts.length > 0 ? parts.join(' and ') : 'nobody';
}

/** "Has it: 2 owners and the manager." — or the honest version for an old record. */
export function reachSummary(view: ShareReachView): string {
  if (view.unrecorded) return 'Sent before MDG recorded who got it.';
  return `Has it: ${holdersPhrase(view.holders)}.`;
}

/**
 * The people on the app who do not have it yet, limited to the audiences this
 * item may go to. Zero owners and no manager means there is nobody to send it to.
 */
export function missingPeople(
  view: ShareReachView,
  allowed: readonly ShareAudience[] = SHARE_AUDIENCES,
): { owners: number; manager: boolean } {
  const ownersOk = allowed.includes('owners') || allowed.includes('both');
  const managerOk = allowed.includes('managers') || allowed.includes('both');
  return {
    owners: ownersOk ? Math.max(0, view.outlet.owners - view.holders.owners) : 0,
    manager: managerOk && view.outlet.manager && !view.holders.manager,
  };
}

/** True when a "send to the people who missed it" button has somebody to reach. */
export function hasMissingPeople(
  view: ShareReachView,
  allowed: readonly ShareAudience[] = SHARE_AUDIENCES,
): boolean {
  const m = missingPeople(view, allowed);
  return m.owners > 0 || m.manager;
}

/** The audience that reaches exactly the missing people, or null when nobody is missing. */
export function audienceForMissing(
  view: ShareReachView,
  allowed: readonly ShareAudience[] = SHARE_AUDIENCES,
): ShareAudience | null {
  const m = missingPeople(view, allowed);
  if (m.owners > 0 && m.manager) return 'both';
  if (m.owners > 0) return 'owners';
  if (m.manager) return 'managers';
  return null;
}

/* ───────────── Choices a menu leaves dead, and why ───────────── */

/**
 * Why a choice the menu lists is dead: one sentence for all of them, or a
 * function of the choice when they are dead for different reasons.
 */
export type UnavailableReason = string | ((audience: ShareAudience) => string);

/** The hint under a dead choice. A menu with no reason of its own says so plainly. */
export function unavailableHint(
  reason: UnavailableReason | undefined,
  audience: ShareAudience,
): string {
  if (reason === undefined) return 'Not available for this report';
  return typeof reason === 'function' ? reason(audience) : reason;
}

/** Who is on the app at an outlet, in people. */
export interface OutletPeopleView {
  owners: number;
  manager: boolean;
}

/** Said under Owners when the outlet has no owner on the app. Same words as the Today board. */
export const NO_OWNER_ON_APP = 'No owner on the app yet';

/**
 * The menu of an OWNERS-ONLY card (Credit & DOD, Ledger Watch) before a first
 * send. Manager and Both are always dead, with the owners-only rule as the
 * reason. When the outlet is known to have no owner on the app, Owners is dead
 * too, with {@link NO_OWNER_ON_APP} — otherwise the admin picks Owners, confirms,
 * and only then hears the server say there is nobody to send it to.
 *
 * `outlet` unknown (the outlet could not be read) leaves Owners open: the
 * server still refuses a send that cannot be made.
 */
export function ownersOnlyMenu(outlet: OutletPeopleView | null | undefined): {
  allowed: readonly ShareAudience[];
  unavailableReason: (audience: ShareAudience) => string;
  /** True when nobody can be sent it, so the screen can say so in plain text too. */
  noOwner: boolean;
} {
  const noOwner = !!outlet && outlet.owners === 0;
  return {
    allowed: noOwner ? [] : OWNERS_ONLY_AUDIENCES,
    unavailableReason: (audience) =>
      audience === 'owners' && noOwner ? NO_OWNER_ON_APP : OWNERS_ONLY_REASON,
    noOwner,
  };
}

/** The line under the button of an owners-only card when no owner is on the app. */
export const NO_OWNER_NOTE =
  'No owner from this outlet is on the app yet, so this cannot be sent. Credit figures go to owners only.';
