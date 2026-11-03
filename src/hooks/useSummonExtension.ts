import * as React from 'react';

import { API_BASE_URL } from '@/lib/api';
import type { SummonResult, SummonTicket } from '@dk/shared';

/**
 * The Dealer Kavach Summon extension (ADR 0030), as this page sees it.
 *
 * The extension marks the page when it is installed (`data-dk-summon` on <html>,
 * set before the app loads, plus a "ready" message), and carries a ticket to a new
 * tab: it logs out of that portal in this browser, signs in, and answers here.
 */
export function useSummonExtension(): {
  installed: boolean;
  send: (ticket: SummonTicket) => Promise<SummonResult>;
} {
  const [installed, setInstalled] = React.useState(
    () =>
      typeof document !== 'undefined' && !!document.documentElement.getAttribute('data-dk-summon'),
  );
  React.useEffect(() => {
    const on = (e: MessageEvent): void => {
      if (e.source === window && e.data?.source === 'dk-summon-ext' && e.data.type === 'ready')
        setInstalled(true);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);

  const send = React.useCallback(
    (ticket: SummonTicket) =>
      new Promise<SummonResult>((resolve) => {
        const timer = window.setTimeout(() => {
          window.removeEventListener('message', on);
          resolve({
            summonId: ticket.summonId,
            state: 'needs_you',
            message: `The ${ticket.label} tab is taking a while. Look at it; sign in by hand if it is not filled.`,
          });
        }, 120_000);
        function on(e: MessageEvent): void {
          const result = e.data?.result as SummonResult | undefined;
          if (e.source !== window || e.data?.source !== 'dk-summon-ext' || e.data.type !== 'result')
            return;
          if (result?.summonId !== ticket.summonId) return;
          window.clearTimeout(timer);
          window.removeEventListener('message', on);
          resolve(result);
        }
        window.addEventListener('message', on);
        // To this page's own extension listener only: same window, same origin.
        window.postMessage(
          { source: 'dk-admin', type: 'summon', ticket, apiBase: API_BASE_URL },
          window.location.origin,
        );
      }),
    [],
  );
  return { installed, send };
}
