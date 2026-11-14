import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, api } from '@/lib/api';
import type { OutletDetailsView } from '@dk/shared';
import type { SaveOutletDetailsInput } from '@dk/shared/schemas';

/**
 * The Pump details form (the dealer's "पंप की जानकारी"), as an admin reads and fills it
 * for an outlet. Both calls answer `{ ok: true, data }`, which `api` unwraps, and both
 * answer the whole view: the questions as the SERVER defines them, each with the
 * outlet's answer. Nothing here knows a question, so a new question needs no change.
 */
export const outletDetailsRoot = ['outletDetails'] as const;
export const outletDetailsKey = (dealerId: string | undefined) =>
  ['outletDetails', dealerId] as const;

/**
 * `GET /dealers/:id/outlet-details`, or `null` when the server answers 404: a server
 * that has not got the form yet. That is an answer, not a failure — the card hides
 * and the chat shows a plain label — and it must never be returned for a real error.
 */
export function useOutletDetails(dealerId: string | undefined) {
  return useQuery({
    queryKey: outletDetailsKey(dealerId),
    queryFn: async (): Promise<OutletDetailsView | null> => {
      try {
        const view = await api.get<OutletDetailsView>(`/dealers/${dealerId}/outlet-details`);
        // Defensive: a body without a question list is not the form.
        return view && Array.isArray(view.questions) ? view : null;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!dealerId,
    staleTime: 15_000,
  });
}

/**
 * `PUT /dealers/:id/outlet-details`: fill (or change) answers for the dealer. Only the
 * questions in the body change. The server answers the fresh view, which replaces the
 * cached one at once.
 *
 * The state the pump stands in decides which bank holidays move the outlet's Credit &
 * DOD deadline, so a save also refreshes the Bank holidays page ("outlets with no
 * state") and the alerts, which clear the moment the outlet has its state. Run on
 * SETTLED so a failed save also pulls the screen back to the truth.
 */
export function useSaveOutletDetails(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveOutletDetailsInput) =>
      api.put<OutletDetailsView>(`/dealers/${dealerId}/outlet-details`, body),
    onSuccess: (view) => {
      qc.setQueryData<OutletDetailsView | null>(outletDetailsKey(dealerId), view);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: outletDetailsKey(dealerId) });
      void qc.invalidateQueries({ queryKey: ['bankHolidays'] });
      void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
    },
  });
}
