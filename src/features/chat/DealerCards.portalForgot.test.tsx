import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PortalLoginState } from '@dk/shared/types';

import { PortalLoginPreview } from './DealerCards';

// The team's picture of the owner's login box must show "Forgot password?" on the IRAS row
// wherever the dealer's app does: IRAS resets by an OTP to the registered mobile, by the
// user ID typed in the row or the one MDG has (`resetPossible`), and under a saved login.
afterEach(() => cleanup());

const state = (over: Partial<PortalLoginState>): PortalLoginState => ({
  portal: 'iras',
  needed: true,
  status: 'missing',
  ...over,
});

function row(states: PortalLoginState[], canEdit = true) {
  const { container } = render(
    <PortalLoginPreview portals={['iras']} states={states} failed={false} canEdit={canEdit} lang="en" />,
  );
  return within(container.querySelector<HTMLElement>('[data-portal="iras"]')!);
}

describe('the IRAS row in the team’s picture of the login box', () => {
  it('shows Forgot password? under the form when an ID is on record', () => {
    expect(row([state({ resetPossible: true })]).getByText('Forgot password?')).toBeInTheDocument();
  });

  it('shows Forgot password? under a saved login, with the Change link', () => {
    const saved = row([state({ status: 'saved', savedAt: new Date().toISOString(), savedBy: 'dealer' })]);
    expect(saved.getByText('Forgot password?')).toBeInTheDocument();
    expect(saved.getByText('Change')).toBeInTheDocument();
  });

  it('shows it on a refused login, where it matters most', () => {
    expect(row([state({ status: 'refused', resetPossible: true })]).getByText('Forgot password?')).toBeInTheDocument();
  });

  it('shows it to nobody who cannot fill the box, and not with no ID on record yet', () => {
    expect(row([state({ resetPossible: true })], false).queryByText('Forgot password?')).toBeNull();
    expect(row([state({})]).queryByText('Forgot password?')).toBeNull();
  });
});
