import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { LaptopBridgeStatus } from '@dk/shared';

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
