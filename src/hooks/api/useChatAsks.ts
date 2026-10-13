import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { ChatAskState, DealerOpenRequest } from '@dk/shared';
import type {
  ReceiveChatAttachmentInput,
  SendBackChatAttachmentInput,
} from '@dk/shared/schemas';

import { conversationKey } from './useConversation';
import { documentAskKeys } from './useDocumentAsks';
import { kavachKeys } from './useKavach';
import { messagesKey } from './useMessages';
import { ttDensityKeys } from './useTtDensity';

/**
 * What MDG is waiting on from one outlet, and what the dealer has answered in
 * the chat that MDG has not yet checked (ADR 0019).
 *
 * One query per dealer, shared by the inbox's Open requests card, the "Answer
 * to…" chip under a dealer's photo and the small status on an ask notice, so
 * the three can never disagree about where a request stands.
 */
export const chatAskKeys = {
  all: ['chatAsks'] as const,
  openRequests: (dealerId: string | null | undefined) =>
    ['chatAsks', 'open-requests', dealerId] as const,
};

/**
 * `GET /dealers/:dealerId/open-requests`.
 *
 * It re-reads when the tab comes back to the front, because a dealer's answer
 * lands over the socket while the admin is elsewhere and the request's state
 * (the server files the photo just after it stores the message) is not on the
 * message itself. The live path is `useInboxSocket`, which asks again as soon as
 * a message that answers or carries a request arrives.
 */
export function useDealerOpenRequestsQuery(dealerId: string | null | undefined) {
  return useQuery({
    queryKey: chatAskKeys.openRequests(dealerId),
    queryFn: () => api.get<DealerOpenRequest[]>(`/dealers/${dealerId}/open-requests`),
    enabled: !!dealerId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

/** The outcome of either action: which request moved, and where it stands now. */
export interface ChatAskOutcome {
  ref: string;
  state: ChatAskState;
}

interface ChatAskActionVars {
  conversationId: string;
  messageId: string;
  /** The outlet, used only to refresh that outlet's other screens. */
  dealerId: string | null | undefined;
}

/**
 * Everything an answered request touches, refreshed at once.
 *
 * The same set the document and Kavach writes already refresh, because this is
 * the same decision made from another door: the Vault shelf, the Kavach queue
 * and the density calendar must not go on saying "waiting" about a paper the
 * inbox has just received. The Kavach queue is marked stale but not refetched,
 * for the reason `useQueueInvalidation` gives: an admin working down that list
 * must not see it reshuffle under them. The thread is refetched too — MDG's
 * "Received" or "Sent back" reply is a new message, and the socket echo is not
 * something to bet the screen on.
 */
function useRefreshAfterChatAsk() {
  const qc = useQueryClient();
  return (vars: ChatAskActionVars) => {
    void qc.invalidateQueries({ queryKey: chatAskKeys.all });
    void qc.invalidateQueries({ queryKey: messagesKey(vars.conversationId) });
    void qc.invalidateQueries({ queryKey: conversationKey(vars.conversationId) });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
    void qc.invalidateQueries({ queryKey: documentAskKeys.all });
    void qc.invalidateQueries({ queryKey: kavachKeys.workQueue, refetchType: 'none' });
    void qc.invalidateQueries({ queryKey: kavachKeys.dashboard });
    if (vars.dealerId) {
      void qc.invalidateQueries({ queryKey: kavachKeys.items(vars.dealerId) });
      void qc.invalidateQueries({ queryKey: kavachKeys.programme(vars.dealerId) });
    }
    void qc.invalidateQueries({ queryKey: ttDensityKeys.all });
  };
}

export interface ReceiveChatAskVars extends ChatAskActionVars {
  body: ReceiveChatAttachmentInput;
}

/**
 * MDG marks a dealer's chat photo received for one request. The server files
 * the photo where the request lives, then posts "Received" into the thread as a
 * reply to the photo — which is also what stops the thread counting as "waiting
 * for a reply".
 */
export function useReceiveChatAttachment() {
  const refresh = useRefreshAfterChatAsk();
  return useMutation({
    mutationFn: ({ conversationId, messageId, body }: ReceiveChatAskVars) =>
      api.post<ChatAskOutcome>(
        `/conversations/${conversationId}/messages/${messageId}/receive`,
        body,
      ),
    onSuccess: (_data, vars) => refresh(vars),
  });
}

export interface SendBackChatAskVars extends ChatAskActionVars {
  body: SendBackChatAttachmentInput;
}

/**
 * MDG sends a dealer's answer back. The reason reaches the dealer in the chat,
 * word for word, as a reply to their photo, and the request is open again.
 */
export function useSendBackChatAttachment() {
  const refresh = useRefreshAfterChatAsk();
  return useMutation({
    mutationFn: ({ conversationId, messageId, body }: SendBackChatAskVars) =>
      api.post<ChatAskOutcome>(
        `/conversations/${conversationId}/messages/${messageId}/send-back`,
        body,
      ),
    onSuccess: (_data, vars) => refresh(vars),
  });
}
