import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth';
import type { WhatsAppReplyList } from '@dk/shared';

/** `unread` is what still needs a person; `all` is everything anyone has sent us. */
export type RepliesView = 'unread' | 'all';

export const whatsAppRepliesKey = (view: RepliesView) => ['whatsapp-replies', view] as const;

/**
 * What people have written back to our WhatsApp number.
 *
 * A reply raises an alert, and the server says `alerts:changed` the moment it
 * does — so that event refetches this list too, and a reply shows up here in
 * the seconds it takes the alert to reach the phone. The poll covers a socket
 * that dropped.
 */
export function useWhatsAppRepliesQuery(view: RepliesView) {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onChanged = () => void qc.invalidateQueries({ queryKey: ['whatsapp-replies'] });
    socket.on('alerts:changed', onChanged);
    return () => {
      socket.off('alerts:changed', onChanged);
    };
  }, [qc, token]);

  // The page tells the reader to go and call the person, which means leaving
  // the app. While it is in the background the socket's events are lost and
  // the poll does not tick, and the app turns refetch-on-focus off globally —
  // so coming back has to ask again, or the list is the one from before the call.
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries({ queryKey: ['whatsapp-replies'] });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [qc]);

  return useQuery({
    queryKey: whatsAppRepliesKey(view),
    queryFn: () => api.get<WhatsAppReplyList>('/admin/whatsapp/replies', { view }),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

/**
 * Mark what one person has sent as read — up to `upTo`, the newest message
 * that was on the screen. A message that arrived after the list was drawn
 * stays unread and raises its own alert; the server closes this one at once.
 */
export function useMarkRepliesSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ person, upTo }: { person: string; upTo: string }) =>
      api.post<{ marked: number }>('/admin/whatsapp/replies/seen', { person, upTo }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-replies'] });
      void qc.invalidateQueries({ queryKey: ['admin-alerts'] });
    },
  });
}
