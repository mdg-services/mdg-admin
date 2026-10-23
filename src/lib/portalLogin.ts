import { PORTAL_NAMES, type PortalId, type PortalLoginState } from '@dk/shared';

/**
 * Plain-words helpers for the "Ask for portal login" box. Kept free of React so
 * the decisions (what to pre-tick, what to say) can be read in one place — this
 * app has no test runner.
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

/** "SDMS", "SDMS and IRAS" — the logins named in a sentence. */
export function portalNames(portals: readonly PortalId[]): string {
  return portals.map((p) => PORTAL_NAMES[p]).join(' and ');
}

/** "SDMS login, IRAS login" — the label under a login-box message in the thread. */
export function portalLoginAskedLabel(portals: readonly PortalId[]): string {
  return portals.map((p) => `${PORTAL_NAMES[p]} login`).join(', ');
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
