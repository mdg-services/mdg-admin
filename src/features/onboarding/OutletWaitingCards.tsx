import * as React from 'react';

import { useOnboardingBoardQuery } from '@/hooks/api/useOnboarding';

import { HeldMessagesSection } from './HeldMessagesSection';
import { PasswordHelpSection } from './PasswordHelpSection';

/**
 * What is waiting on MDG for ONE outlet, on its info page: messages held for its
 * first days (send or drop) and "forgot password" requests that matched one of its
 * people. The Dealers home shows the same for every outlet at once; these are the
 * same two cards narrowed to this outlet, so an admin who opens it from a call or a
 * chat does not have to go back to the list to find out. Each draws nothing when
 * there is nothing for this outlet.
 */
export function OutletWaitingCards({ dealerId }: { dealerId: string }) {
  const board = useOnboardingBoardQuery('open');
  const [now, setNow] = React.useState(() => Date.now());
  // Ages are relative ("3h 5m ago"); keep them honest on a page left open.
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <>
      <PasswordHelpSection rows={board.data?.passwordHelp ?? []} now={now} dealerId={dealerId} />
      <HeldMessagesSection now={now} dealerId={dealerId} />
    </>
  );
}
