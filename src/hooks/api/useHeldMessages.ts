import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { dropBody } from '@/lib/watchHold';
import type { HeldMessage, HeldMessageList } from '@dk/shared';

import { onboardingRoot, outletSetupRoot } from './useOnboarding';

/** Every held-message query hangs off this root, so one invalidation refreshes them all. */
export const heldMessagesRoot = ['held-messages'] as const;
export const heldMessagesKey = ['held-messages', 'waiting'] as const;

/**
 * The watch period's review queue: what is waiting for a person to send or drop
 * (`GET /admin/held-messages`, oldest first). Any admin.
 *
 * Kept fresh by `useHeldMessagesLive` (mounted once, in the shell), which refetches
 * on the server's `heldMessages:changed`; the poll covers a socket that dropped.
 */
export function useHeldMessagesQuery() {
  return useQuery({
    queryKey: heldMessagesKey,
    queryFn: () => api.get<HeldMessageList>('/admin/held-messages'),
    staleTime: 15_000,
    refetchInterval: 120_000,
  });
}

/**
 * What one decision changes: the queue, the count on every outlet's Setup card and
 * board row, and the alert that clears when the last message is decided. Run on
 * SETTLED so a failure (somebody else decided it first) also pulls the screen back
 * to the truth.
 */
function refreshAfterDecision(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: heldMessagesRoot });
  void qc.invalidateQueries({ queryKey: outletSetupRoot });
  void qc.invalidateQueries({ queryKey: onboardingRoot });
  void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
}

/** Send it: the server replays it into the chats it was held for, once. */
export function useSendHeldMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<HeldMessage>(`/admin/held-messages/${id}/send`, {}),
    onSettled: () => refreshAfterDecision(qc),
  });
}

/** Drop it, with the reason the next person will read. */
export function useDropHeldMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<HeldMessage>(`/admin/held-messages/${id}/drop`, dropBody(reason)),
    onSettled: () => refreshAfterDecision(qc),
  });
}

/**
 * Try the outlet's saved portal logins again (`POST /dealers/:id/portal-logins/check`):
 * one background try for each that was not tried or could not tell. Never a refused
 * one. The result lands on the Setup card's checklist; this answers which were queued.
 */
export function useCheckPortalLogins() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dealerId: string) =>
      api.post<{ queued: Array<'sdms' | 'iras'> }>(`/dealers/${dealerId}/portal-logins/check`, {}),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: outletSetupRoot });
      void qc.invalidateQueries({ queryKey: onboardingRoot });
    },
  });
}
