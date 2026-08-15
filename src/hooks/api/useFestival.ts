import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { FestivalSettingsView } from '@dk/shared';
import type { UpdateFestivalInput } from '@dk/shared/schemas';

export const festivalKey = ['festival'] as const;

/**
 * The festival catalog + the saved setting + the window it resolves to on the
 * SERVER's IST today (super-admin only).
 *
 * `staleTime: 0` on purpose. Everything on this screen is a statement about
 * today — "live", "2 days left", "ends tomorrow" — and a cached answer from
 * yesterday is exactly the lie the screen exists to prevent.
 */
export function useFestivalQuery() {
  return useQuery({
    queryKey: festivalKey,
    queryFn: () => api.get<FestivalSettingsView>('/super-admin/festival'),
    staleTime: 0,
  });
}

export function useUpdateFestival() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateFestivalInput) =>
      api.put<FestivalSettingsView>('/super-admin/festival', input),
    onSuccess: (data) => qc.setQueryData(festivalKey, data),
  });
}
