import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { ServicePackageState } from '@dk/shared';

/**
 * The standard package's progress for one outlet. Polled every 15 seconds while
 * a setup is working through its steps, every two minutes while it waits on a
 * login, and not at all once it is blocked or done — nothing moves then until a
 * person presses something.
 */
export function useServicePackageQuery(dealerId: string | undefined) {
  return useQuery({
    queryKey: ['servicePackage', dealerId],
    queryFn: () => api.get<ServicePackageState>(`/dealers/${dealerId}/service-package`),
    enabled: !!dealerId,
    refetchInterval: (q) => {
      const status = q.state.data?.setup?.status;
      if (status === 'running') return 15_000;
      if (status === 'waiting') return 120_000;
      return false;
    },
  });
}

/** Start the package, or "Try again" on a blocked one. */
export function useStartServicePackage(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ServicePackageState>(`/dealers/${dealerId}/service-package/start`, {}),
    onSuccess: (data) => {
      qc.setQueryData(['servicePackage', dealerId], data);
      qc.invalidateQueries({ queryKey: ['dealerServices', dealerId] });
    },
  });
}
