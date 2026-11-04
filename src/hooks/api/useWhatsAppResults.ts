import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { WhatsAppLine, WhatsAppResults } from '@dk/shared';

/** Every send's results, whichever one is open. */
export const whatsAppResultsRoot = ['whatsapp', 'results'] as const;

/**
 * What happened to the promotions we sent on WhatsApp, for one send or all of
 * them (`whatsapp/results.ts` on the server). Every admin, like the inbox.
 *
 * `send` undefined lets the server pick the newest send of `line` (the
 * marketing number when that is undefined too); `send` "all" with a `line` is
 * every send from that number. The previous answer stays on screen while
 * another send loads, so switching does not blink.
 */
export const whatsAppResultsKey = (send: string | undefined, line: WhatsAppLine | undefined) =>
  ['whatsapp', 'results', send ?? 'newest', line ?? 'any'] as const;

export function useWhatsAppResultsQuery(send: string | undefined, line: WhatsAppLine | undefined) {
  return useQuery({
    queryKey: whatsAppResultsKey(send, line),
    queryFn: () =>
      api.get<WhatsAppResults>('/admin/whatsapp/results', {
        ...(send ? { send } : {}),
        ...(line ? { line } : {}),
      }),
    placeholderData: keepPreviousData,
  });
}
