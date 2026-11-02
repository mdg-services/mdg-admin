import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { LaptopBridgeStatus, SummonPortal, SummonView } from '@dk/shared';

export const LAPTOP_BRIDGE_KEY = ['laptopBridge'] as const;

/**
 * Is the super-admin's laptop bridge up (ADR 0030)? Read only for super-admins:
 * the route refuses everyone else, and their buttons never offer the laptop.
 */
export function useLaptopBridge(enabled: boolean) {
  return useQuery({
    queryKey: LAPTOP_BRIDGE_KEY,
    queryFn: () => api.get<LaptopBridgeStatus>('/laptop-bridge'),
    enabled,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
  });
}

/** Open a dealer's portal on the laptop, signed in. */
export function useSummon() {
  return useMutation({
    mutationFn: (input: { dealerId: string; portal: SummonPortal }) =>
      api.post<SummonView>('/laptop-bridge/summon', input),
  });
}

/** Where a summoned window stands, re-read every two seconds until it settles. */
export function useSummonStatus(dealerId: string, summonId: string | null) {
  return useQuery({
    queryKey: ['summon', dealerId, summonId],
    queryFn: () => api.get<SummonView>(`/laptop-bridge/summon/${dealerId}/${summonId}`),
    enabled: !!summonId,
    // Until the window settles; never after an error (the server forgets a window
    // when it restarts, and asking every two seconds would then go on for ever).
    refetchInterval: (query) =>
      query.state.status === 'error' ||
      (query.state.data && !['opening', 'signing_in'].includes(query.state.data.state))
        ? false
        : 2_000,
    retry: false,
  });
}
