import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, api } from '@/lib/api';
import type { ShareAudience, YourVideosAdminView } from '@dk/shared';

/**
 * What an outlet's people have watched of the "your videos" list, as the team reads it
 * (`GET /dealers/:id/your-videos`): every video in the list for this outlet, whether the
 * outlet has its service, and who has watched it. Also the Send: the list goes into the
 * outlet's chats (`POST /dealers/:id/your-videos/send`).
 *
 * `null` from the read is a server that does not have the list (404): an answer, not a
 * failure. The card hides and the chat shows a plain label; it is never returned for a real error.
 */
export const yourVideosAdminKey = (dealerId: string | undefined) => ['yourVideosAdmin', dealerId] as const;

export function useYourVideosAdmin(dealerId: string | undefined) {
  return useQuery({
    queryKey: yourVideosAdminKey(dealerId),
    queryFn: async (): Promise<YourVideosAdminView | null> => {
      try {
        const view = await api.get<YourVideosAdminView>(`/dealers/${dealerId}/your-videos`);
        return view && Array.isArray(view.rows) ? view : null;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!dealerId,
    // Ticks arrive while a dealer watches: look again when the team comes back to the tab.
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

/** Put the list in the outlet's chats. `audience` absent = owners and the manager. */
export function useSendYourVideos(dealerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (audience?: ShareAudience) =>
      api.post<{ posted: number }>(`/dealers/${dealerId}/your-videos/send`, audience ? { audience } : {}),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: yourVideosAdminKey(dealerId) });
    },
  });
}
