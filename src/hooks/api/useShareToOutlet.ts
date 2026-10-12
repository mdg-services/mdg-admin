import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { Attachment, ChatShareOutcome, ShareAudience } from '@dk/shared';

import { messagesKey } from './useMessages';

interface ShareToOutletVars {
  /** The chat the admin is writing from — its own uploads are what is sent. */
  conversationId: string;
  body?: string;
  attachments?: Attachment[];
  audience: ShareAudience;
}

/**
 * Send what is in the composer to the whole outlet — every owner in their own
 * chat, the manager group, or both — instead of to the one chat on screen.
 *
 * What the Reports shelf used to do for an uploaded file, which every member of
 * the outlet could see (ADR 0018). No optimistic bubble: the copies may not
 * include this chat at all ("Manager" from an owner's chat), so the thread
 * draws whatever the server actually posted, when its live update arrives.
 */
export function useShareToOutlet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: ShareToOutletVars) => {
      const payload: Record<string, unknown> = { audience: vars.audience };
      if (vars.body && vars.body.trim().length > 0) payload.body = vars.body;
      if (vars.attachments && vars.attachments.length > 0) payload.attachments = vars.attachments;
      return api.post<ChatShareOutcome>(
        `/conversations/${vars.conversationId}/messages/share`,
        payload,
      );
    },
    onSuccess: (outcome) => {
      // Every chat that got a copy, in case a live update was missed.
      for (const d of outcome.deliveries) {
        void qc.invalidateQueries({ queryKey: messagesKey(d.conversationId) });
      }
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
