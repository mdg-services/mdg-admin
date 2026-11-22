import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { TankerDocumentsView, TankerExpiringView } from '@dk/shared';

export const tankerDocumentKeys = {
  dealer: (dealerId: string | null | undefined) => ['tankerDocuments', 'dealer', dealerId] as const,
  expiring: ['tankerDocuments', 'expiring'] as const,
};

/**
 * `GET /dealers/:id/tanker-documents` — one outlet's tanker papers as the daily IndianOil
 * Partners read stored them, grouped by vehicle, each with its verdict and how many reminders
 * the dealer has been told. Empty `vehicles` means nothing has been read for this outlet yet.
 */
export function useTankerDocumentsQuery(dealerId: string | null | undefined) {
  return useQuery({
    queryKey: tankerDocumentKeys.dealer(dealerId),
    queryFn: () => api.get<TankerDocumentsView>(`/dealers/${dealerId}/tanker-documents`),
    enabled: !!dealerId,
    staleTime: 60_000,
  });
}

/**
 * `GET /tanker-documents/expiring` — every tanker paper, across outlets, that has run out or
 * is inside the reminder window, soonest first. The team's "who needs a nudge" list.
 */
export function useExpiringTankerDocumentsQuery() {
  return useQuery({
    queryKey: tankerDocumentKeys.expiring,
    queryFn: () => api.get<TankerExpiringView>('/tanker-documents/expiring'),
    staleTime: 60_000,
  });
}
