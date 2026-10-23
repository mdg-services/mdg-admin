import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { catalogFrom } from '@/lib/guideVideos';
import { useAuthStore } from '@/store/auth';
import type { GuideVideoAdminItem, GuideVideoPlay } from '@dk/shared';

/**
 * MDG's video library, as the portal's "How this works" reads it.
 *
 * `GET /admin/guide-videos` lists every video — the team's own, the dealers',
 * the WhatsApp-only one — with who it is for, its chapters and whether the file
 * is uploaded yet. It is asked for only while a "How this works" dialog is open,
 * so a screen nobody asks help on never makes the call, and the answer is shared
 * by all the dialogs for a few minutes.
 */
export const guideVideoLibraryKey = ['guide-videos', 'admin'] as const;

export function useGuideVideoLibrary(enabled: boolean) {
  const signedIn = useAuthStore((s) => !!s.token);
  return useQuery({
    queryKey: guideVideoLibraryKey,
    enabled: enabled && signedIn,
    staleTime: 5 * 60_000,
    queryFn: async () => catalogFrom(await api.get<GuideVideoAdminItem[]>('/admin/guide-videos')),
  });
}

/**
 * One video with a fresh signed link (`GET /admin/guide-videos/:id`), from a
 * chapter when `startSec` is given. Never cached: the link lives a few minutes,
 * and a dialog reopened an hour later must not play from a dead one.
 */
export function useGuideVideoPlay(id: string, startSec: number, enabled = true) {
  return useQuery({
    queryKey: ['guide-videos', 'play', id, startSec] as const,
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () =>
      api.get<GuideVideoPlay>(`/admin/guide-videos/${encodeURIComponent(id)}`, {
        start: startSec > 0 ? startSec : undefined,
      }),
  });
}
