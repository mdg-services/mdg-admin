import type { Conversation } from '@dk/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { getSocket } from '@/lib/socket';

export function useInboxSocket() {
  const qc = useQueryClient();

  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onUpdated = (_payload: { conversation: Conversation }) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
    };

    socket.on('conversation:updated', onUpdated);
    return () => {
      socket.off('conversation:updated', onUpdated);
    };
  }, [qc]);
}
