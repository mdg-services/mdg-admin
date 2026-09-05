import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Off by default. Alt-tabbing back re-fired every mounted query at once —
      // ~11 requests on the Inbox, three of them from AppShell on every screen.
      // Liveness comes from sockets (useInboxSocket / useConversationSocket),
      // from the run watchers' own refetchInterval, and from refetchOnReconnect
      // (left at its default `true`). Queries that genuinely need focus
      // liveness opt back in individually.
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
