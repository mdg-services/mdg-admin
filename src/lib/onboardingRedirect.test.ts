import { describe, expect, it } from 'vitest';

import { onboardingRedirectTarget } from './onboardingRedirect';

describe('onboardingRedirectTarget', () => {
  it('sends the plain old link to the open list of the Dealers page', () => {
    expect(onboardingRedirectTarget('')).toBe('/dealers?view=onboarding');
    expect(onboardingRedirectTarget('?utm=push')).toBe('/dealers?view=onboarding');
  });

  it('keeps the old Live and Lost tabs as the new Live and Closed ones', () => {
    expect(onboardingRedirectTarget('?view=live')).toBe('/dealers?view=onboarding&stage=live');
    expect(onboardingRedirectTarget('?view=lost')).toBe('/dealers?view=onboarding&stage=lost');
  });

  it('ignores a view it does not know', () => {
    expect(onboardingRedirectTarget('?view=open')).toBe('/dealers?view=onboarding');
    expect(onboardingRedirectTarget(new URLSearchParams('view=whatever'))).toBe(
      '/dealers?view=onboarding',
    );
  });
});
