import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { FunnelReport, FunnelWindow } from '@dk/shared';

export const funnelKey = (days: FunnelWindow) => ['funnel', days] as const;

/**
 * The "Website → app" report (ADR 0059 §3) for the last `days` days: per website page,
 * the taps on "Ask in Kavach Shuruaat", the sign-ups that came with that page's tag, and
 * how many of those paid. Every admin. Counts only, so it is cheap to keep fresh.
 */
export function useFunnelQuery(days: FunnelWindow) {
  return useQuery({
    queryKey: funnelKey(days),
    queryFn: () => api.get<FunnelReport>('/admin/funnel', { days }),
    staleTime: 60_000,
  });
}
