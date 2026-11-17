/**
 * Where an old `/onboarding` (or `/registrations`) link lands now: the Dealers page's
 * Onboarding view. The old page's `?view=live|lost` becomes that view's Live / Closed
 * switch (`stage=live|lost`); anything else is the open list. Alerts, bookmarks and the
 * phone's push links still carry the old address, so this must keep working.
 */
export function onboardingRedirectTarget(search: string | URLSearchParams): string {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const old = params.get('view');
  const stage = old === 'live' ? '&stage=live' : old === 'lost' ? '&stage=lost' : '';
  return `/dealers?view=onboarding${stage}`;
}
