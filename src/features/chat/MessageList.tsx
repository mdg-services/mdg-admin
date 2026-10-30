import { X } from 'lucide-react';
import * as React from 'react';

import { useToast } from '@/components/ui/Toast';
import { useOutletSetupQuery } from '@/hooks/api/useOnboarding';
import { usePortalLogins } from '@/hooks/api/usePortalLogins';
import { useStickToBottom } from '@/hooks/useStickToBottom';
import { cn } from '@/lib/cn';
import type { DealerOpenRequest, Message, UserRole } from '@dk/shared';

import {
  DealerViewContext,
  isRetiredSetupCard,
  setupCardHasBody,
  type AskPreviewPhase,
  type DealerViewValue,
} from './DealerCards';
import { dayChipLabel, guessDealerLang } from './dealerView';
import { MessageActionsMenu, type MenuAnchor } from './MessageActionsMenu';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  /** The outlet: the setup cards and the login box are drawn from its state. */
  dealerId?: string;
  /** The thread's primary member. An owner's cards are the editable ones; a manager's are read-only. */
  memberRole?: UserRole;
  /** The manager's group thread: dealer-side bubbles carry their sender's name. */
  group?: boolean;
  /** More history exists — shows the "Load earlier" button. */
  hasEarlier?: boolean;
  loadingEarlier?: boolean;
  /** Fetch the next (older) page; returns the fetch promise. */
  onLoadEarlier?: () => Promise<unknown>;
  onReply?: (message: Message) => void;
  onToggleReaction?: (message: Message, emoji: string) => void;
  onOpenReactions?: (message: Message) => void;
  onOpenInfo?: (message: Message) => void;
  /** Mark a dealer's picture received for one of their requests (message menu, and the "Answer to" chip). */
  onMarkReceived?: (message: Message) => void;
  /** Send a dealer's answer back with a reason (message menu). */
  onSendBack?: (message: Message) => void;
  /**
   * The requests a dealer has answered and MDG has not yet checked, by the id of
   * the message that carried the answer. Computed once for the thread, so no
   * bubble fetches anything.
   */
  pendingAnswers?: ReadonlyMap<string, DealerOpenRequest>;
  /** Where each request in the thread stands, by ref, for the label on an ask notice. */
  askStatuses?: ReadonlyMap<string, DealerOpenRequest['status']>;
  /**
   * Scroll to, and flash, this message — loading older pages for it if needed.
   * A fresh `nonce` asks again for the same message ("Show message" twice).
   */
  jumpTo?: { id: string; nonce: number } | null;
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

export function MessageList({
  messages,
  currentUserId,
  dealerId,
  memberRole,
  group = false,
  hasEarlier,
  loadingEarlier,
  onLoadEarlier,
  onReply,
  onToggleReaction,
  onOpenReactions,
  onOpenInfo,
  onMarkReceived,
  onSendBack,
  pendingAnswers,
  askStatuses,
  jumpTo,
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
  // last page, so sort by timestamp for a stable chronological order. The
  // retired "which services?" question is not drawn (the app drops it too), so
  // it is not a row and does not split a run.
  const ordered = React.useMemo(
    () =>
      messages
        .filter((m) => !isRetiredSetupCard(m))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
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
  const scrollToMessage = React.useCallback(
    (id: string): boolean => {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.classList.remove('message-flash');
      void el.offsetWidth; // restart the animation when re-jumping to the same row
      el.classList.add('message-flash');
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => el.classList.remove('message-flash'), 2000);
      return true;
      // `scrollRef` comes from the hook rather than a local useRef, so the lint
      // rule cannot see that it is stable; it is.
    },
    [scrollRef],
  );

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

  // An outside request to show one message — the Open requests card's "Show
  // message". It rides the same loop as a tapped quote, so an answer that is
  // several pages back is fetched for rather than reported as not found.
  React.useEffect(() => {
    if (jumpTo) handleJumpTo(jumpTo.id);
  }, [jumpTo, handleJumpTo]);

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
      setPendingJump((p) => (p && p.id === pendingJump.id ? { id: p.id, tries: p.tries + 1 } : p));
    });
    return () => {
      cancelled = true;
    };
  }, [pendingJump, hasEarlier, onLoadEarlier, scrollToMessage, toast]);

  // What the dealer's cards are drawn from. Each is asked for only when the
  // thread holds a message that draws it, so most threads make neither call.
  const needsSetup = React.useMemo(
    () => ordered.some((m) => !!m.setupCard && setupCardHasBody(m.setupCard.card)),
    [ordered],
  );
  const needsLogins = React.useMemo(() => ordered.some((m) => !!m.portalLogin), [ordered]);
  const setupQ = useOutletSetupQuery(needsSetup ? dealerId : undefined);
  const loginsQ = usePortalLogins(dealerId, needsLogins);
  const lang = React.useMemo(() => guessDealerLang(ordered), [ordered]);
  const dealerView = React.useMemo<DealerViewValue>(
    () => ({
      lang,
      // A lookup that failed draws as "nothing to show" (the message keeps its
      // words), never as a spinner that never stops.
      setup: !needsSetup ? undefined : setupQ.isError ? null : setupQ.data,
      portalLogins: loginsQ.data,
      portalLoginsFailed: loginsQ.isError && !loginsQ.data,
      // A manager's thread shows the cards read-only, as the manager's app does.
      canEdit: memberRole !== 'dealer-staff',
      group,
    }),
    [
      lang,
      needsSetup,
      setupQ.isError,
      setupQ.data,
      loginsQ.isError,
      loginsQ.data,
      memberRole,
      group,
    ],
  );

  // The same request posted twice (a nudge): only the newest post carries the
  // buttons, as in the app.
  const newestAskPost = React.useMemo(() => {
    const out = new Map<string, string>();
    for (const m of ordered) if (m.ask) out.set(m.ask.ref, m.id);
    return out;
  }, [ordered]);
  const askPhaseOf = (m: Message): AskPreviewPhase => {
    if (!m.ask || newestAskPost.get(m.ask.ref) !== m.id) return 'none';
    const status = askStatuses?.get(m.ask.ref);
    return status === 'open' || status === 'sent' ? status : 'none';
  };

  // Day chips and runs, as the app lays them out: a chip where the day changes;
  // a new run where the sender changes (or a notice follows a typed line, which
  // carries a different name). The first bubble of a run gets the tail and an
  // 8px gap above it, the rest 2px.
  const items: React.ReactNode[] = [];
  const now = new Date();
  let lastDay = '';
  ordered.forEach((m, i) => {
    const day = new Date(m.createdAt).toDateString();
    const showDay = day !== lastDay;
    lastDay = day;
    const prev = i > 0 ? ordered[i - 1] : undefined;
    const first = !prev || showDay || prev.senderId !== m.senderId || !!prev.system !== !!m.system;
    if (showDay) {
      items.push(
        <div key={`day-${m.id}`} className="flex justify-center px-3 pb-1 pt-3">
          <span className="rounded-lg bg-wa-chip px-3 py-1 text-[12.5px] leading-tight text-wa-chip-text shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
            {dayChipLabel(m.createdAt, lang, now)}
          </span>
        </div>,
      );
    }
    items.push(
      <div
        key={m.id}
        data-message-id={m.id}
        className={cn('rounded-xl px-3', first ? 'pt-2' : 'pt-0.5')}
      >
        <MessageBubble
          message={m}
          currentUserId={currentUserId}
          first={first}
          isMenuOpen={menu?.message.id === m.id}
          onOpenMenu={openMenu}
          onJumpTo={handleJumpTo}
          onOpenReactions={onOpenReactions}
          pendingAnswer={pendingAnswers?.get(m.id)}
          askPhase={askPhaseOf(m)}
          onOpenAnswer={onMarkReceived}
        />
      </div>,
    );
  });

  return (
    <>
      {/* The dealer app's wallpaper and its faint pattern sit behind the
          thread; the pattern stays put while the messages scroll over it. */}
      <div className="relative h-full bg-wa-wallpaper font-chat text-wa-bubble-text">
        <Doodles />
        <div ref={scrollRef} className="relative z-10 h-full scroll-py-1.5 overflow-y-auto overscroll-contain">
          {/* ONE wrapper for everything in the scroller: the stick-to-bottom
              hook watches it, so a picture or a card that fills in after the
              thread opened keeps the newest message in view. */}
          <div className="flex flex-col pb-2">
            {hasEarlier ? (
              <div className="flex justify-center px-3 pb-1 pt-3">
                <button
                  type="button"
                  onClick={() => void onLoadEarlier?.()}
                  disabled={loadingEarlier}
                  className="min-h-11 rounded-full bg-wa-chip px-4 py-1 text-[13px] text-wa-chip-text shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] hover:bg-wa-row-active disabled:opacity-60 md:min-h-0 md:px-3.5"
                >
                  {loadingEarlier ? 'Loading…' : 'Load earlier'}
                </button>
              </div>
            ) : null}
            <DealerViewContext.Provider value={dealerView}>{items}</DealerViewContext.Provider>
            {/* Not on a short screen (the keyboard is up): a 44px pill over a
                list that tall covered the dealer's last message. */}
            {!hintSeen && ordered.length > 0 ? (
              <div className="flex justify-center px-3 pt-2 md:hidden [@media(max-height:640px)]:hidden">
                <button
                  type="button"
                  onClick={dismissHint}
                  className="flex min-h-11 items-center gap-2 rounded-full bg-wa-chip px-3 text-xs text-wa-chip-text shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]"
                >
                  Press and hold a message for reply, copy and download
                  <X width={13} height={13} strokeWidth={1.75} className="shrink-0" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {menu && onReply && onToggleReaction && onOpenInfo ? (
        <MessageActionsMenu
          // Read the message fresh from the list so an in-flight reaction
          // toggle is reflected while the menu is open.
          message={ordered.find((m) => m.id === menu.message.id) ?? menu.message}
          anchor={menu.anchor}
          currentUserId={currentUserId}
          onReply={onReply}
          onToggleReaction={onToggleReaction}
          onOpenInfo={onOpenInfo}
          onMarkReceived={onMarkReceived}
          onSendBack={onSendBack}
          onClose={closeMenu}
        />
      ) : null}
    </>
  );
}

/**
 * The wallpaper's faint pattern — the dealer app's own (`MessageList.Doodles` in
 * mdg-client): a few small shapes, repeated, in the `--wa-doodle` ink.
 */
function Doodles() {
  const ink = { fill: 'none', stroke: 'var(--wa-doodle)' } as const;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 h-full w-full"
      focusable="false"
    >
      <defs>
        <pattern id="wa-doodle-tile" width="84" height="84" patternUnits="userSpaceOnUse">
          <g style={ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="14" cy="16" r="5" />
            <path d="M52 10l8 8m0-8l-8 8" />
            <path d="M10 56q5-7 10 0t10 0" />
            <path d="M58 54l8 14h-16z" />
            <rect x="38" y="36" width="10" height="10" rx="2" />
            <path d="M70 30q4-5 8 0" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wa-doodle-tile)" />
    </svg>
  );
}
