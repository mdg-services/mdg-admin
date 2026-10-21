import { ChevronDown, TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import type { WhatsAppChatMessage } from '@dk/shared';

import { BubbleActions, type BubbleAnchor } from './BubbleActions';
import {
  buildThread,
  freezeUnread,
  type FrozenUnread,
  type PendingMessage,
  type ThreadEntry,
} from './format';
import { StopNotice, ThreadBubble } from './ThreadBubble';
import { useSentinel } from './useInView';
import { useReadWhenSeen } from './useReadWhenSeen';
import { useThreadScroll } from './useThreadScroll';

export interface MessageThreadProps {
  /** What is drawn: the server's messages, then the admin's own unconfirmed ones. */
  entries: readonly ThreadEntry[];
  /** Only the server's, for working out where "unread" begins. */
  serverMessages: readonly WhatsAppChatMessage[];
  /**
   * No messages to draw yet. A chat opened again from the cache is `loading`
   * too until what it holds has been asked for again: the divider is placed
   * once, and from a stale copy it would miss everything that arrived since.
   */
  loading: boolean;
  /** The messages could not be fetched, and there is nothing older to show instead. */
  failed: boolean;
  onRetryLoad: () => void;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  /** The chat's own unread count, taken as it was when the chat was opened. */
  unreadAtOpen: number;
  /** The chat's unread count is current — fetched since this chat was opened, or never out of date — so the divider can be placed. */
  unreadKnown: boolean;
  /** What to call them, for quotes and for a screen reader. */
  contactName: string;
  /** An answer can quote a message only while it goes as an ordinary one. */
  canReply: boolean;
  onReply: (message: WhatsAppChatMessage) => void;
  onRetryPending: (pending: PendingMessage) => void;
  onRetryMessage: (message: WhatsAppChatMessage) => void;
  /** Failed messages of ours that have already been sent again: they are not offered a second retry. */
  retriedIds: ReadonlySet<string>;
  onRemovePending: (pending: PendingMessage) => void;
  onCheck: () => void;
  /** Tell the server these were read, up to this time. Rejects if it did not go through. */
  markRead: (upTo: string) => Promise<unknown>;
  /** Goes up by one on each send, so the thread scrolls down to show it. */
  bottomToken: number;
  now: number;
}

/**
 * The messages of one chat, on the WhatsApp wallpaper.
 *
 * It decides what is on screen and where to scroll, and nothing about what a
 * message means — that is `format.ts` — or how a bubble looks, which is
 * `ThreadBubble`. Three things here are easy to break and each is the reason
 * for a piece of this file:
 *
 * - The "N unread" divider is worked out once, when the chat opens, and kept.
 *   Reading the messages marks them read, and a divider that followed that
 *   would disappear from under the reader.
 * - "Read" is sent only for what has been on the screen (`useReadWhenSeen`).
 * - An older page arriving at the top must not move the reader
 *   (`useThreadScroll`).
 */
export function MessageThread({
  entries,
  serverMessages,
  loading,
  failed,
  onRetryLoad,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  unreadAtOpen,
  unreadKnown,
  contactName,
  canReply,
  onReply,
  onRetryPending,
  onRetryMessage,
  retriedIds,
  onRemovePending,
  onCheck,
  markRead,
  bottomToken,
  now,
}: MessageThreadProps) {
  const toast = useToast();

  // Worked out once, in the render that first has both the messages and the
  // count — React allows a state update during render for exactly this.
  const [frozen, setFrozen] = React.useState<FrozenUnread | null>(null);
  if (frozen === null && !loading && unreadKnown) {
    setFrozen(freezeUnread(serverMessages, unreadAtOpen));
  }
  const ready = !loading && frozen !== null;
  // Until the divider has been placed the thread is not drawn: it would show
  // its top for a moment and then jump to where the reader is meant to be.
  const waiting = !ready;

  const days = React.useMemo(() => buildThread(entries, { now, unread: frozen }), [entries, now, frozen]);

  const newestKey = entries[entries.length - 1]?.key ?? null;
  const oldestKey = entries[0]?.key ?? null;

  const countArrivals = React.useCallback(
    (previousNewestKey: string | null): number => {
      const at = previousNewestKey === null ? -1 : entries.findIndex((e) => e.key === previousNewestKey);
      // The line that was newest has since gone (a failed message was removed):
      // nothing says what is new, and counting the whole thread would be a lie.
      if (previousNewestKey !== null && at < 0) return 0;
      const from = at + 1;
      let n = 0;
      for (let i = from; i < entries.length; i++) if (entries[i]?.message.direction === 'in') n += 1;
      return n;
    },
    [entries],
  );

  const scroll = useThreadScroll({
    ready,
    newestKey,
    oldestKey,
    landOnDivider: Boolean(frozen?.firstId),
    countArrivals,
    bottomToken,
  });

  useReadWhenSeen({
    scrollRef: scroll.scrollRef,
    contentVersion: `${entries.length}:${newestKey ?? ''}`,
    enabled: ready,
    markRead,
  });

  const topSentinel = useSentinel<HTMLDivElement>(scroll.scrollRef, ready && hasOlder && !loadingOlder, onLoadOlder, 200);

  // ── the actions menu: one for the whole thread ──
  const [menu, setMenu] = React.useState<{ message: WhatsAppChatMessage; anchor: BubbleAnchor } | null>(null);
  const openMenu = React.useCallback((message: WhatsAppChatMessage, anchor: BubbleAnchor) => {
    setMenu({ message, anchor });
  }, []);
  const closeMenu = React.useCallback(() => setMenu(null), []);

  async function copyMessage(message: WhatsAppChatMessage) {
    // `copyText`, not the clipboard API alone: in the app's WebView the API is
    // often missing or refused, and its second try is the one that works there.
    if (message.text && (await copyText(message.text))) toast.success('Copied');
    else toast.error('Could not copy');
  }

  // `revealMessage` itself, not the `scroll` object: that is new on every
  // render, and handing it down would redraw every bubble each time.
  const { revealMessage } = scroll;
  const jumpTo = React.useCallback(
    (id: string) => {
      if (!revealMessage(id)) toast.info('That message is further up. Scroll up to load older messages.');
    },
    [revealMessage, toast],
  );

  const [image, setImage] = React.useState<{ src: string; alt: string } | null>(null);
  const openImage = React.useCallback((src: string, alt: string) => setImage({ src, alt }), []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroll.scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Messages with ${contactName}`}
        tabIndex={0}
        // `overflow-anchor: none` — this scroller keeps the reader's place when
        // an older page arrives (useThreadScroll) and the browser's own anchoring
        // would make the same correction a second time.
        className="wa-wallpaper min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 [overflow-anchor:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring md:px-10 lg:px-[6%]"
      >
        <div ref={scroll.contentRef}>
          {waiting && !(failed && entries.length === 0) ? (
            <ThreadSkeleton />
          ) : failed && entries.length === 0 ? (
            <div className="flex justify-center py-10">
              <div className="max-w-xs rounded-lg bg-[var(--wa-in)] p-4 text-center shadow-sm">
                <TriangleAlert width={24} height={24} strokeWidth={1.75} className="mx-auto text-danger" aria-hidden />
                <p className="mt-2 text-sm font-medium text-[var(--wa-text)]">Could not load the messages</p>
                <p className="mt-1 text-xs text-[var(--wa-meta)]">
                  This does not mean there are none. Check the connection and try again.
                </p>
                <Button size="sm" variant="secondary" className="mt-3" onClick={onRetryLoad}>
                  Try again
                </Button>
              </div>
            </div>
          ) : entries.length === 0 ? (
            <p className="mx-auto my-6 w-fit max-w-xs rounded-lg bg-[var(--wa-notice)] px-3 py-1.5 text-center text-xs text-[var(--wa-notice-text)] shadow-sm">
              No messages yet. Write the first one below.
            </p>
          ) : (
            <>
              {hasOlder ? (
                <div ref={topSentinel} className="flex justify-center py-1">
                  <button
                    type="button"
                    onClick={onLoadOlder}
                    disabled={loadingOlder}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--wa-pill)] px-4 text-xs font-medium text-[var(--wa-pill-text)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-70 md:min-h-8"
                  >
                    {loadingOlder ? <Spinner size={13} /> : null}
                    {loadingOlder ? 'Loading earlier messages' : 'Load earlier messages'}
                  </button>
                </div>
              ) : null}
              {days.map((day) => (
                <section key={day.key} aria-label={day.label}>
                  {/* The day pill sticks to the top while its day is on screen, as in WhatsApp. */}
                  <div className="pointer-events-none sticky top-1 z-[2] flex justify-center py-1">
                    <span className="rounded-lg bg-[var(--wa-pill)] px-3 py-1 text-xs font-medium text-[var(--wa-pill-text)] shadow-sm">
                      {day.label}
                    </span>
                  </div>
                  {day.rows.map((row) => {
                    if (row.type === 'unread') {
                      return (
                        <div key={row.key} data-unread-divider className="my-2 flex justify-center">
                          <span className="rounded-lg bg-[var(--wa-pill)] px-3 py-1 text-xs font-semibold text-[var(--wa-green-strong)] shadow-sm">
                            {row.count} unread {row.count === 1 ? 'message' : 'messages'}
                          </span>
                        </div>
                      );
                    }
                    if (row.type === 'notice') return <StopNotice key={row.key} message={row.entry.message} />;
                    const { message, pending } = row.entry;
                    return (
                      <ThreadBubble
                        key={row.key}
                        message={message}
                        pending={pending}
                        startsRun={row.startsRun}
                        contactName={contactName}
                        menuOpen={menu?.message.id === message.id}
                        onOpenMenu={openMenu}
                        onJumpTo={jumpTo}
                        onOpenImage={openImage}
                        onRetryPending={onRetryPending}
                        onRetryMessage={onRetryMessage}
                        retried={retriedIds.has(message.id)}
                        onRemovePending={onRemovePending}
                        onCheck={onCheck}
                      />
                    );
                  })}
                </section>
              ))}
            </>
          )}
          <div className="h-2" aria-hidden />
        </div>
      </div>

      {!scroll.pinned && ready ? (
        scroll.arrivals > 0 ? (
          <button
            type="button"
            onClick={scroll.scrollToBottom}
            className="absolute bottom-3 right-4 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--wa-green-strong)] px-4 text-sm font-semibold text-white shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:min-h-9"
          >
            <ChevronDown width={16} height={16} strokeWidth={2.25} aria-hidden />
            {scroll.arrivals} new
          </button>
        ) : (
          <button
            type="button"
            aria-label="Scroll to the latest message"
            onClick={scroll.scrollToBottom}
            className={cn(
              'absolute bottom-3 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--wa-in)] text-[var(--wa-meta)] shadow-md md:h-10 md:w-10',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            )}
          >
            <ChevronDown width={20} height={20} strokeWidth={2} aria-hidden />
          </button>
        )
      ) : null}

      {menu ? (
        <BubbleActions
          anchor={menu.anchor}
          onReply={canReply && !menu.message.stop ? () => onReply(menu.message) : undefined}
          onCopy={menu.message.text ? () => void copyMessage(menu.message) : undefined}
          onClose={closeMenu}
        />
      ) : null}

      <ImageLightbox
        open={image !== null}
        onClose={() => setImage(null)}
        src={image?.src ?? ''}
        alt={image?.alt ?? ''}
        title="Photo"
      />
    </div>
  );
}

/** Grey bubbles of different widths on alternating sides, so a loading chat has the shape of a chat. */
function ThreadSkeleton() {
  const rows: Array<{ out: boolean; width: string }> = [
    { out: false, width: 'w-3/5' },
    { out: true, width: 'w-2/5' },
    { out: false, width: 'w-1/2' },
    { out: true, width: 'w-3/5' },
    { out: false, width: 'w-2/5' },
  ];
  return (
    <div aria-hidden className="space-y-2 py-2">
      {rows.map((r, i) => (
        <div key={i} className={cn('flex', r.out ? 'justify-end' : 'justify-start')}>
          <Skeleton className={cn('h-10 rounded-lg bg-black/[0.07]', r.width)} />
        </div>
      ))}
    </div>
  );
}
