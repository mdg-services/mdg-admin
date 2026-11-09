import type { OilCompanyId, PortalId, PortalLoginState } from '@dk/shared';

// By path, not from '@dk/shared': the check script (`tsx --test`) resolves the package to its
// compiled `dist/`, which these tables are newer than (`lib/onboarding.ts` does the same).
import { PORTAL_NAMES, XTRAPOWER_PORTAL } from '../../shared/src/types/portalLogin';

import { companyPortalIds } from './onboarding';

/**
 * Plain-words helpers for the "Ask for portal login" box. Kept free of React so
 * the decisions (which logins to offer, what to pre-tick, what to say) can be read
 * in one place — this app has no test runner; `scripts/portalLogin.check.ts` runs them.
 */

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});

function day(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : DATE_FMT.format(d);
}

/** "SDMS", "SDMS and IRAS", "BPCL portal" — the logins named in a sentence. */
export function portalNames(portals: readonly PortalId[]): string {
  return portals.map((p) => PORTAL_NAMES[p]).join(' and ');
}

/** "SDMS login, IRAS login", "BPCL portal login" — the label under a login-box message in the thread. */
export function portalLoginAskedLabel(portals: readonly PortalId[]): string {
  return portals.map((p) => `${PORTAL_NAMES[p]} login`).join(', ');
}

/**
 * The logins to offer for an outlet: only its company's portals (SDMS and IRAS for Indian
 * Oil, the one company portal for BPCL or HPCL), in the order the dealer is asked. The
 * server answers with every portal the outlet has a row for, so a BPCL outlet's list still
 * carries SDMS and IRAS, and an Indian Oil outlet that once saved a BPCL login carries
 * that: neither is the outlet's to be asked for. A portal the server did not send is not
 * invented. An outlet with no company on record is Indian Oil.
 */
export function loginsOfCompany(
  states: readonly PortalLoginState[],
  company: OilCompanyId | null | undefined,
): PortalLoginState[] {
  return companyPortalIds(company).flatMap((portal) => states.filter((s) => s.portal === portal));
}

/**
 * The logins an outlet is asked for only when the team decides it needs one: IOC
 * XtraPower, for an Indian Oil outlet (no company on record is Indian Oil). Offered in
 * the ask after the company's own logins, unticked until it has been asked once. The
 * server lists no row for it before the first ask, so one is drawn as "not asked yet".
 */
export function onDemandLogins(
  states: readonly PortalLoginState[],
  company: OilCompanyId | null | undefined,
): PortalLoginState[] {
  if ((company ?? 'iocl') !== 'iocl') return [];
  const row = states.find((s) => s.portal === XTRAPOWER_PORTAL);
  return [row ?? { portal: XTRAPOWER_PORTAL, needed: false, status: 'missing' }];
}

/**
 * Does the ask come with the explainer video? The video explains the SDMS and IRAS logins,
 * so it is offered only when one of them is being asked for; a company portal (BPCL, HPCL)
 * or IOC XtraPower is asked for on its own, with nothing about what it is used for.
 */
export function offersExplainerVideo(portals: readonly PortalId[]): boolean {
  return portals.some((p) => p === 'sdms' || p === 'iras');
}

/** The one-line status an admin reads next to a login. */
export function describeLoginStatus(s: PortalLoginState): string {
  if (s.status === 'refused') {
    const when = day(s.refusedAt);
    return when
      ? `Old password not working since ${when}`
      : 'Old password not working';
  }
  if (s.status === 'saved') {
    const when = day(s.savedAt);
    const on = when ? ` on ${when}` : '';
    return s.savedBy === 'dealer'
      ? `Saved by the owner in the app${on}`
      : `Saved by MDG${on}`;
  }
  if (s.portal === XTRAPOWER_PORTAL) {
    return s.needed ? 'Asked, not filled in yet' : 'Asked only when needed. Not asked yet';
  }
  return s.needed ? 'Needed' : 'Not needed for this outlet';
}

/** True when the login is the kind to worry about: absent or refused. */
export function loginNeedsAttention(s: PortalLoginState): boolean {
  return s.needed && s.status !== 'saved';
}

/** The logins to tick when the box opens: needed and not saved. */
export function defaultTicked(states: readonly PortalLoginState[]): PortalId[] {
  return states.filter(loginNeedsAttention).map((s) => s.portal);
}

/** What the toast says after an ask went into the owners' chats. */
export function describeAskResult(result: {
  posted: number;
  portals: readonly PortalId[];
  video: boolean;
}): string {
  const who = result.posted === 1 ? 'the owner' : `${result.posted} owners`;
  const base = `Asked ${who} for the ${portalNames(result.portals)} login in their chat`;
  return result.video ? `${base}, with the explainer video.` : `${base}.`;
}
