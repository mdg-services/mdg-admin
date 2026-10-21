import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { api } from '@/lib/api';
import type { WhatsAppResults } from '@dk/shared';

/**
 * What happened to the promotions we sent on WhatsApp, for one send or all of
 * them (`whatsapp/results.ts` on the server). Gated on `useIsSuperAdmin()` as
 * well as the endpoint's own `requireSuperAdmin`, like the inbox.
 *
 * `send` undefined lets the server pick the newest send. The previous answer
 * stays on screen while another send loads, so switching does not blink.
 */
export const whatsAppResultsKey = (send: string | undefined) =>
  ['whatsapp', 'results', send ?? 'newest'] as const;

export function useWhatsAppResultsQuery(send: string | undefined) {
  const isSuperAdmin = useIsSuperAdmin();
  return useQuery({
    queryKey: whatsAppResultsKey(send),
    queryFn: () => api.get<WhatsAppResults>('/admin/whatsapp/results', send ? { send } : undefined),
    enabled: isSuperAdmin,
    placeholderData: keepPreviousData,
  });
}
