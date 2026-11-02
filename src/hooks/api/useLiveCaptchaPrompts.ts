import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { LiveCaptchaPrompt } from '@dk/shared';

/** The query key for every waiting picture code; the claim hooks clear it after an answer. */
export const LIVE_CAPTCHA_KEY = ['calibrationClaim', 'live'] as const;

/**
 * `GET /calibration-claim/live` — every picture code waiting for an admin, at any
 * outlet, for the app-wide pop-up and banner. Its own small file because the app
 * shell mounts it on every screen.
 *
 * The server raises and clears an alert with each one, and every admin socket
 * hears `alerts:changed` then, so a code shows within a second of the robot
 * asking. The poll is the fallback for a socket that missed it: every 10 s while
 * one is waiting (it has a three-minute limit), every 30 s otherwise. Coming back
 * to the app re-reads at once.
 *
 * A code keeps the picture link it was first listed with: the server signs a new
 * one on every read, and swapping it would reload the picture every 10 s under an
 * admin reading it. The first link lasts five minutes, longer than the code.
 */
export function useLiveCaptchaPrompts(enabled: boolean) {
  const qc = useQueryClient();
  React.useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    const reread = () => void qc.invalidateQueries({ queryKey: LIVE_CAPTCHA_KEY });
    socket?.on('alerts:changed', reread);
    const onVisible = () => {
      if (document.visibilityState === 'visible') reread();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      socket?.off('alerts:changed', reread);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [qc, enabled]);
  return useQuery({
    queryKey: LIVE_CAPTCHA_KEY,
    queryFn: async () => {
      const held = new Map(
        (qc.getQueryData<LiveCaptchaPrompt[]>(LIVE_CAPTCHA_KEY) ?? []).map((p) => [
          p.sessionId,
          p.imageUrl,
        ]),
      );
      const { items } = await api.get<{ items: LiveCaptchaPrompt[] }>('/calibration-claim/live');
      return items.map((p) => {
        const url = held.get(p.sessionId);
        return url ? { ...p, imageUrl: url } : p;
      });
    },
    enabled,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 10_000 : 30_000),
  });
}
