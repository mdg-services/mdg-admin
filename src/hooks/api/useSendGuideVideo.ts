import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { GuideVideoId } from '@dk/shared';

import { messagesKey } from './useMessages';

/**
 * `POST /conversations/:id/guide-video` — posts one of MDG's short guide videos
 * into this chat. Answers 409 `VIDEO_NOT_UPLOADED` while the file is not in
 * storage yet. No optimistic bubble: the video arrives over the thread's live
 * update, and the messages are re-read in case that was missed.
 */
export function useSendGuideVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { conversationId: string; video: GuideVideoId }) =>
      api.post<{ posted: number }>(`/conversations/${vars.conversationId}/guide-video`, {
        video: vars.video,
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: messagesKey(vars.conversationId) });
    },
  });
}
