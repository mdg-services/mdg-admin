import { Lock, MessageCircle } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { Drawer } from '@/components/ui/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { ChatList } from '@/features/whatsapp/ChatList';
import { ChatPane } from '@/features/whatsapp/ChatPane';
import { DetailsContent, DetailsHeader, DetailsUnavailable } from '@/features/whatsapp/DetailsPanel';
import {
  flattenChats,
  parseFilter,
  parseSearch,
  parseStage,
  type StageFilter,
} from '@/features/whatsapp/format';
import { NewChatDialog } from '@/features/whatsapp/NewChatDialog';
import { QuickRepliesDialog } from '@/features/whatsapp/QuickRepliesDialog';
import {
  useWhatsAppChat,
  useWhatsAppChats,
  useWhatsAppConfig,
  useWhatsAppSummary,
} from '@/hooks/api/useWhatsAppInbox';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSafeBack } from '@/hooks/useSafeBack';
import { cn } from '@/lib/cn';
import type { WhatsAppChatFilter } from '@dk/shared';

import '@/features/whatsapp/whatsapp.css';

const MINUTE_MS = 60_000;

/** The contact panel's content, fetched only while the panel is open. Keyed on the person by its parent. */
function DetailsHost({ person, now }: { person: string; now: number }) {
  const q = useWhatsAppChat(person);
  if (q.data) return <DetailsContent person={person} detail={q.data} now={now} />;
  if (q.isError) return <DetailsUnavailable onRetry={() => void q.refetch()} />;
  return (
    <div className="flex justify-center py-10">
      <Spinner size={20} />
    </div>
  );
}

/** What the right-hand pane says at lg and up while no chat is open. */
function EmptyPane() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-surface-2 px-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-soft text-brand">
        <MessageCircle width={36} height={36} strokeWidth={1.5} aria-hidden />
      </span>
      <h2 className="text-xl font-medium text-text">Pick a chat to read and reply</h2>
      <p className="max-w-sm text-sm text-text-muted">
        Everyone we have messaged, and everyone who has written to us, is in the list. New messages rise to the top as
        they arrive.
      </p>
      <p className="flex items-center gap-1.5 text-xs text-text-subtle">
        <Lock width={12} height={12} strokeWidth={1.75} aria-hidden />
        Only super-admins can see these chats.
      </p>
    </div>
  );
}

/**
 * WhatsApp, for the numbers we run on Meta's Cloud API.
 *
 * There is no phone behind those numbers: every lead we have messaged, and
 * everyone who has written to us, is a chat here, and this page is the only
 * place one is read or answered. It is laid out and behaves like WhatsApp Web —
 * a list of chats on the left, newest first, the open chat on the right — so
 * that nobody has to learn it, and so that replying is as quick as it is on a
 * handset.
 *
 * Below lg the list and the chat take turns, one pane at a time. The URL is the
 * source of truth for what is open and what the list is filtered to
 * (`?chat=`, `?filter=`, `?stage=`, `?q=`): an alert or a push notification
 * opens a chat by link, a reload keeps the view, and the browser's Back key
 * goes from a chat back to the list.
 *
 * The page only wires: what each piece decides is in `features/whatsapp`, and
 * the rules are in its `format.ts`.
 */
export function WhatsAppInboxPage() {
  const [params, setParams] = useSearchParams();
  const chat = params.get('chat') || null;
  const filter = parseFilter(params.get('filter'));
  const stage = parseStage(params.get('stage'));
  const q = parseSearch(params.get('q'));

  const isLg = useMediaQuery('(min-width: 1024px)');
  // The contact panel is a column only where the chat keeps a readable width
  // beside it: 1,024px less the app's sidebar leaves the chat 456px, and the
  // panel would take 320 of those. Below xl it opens as a drawer instead.
  const isXl = useMediaQuery('(min-width: 1280px)');
  const backToList = useSafeBack('/whatsapp');

  const configQ = useWhatsAppConfig();
  const chatsQ = useWhatsAppChats({ filter, stage, q });
  const summaryQ = useWhatsAppSummary();
  const chats = React.useMemo(() => flattenChats(chatsQ.data?.pages), [chatsQ.data]);
  const counts = chatsQ.data?.pages[0]?.counts;
  const unreadTotal = counts?.unread ?? summaryQ.data?.unreadChats ?? 0;

  // Ticks once a minute so "14:02" becomes "Yesterday" at midnight without a refetch.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => window.clearInterval(t);
  }, []);

  // `setSearchParams` is a new function whenever the URL changes. Callbacks
  // that go to memoised rows read it through a ref, so a keystroke in the
  // search box does not redraw every row.
  const setParamsRef = React.useRef(setParams);
  React.useEffect(() => {
    setParamsRef.current = setParams;
  });
  const patchParams = React.useCallback((change: (p: URLSearchParams) => void, replace = true) => {
    setParamsRef.current(
      (current) => {
        const next = new URLSearchParams(current);
        change(next);
        return next;
      },
      { replace },
    );
  }, []);

  // Opening a chat below lg is a real history entry, so Back returns to the
  // list; at lg both panes are on screen and nothing needs to be undone.
  const openChat = React.useCallback(
    (person: string) => patchParams((p) => p.set('chat', person), isLg),
    [patchParams, isLg],
  );
  const closeChat = React.useCallback(() => {
    if (isLg) patchParams((p) => p.delete('chat'));
    // A blind history step back would walk OUT of the app when the chat is the
    // first entry — which is what a push notification's link produces.
    else backToList();
  }, [isLg, patchParams, backToList]);

  const setFilter = React.useCallback(
    (next: WhatsAppChatFilter) => patchParams((p) => (next === 'all' ? p.delete('filter') : p.set('filter', next))),
    [patchParams],
  );
  const setStage = React.useCallback(
    (next: StageFilter | null) => patchParams((p) => (next === null ? p.delete('stage') : p.set('stage', next))),
    [patchParams],
  );
  const setQ = React.useCallback(
    (next: string) => patchParams((p) => (next.trim() === '' ? p.delete('q') : p.set('q', next))),
    [patchParams],
  );

  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const toggleDetails = React.useCallback(() => setDetailsOpen((o) => !o), []);
  // A drawer left open would greet the next chat with the last one's details.
  React.useEffect(() => {
    if (!isXl) setDetailsOpen(false);
  }, [chat, isXl]);

  const [newOpen, setNewOpen] = React.useState(false);
  const [quickOpen, setQuickOpen] = React.useState(false);

  const failed = chatsQ.isError && !chatsQ.data;
  const refreshFailed = chatsQ.isError && Boolean(chatsQ.data);

  return (
    // `main` is padded by `--app-gutter`, and in a chat the shell adds the
    // bottom safe-area inset to it as well (the tab bar, which normally
    // carries it, is hidden). The page cancels that padding with a negative
    // margin — and `h-full` resolves against main's CONTENT box, which is a
    // gutter short on each side. So the height is spelled out, and the inset
    // added back only in a chat, which is the only time `main` carries it.
    <div
      className={cn(
        'wa-scope -m-[var(--app-gutter)] flex',
        chat
          ? 'h-[calc(100%+2*var(--app-gutter)+env(safe-area-inset-bottom))]'
          : 'h-[calc(100%+2*var(--app-gutter))]',
      )}
    >
      {/* The list: the whole width below lg, hidden once a chat is open. */}
      <section
        aria-label="Chats"
        className={cn(
          'min-h-0 w-full shrink-0 flex-col border-r border-border bg-surface lg:flex lg:w-[360px]',
          chat ? 'hidden' : 'flex',
        )}
      >
        <ChatList
          chats={chats}
          counts={counts}
          loading={chatsQ.isLoading}
          failed={failed}
          refreshFailed={refreshFailed}
          stale={chatsQ.isPlaceholderData}
          onRetry={() => void chatsQ.refetch()}
          hasMore={chatsQ.hasNextPage}
          loadingMore={chatsQ.isFetchingNextPage}
          onLoadMore={() => void chatsQ.fetchNextPage()}
          selected={chat}
          onOpen={openChat}
          filter={filter}
          onFilter={setFilter}
          stage={stage}
          onStage={setStage}
          q={q}
          onQ={setQ}
          unreadTotal={unreadTotal}
          onNewChat={() => setNewOpen(true)}
          onQuickReplies={() => setQuickOpen(true)}
          now={now}
        />
      </section>

      {/* The chat: the whole width below lg once one is open. */}
      <section aria-label="Open chat" className={cn('min-h-0 min-w-0 flex-1 flex-col lg:flex', chat ? 'flex' : 'hidden')}>
        {chat ? (
          <ChatPane
            // Everything a chat holds — the message being replied to, where the
            // unread divider goes, the scroll position — belongs to that chat.
            key={chat}
            person={chat}
            config={configQ.data}
            configFailed={configQ.isError}
            onRetryConfig={() => void configQ.refetch()}
            onClose={closeChat}
            detailsOpen={detailsOpen}
            onToggleDetails={toggleDetails}
            panelIsColumn={isXl}
          />
        ) : (
          <EmptyPane />
        )}
      </section>

      {chat && isXl && detailsOpen ? (
        <aside
          aria-label="Contact info"
          className="flex w-80 shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-border bg-surface"
        >
          <DetailsHeader onClose={() => setDetailsOpen(false)} />
          <DetailsHost key={chat} person={chat} now={now} />
        </aside>
      ) : null}

      {chat && !isXl ? (
        <Drawer open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Contact info" width="sm" bodyPadding="none">
          <DetailsHost key={chat} person={chat} now={now} />
        </Drawer>
      ) : null}

      <NewChatDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        config={configQ.data}
        onStarted={openChat}
      />
      <QuickRepliesDialog open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}

