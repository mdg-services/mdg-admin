import { X } from 'lucide-react';
import * as React from 'react';

import { useToast } from '@/components/ui/Toast';
import { useStickToBottom } from '@/hooks/useStickToBottom';
import type { Message } from '@dk/shared';

import { MessageActionsMenu, type MenuAnchor } from './MessageActionsMenu';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  /** More history exists — shows the "Load earlier" button. */
  hasEarlier?: boolean;
  loadingEarlier?: boolean;
  /** Fetch the next (older) page; returns the fetch promise. */
  onLoadEarlier?: () => Promise<unknown>;
  onReply?: (message: Message) => void;
  onToggleReaction?: (message: Message, emoji: string) => void;
  onOpenReactions?: (message: Message) => void;
  onOpenInfo?: (message: Message) => void;
}

/** How many older pages the jump-to-quote loop will fetch before giving up. */
const MAX_JUMP_PAGES = 10;

/**
 * The long-press menu is the only touch route to reply / copy / download, and a
 * press-and-hold advertises itself to nobody. Shown once per device, until the
 * admin opens the menu (by any route) or taps it away.
 */
const LONG_PRESS_HINT_KEY = 'dk.chat.longPressHintSeen';

function readLongPressHintSeen(): boolean {
  try {
    return window.localStorage.getItem(LONG_PRESS_HINT_KEY) === '1';
  } catch {
    // Private mode / storage disabled: show the hint, never crash the thread.
    return false;
  }
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = startOfDay(new Date());
  const that = startOfDay(d);
  const diffDays = Math.round((today - that) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function MessageList({
  messages,
  currentUserId,
  hasEarlier,
  loadingEarlier,
  onLoadEarlier,
  onReply,
  onToggleReaction,
  onOpenReactions,
  onOpenInfo,
}: MessageListProps) {
  const toast = useToast();

  const [hintSeen, setHintSeen] = React.useState(readLongPressHintSeen);
  const dismissHint = React.useCallback(() => {
    setHintSeen(true);
    try {
      window.localStorage.setItem(LONG_PRESS_HINT_KEY, '1');
    } catch {
      /* storage unavailable — the hint just comes back next session */
    }
  }, []);

  // One menu instance for the whole list, opened from any bubble.
  const [menu, setMenu] = React.useState<{
    message: Message;
    anchor: MenuAnchor;
  } | null>(null);
  const openMenu = React.useCallback(
    (message: Message, anchor: MenuAnchor) => {
      dismissHint();
      setMenu({ message, anchor });
    },
    [dismissHint],
  );
  const closeMenu = React.useCallback(() => setMenu(null), []);

  // Display oldest -> newest. Each API page is oldest-first, but older pages
  // are appended after newer ones and realtime/optimistic messages land on the
  // last page, so sort by timestamp for a stable chronological order.
  const ordered = React.useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages],
  );

  // Pin to the bottom when new messages arrive — but only if the user is
  // already near it, so "Load earlier" prepends and jump-to-quote reading
  // don't get yanked back down. The hook also re-pins on a *size* change, which
  // the old count-keyed effect could not see: `interactive-widget=resizes-content`
  // shrinks the viewport when the keyboard opens, so the newest messages slid
  // below the fold exactly while the admin was typing a reply to one of them.
  const { ref: scrollRef } = useStickToBottom<HTMLDivElement>([ordered.length]);

  const flashTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  /** Center a loaded message in view and pulse its row. False if not in the DOM. */
  const scrollToMessage = React.useCallback((id: string): boolean => {
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${id}"]`,
    );
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.classList.remove('message-flash');
    void el.offsetWidth; // restart the animation when re-jumping to the same row
    el.classList.add('message-flash');
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(
      () => el.classList.remove('message-flash'),
      2000,
    );
    return true;
    // `scrollRef` comes from the hook rather than a local useRef, so the lint
    // rule cannot see that it is stable; it is.
  }, [scrollRef]);

  // Jump-to-quote: if the original isn't loaded yet, keep fetching older
  // pages (capped) until it appears, then scroll to it.
  const [pendingJump, setPendingJump] = React.useState<{
    id: string;
    tries: number;
  } | null>(null);

  const handleJumpTo = React.useCallback(
    (id: string) => {
      if (scrollToMessage(id)) return;
      setPendingJump({ id, tries: 0 });
    },
    [scrollToMessage],
  );

  React.useEffect(() => {
    if (!pendingJump) return;
    if (scrollToMessage(pendingJump.id)) {
      setPendingJump(null);
      return;
    }
    if (!hasEarlier || !onLoadEarlier || pendingJump.tries >= MAX_JUMP_PAGES) {
      setPendingJump(null);
      toast.info('Original message not found');
      return;
    }
    let cancelled = false;
    void onLoadEarlier().finally(() => {
      if (cancelled) return;
      // Re-runs this effect against the freshly rendered page.
      setPendingJump((p) =>
        p && p.id === pendingJump.id ? { id: p.id, tries: p.tries + 1 } : p,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [pendingJump, hasEarlier, onLoadEarlier, scrollToMessage, toast]);

  const lastOwnId = React.useMemo(() => {
    for (let i = ordered.length - 1; i >= 0; i--) {
      const m = ordered[i]!;
      if (m.senderId === currentUserId) return m.id;
    }
    return null;
  }, [ordered, currentUserId]);

  const items: React.ReactNode[] = [];
  let lastDay: number | null = null;
  for (const m of ordered) {
    const d = new Date(m.createdAt);
    const day = startOfDay(d);
    if (day !== lastDay) {
      items.push(
        <div
          key={`day-${m.id}`}
          className="my-2 flex items-center justify-center"
        >
          <span className="rounded-full bg-surface-2 px-3 py-0.5 text-xs text-text-muted">
            {dayLabel(m.createdAt)}
          </span>
        </div>,
      );
      lastDay = day;
    }
    items.push(
      <div key={m.id} data-message-id={m.id} className="rounded-xl">
        <MessageBubble
          message={m}
          currentUserId={currentUserId}
          isLastOwn={m.id === lastOwnId}
          isMenuOpen={menu?.message.id === m.id}
          onOpenMenu={openMenu}
          onJumpTo={handleJumpTo}
          onOpenReactions={onOpenReactions}
        />
      </div>,
    );
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="flex h-full flex-col gap-2 overflow-y-auto overscroll-contain px-4 py-3"
      >
        {hasEarlier ? (
          <div className="mb-1 flex justify-center">
            <button
              type="button"
              onClick={() => void onLoadEarlier?.()}
              disabled={loadingEarlier}
              className="min-h-11 rounded-full border border-border bg-surface px-4 py-1 text-xs text-text-muted hover:bg-surface-2 disabled:opacity-60 md:min-h-0 md:px-3"
            >
              {loadingEarlier ? 'Loading…' : 'Load earlier'}
            </button>
          </div>
        ) : null}
        {items}
        {!hintSeen && ordered.length > 0 ? (
          <div className="flex justify-center md:hidden">
            <button
              type="button"
              onClick={dismissHint}
              className="flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-3 text-xs text-text-muted"
            >
              Press and hold a message for reply, copy and download
              <X
                width={13}
                height={13}
                strokeWidth={1.75}
                className="shrink-0"
                aria-hidden
              />
            </button>
          </div>
        ) : null}
      </div>
      {menu && onReply && onToggleReaction && onOpenInfo ? (
        <MessageActionsMenu
          // Read the message fresh from the list so an in-flight reaction
          // toggle is reflected while the menu is open.
          message={
            ordered.find((m) => m.id === menu.message.id) ?? menu.message
          }
          anchor={menu.anchor}
          currentUserId={currentUserId}
          onReply={onReply}
          onToggleReaction={onToggleReaction}
          onOpenInfo={onOpenInfo}
          onClose={closeMenu}
        />
      ) : null}
    </>
  );
}
