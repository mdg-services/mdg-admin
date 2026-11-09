import { useMutation, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { KkSigninCode, KkSigninList } from '@dk/shared';

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

/**
 * "Show code": reads one sign-in code for ten minutes after it was asked for. Super-admin only; the server writes an audit
 * row first. `gcTime: 0` so the digits are not kept in the query cache once the row that asked has them: they live only in
 * that row's own state, and go when it does.
 */
export function useShowKkCode() {
  return useMutation({
    mutationFn: (id: string) => api.post<KkSigninCode>(`/admin/kk-signins/${id}/code`),
    gcTime: 0,
  });
}
