import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { KkSigninList } from '@dk/shared';

export const kkSigninsKey = (days: number, phone: string) => ['kk-signins', days, phone] as const;

/**
 * Every ask for a Khata Kavach WhatsApp code in the last `days`, each with what WhatsApp did with it.
 * `phone` is the last 4 to 10 digits of a number, or empty for everyone. Super-admin only.
 */
export function useKkSigninsQuery(days: number, phone: string) {
  return useQuery({
    queryKey: kkSigninsKey(days, phone),
    queryFn: () =>
      api.get<KkSigninList>('/admin/kk-signins', { days, ...(phone ? { phone } : {}) }),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}
