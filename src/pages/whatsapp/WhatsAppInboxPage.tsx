import { Lock } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { Drawer } from '@/components/ui/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { ChatList } from '@/features/whatsapp/ChatList';
import { ChatPane } from '@/features/whatsapp/ChatPane';
import { DetailsContent, DetailsHeader, DetailsUnavailable } from '@/features/whatsapp/DetailsPanel';
import {
  emptyPaneWords,
  flattenChats,
  parseFilter,
  parseSearch,
  parseStage,
  type StageFilter,
  unreadOnLine,
} from '@/features/whatsapp/format';
import { LineIcon } from '@/features/whatsapp/LineMark';
import { NewChatDialog } from '@/features/whatsapp/NewChatDialog';
import { QuickRepliesDialog } from '@/features/whatsapp/QuickRepliesDialog';
import { useInboxLine } from '@/features/whatsapp/useInboxLine';
import {
  useWhatsAppChat,
  useWhatsAppChats,
  useWhatsAppConfig,
  useWhatsAppSummary,
} from '@/hooks/api/useWhatsAppInbox';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSafeBack } from '@/hooks/useSafeBack';
import { cn } from '@/lib/cn';
import { WHATSAPP_LINES, type WhatsAppChatFilter, type WhatsAppLine } from '@dk/shared';

import '@/features/whatsapp/whatsapp.css';

const MINUTE_MS = 60_000;

/** The contact panel's content, fetched only while the panel is open. Keyed on the person by its parent. */
function DetailsHost({ line, person, now }: { line: WhatsAppLine; person: string; now: number }) {
  const q = useWhatsAppChat(line, person);
  if (q.data) return <DetailsContent line={line} person={person} detail={q.data} now={now} />;
  if (q.isError) return <DetailsUnavailable onRetry={() => void q.refetch()} />;
  return (
    <div className="flex justify-center py-10">
      <Spinner size={20} />
    </div>
  );
}

/** What the right-hand pane says at lg and up while no chat is open: which number this inbox is. */
function EmptyPane({ line }: { line: WhatsAppLine }) {
  const words = emptyPaneWords(line);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-surface-2 px-6 text-center">
      <span
        data-line={line}
        className="wa-line flex h-20 w-20 items-center justify-center rounded-full bg-[var(--line-soft)] text-[var(--line)]"
      >
        <LineIcon line={line} size={36} />
      </span>
      <h2 className="text-xl font-medium text-text">{words.title}</h2>
      <p className="max-w-sm text-sm text-text-muted">
        {words.use} Pick a chat to read and reply. New messages rise to the top as they arrive.
      </p>
      <p className="flex items-center gap-1.5 text-xs text-text-subtle">
        <Lock width={12} height={12} strokeWidth={1.75} aria-hidden />
        Every admin on the team can see these chats.
      </p>
    </div>
  );
}

/** Where the page waits while it works out which number a link meant. */
function ResolvingLine() {
  return (
    <div className="-m-[var(--app-gutter)] flex h-[calc(100%+2*var(--app-gutter))] items-center justify-center bg-surface">
      <span role="status" aria-label="Opening the chat" className="flex items-center gap-2 text-sm text-text-muted">
        <Spinner size={18} />
        Opening the chat…
      </span>
    </div>
  );
}

/**
 * WhatsApp, for the numbers we run on Meta's Cloud API.
 *
 * We run two numbers — MDG Services for marketing, Dealer's Kavach for the
 * dealers who use the product — and this page is TWO INBOXES, one each, as two
 * phones would be. The admin is always inside one, and a message leaves from
 * the one it was typed in: nothing here ever picks a number for them. This
 * component only settles which inbox that is (`useInboxLine`) and then hands
 * over to `Inbox`, keyed on it, so nothing a chat holds can carry across.
 */
export function WhatsAppInboxPage() {
  const [params, setParams] = useSearchParams();
  const resolved = useInboxLine(params.get('line'), params.get('chat') || null, (line) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('line', line);
        return next;
      },
      { replace: true },
    ),
  );
  if (resolved.status === 'resolving') return <ResolvingLine />;
  return <Inbox key={resolved.line} line={resolved.line} />;
}

/**
 * One number's inbox, laid out and behaving like WhatsApp Web —
 * a list of chats on the left, newest first, the open chat on the right — so
 * that nobody has to learn it, and so that replying is as quick as it is on a
 * handset.
 *
 * Below lg the list and the chat take turns, one pane at a time. The URL is the
 * source of truth for what is open and what the list is filtered to
 * (`?line=`, `?chat=`, `?filter=`, `?stage=`, `?q=`): an alert or a push
 * notification opens a chat by link, a reload keeps the view, and the browser's
 * Back key goes from a chat back to the list.
 *
 * Switching number drops the open chat and the search and keeps the list and
 * stage filters. The page's top edge and the strip above the box wear the
 * number's colour the whole time (`whatsapp.css`).
 *
 * The page only wires: what each piece decides is in `features/whatsapp`, and
 * the rules are in its `format.ts`.
 */
function Inbox({ line }: { line: WhatsAppLine }) {
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
  const chatsQ = useWhatsAppChats({ line, filter, stage, q });
  const summaryQ = useWhatsAppSummary();
  const chats = React.useMemo(() => flattenChats(chatsQ.data?.pages), [chatsQ.data]);
  const counts = chatsQ.data?.pages[0]?.counts;
  // This number's own unread, never the two added together.
  const unreadTotal = counts?.unread ?? unreadOnLine(summaryQ.data, line);
  const unreadByLine = React.useMemo(
    () =>
      Object.fromEntries(WHATSAPP_LINES.map((l) => [l, unreadOnLine(summaryQ.data, l)])) as Record<WhatsAppLine, number>,
    [summaryQ.data],
  );

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

  // Switching number: a new inbox, so no chat is open in it and the search is
  // not carried over; the list and stage filters stay.
  const switchLine = React.useCallback(
    (next: WhatsAppLine) =>
      patchParams((p) => {
        p.set('line', next);
        p.delete('chat');
        p.delete('q');
      }),
    [patchParams],
  );
  // "Open that chat" on the other number: the same person, the other inbox. A
  // real history entry below lg, so Back returns to the chat just left.
  const openOnLine = React.useCallback(
    (next: WhatsAppLine) => patchParams((p) => p.set('line', next), isLg),
    [patchParams, isLg],
  );

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
      data-line={line}
      className={cn(
        'wa-scope wa-top-cue -m-[var(--app-gutter)] flex',
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
          line={line}
          onLine={switchLine}
          unreadByLine={unreadByLine}
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
            line={line}
            person={chat}
            config={configQ.data}
            configFailed={configQ.isError}
            onRetryConfig={() => void configQ.refetch()}
            onClose={closeChat}
            onOpenOnLine={openOnLine}
            detailsOpen={detailsOpen}
            onToggleDetails={toggleDetails}
            panelIsColumn={isXl}
          />
        ) : (
          <EmptyPane line={line} />
        )}
      </section>

      {chat && isXl && detailsOpen ? (
        <aside
          aria-label="Contact info"
          className="flex w-80 shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-border bg-surface"
        >
          <DetailsHeader onClose={() => setDetailsOpen(false)} />
          <DetailsHost key={chat} line={line} person={chat} now={now} />
        </aside>
      ) : null}

      {chat && !isXl ? (
        <Drawer open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Contact info" width="sm" bodyPadding="none">
          <DetailsHost key={chat} line={line} person={chat} now={now} />
        </Drawer>
      ) : null}

      <NewChatDialog
        line={line}
        open={newOpen}
        onClose={() => setNewOpen(false)}
        config={configQ.data}
        onStarted={openChat}
      />
      <QuickRepliesDialog open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}

