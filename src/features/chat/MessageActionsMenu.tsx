import { Copy, Download, Info, Reply } from 'lucide-react';
import * as React from 'react';

import { Portal } from '@/components/ui/Portal';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useOverlayEntry } from '@/hooks/useOverlayStack';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { downloadAttachment } from '@/lib/downloadAttachment';
import type { Attachment, Message } from '@dk/shared';
import { QUICK_REACTIONS } from '@dk/shared';

/** Viewport point the menu opens at (chevron corner, cursor, or press point). */
export interface MenuAnchor {
  x: number;
  y: number;
}

interface MessageActionsMenuProps {
  message: Message;
  anchor: MenuAnchor;
  currentUserId: string;
  onReply: (message: Message) => void;
  onToggleReaction: (message: Message, emoji: string) => void;
  onOpenInfo: (message: Message) => void;
  onClose: () => void;
}

const VIEWPORT_MARGIN = 8;

function MenuRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text hover:bg-surface-2 md:min-h-0"
    >
      <span className="shrink-0 text-text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

/**
 * Message context menu. A fixed-position popover anchored to the opening point
 * at `≥ md` (unchanged), and a full-width bottom sheet below `md` so it clears
 * the thumb zone and never overflows a 360px screen (§3.3).
 */
export function MessageActionsMenu({
  message,
  anchor,
  currentUserId,
  onReply,
  onToggleReaction,
  onOpenInfo,
  onClose,
}: MessageActionsMenuProps) {
  const toast = useToast();
  const isMd = useMediaQuery('(min-width: 768px)');
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(
    null,
  );

  // Desktop only: measure after render, then place below the anchor when it
  // fits, above otherwise, clamped inside the viewport. The mobile sheet ignores
  // the anchor.
  React.useLayoutEffect(() => {
    if (!isMd) return;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = anchor.x;
    let top = anchor.y + 4;
    if (left + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
      left = window.innerWidth - rect.width - VIEWPORT_MARGIN;
    }
    if (top + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
      top = anchor.y - rect.height - 4;
    }
    setPos({
      left: Math.max(VIEWPORT_MARGIN, left),
      top: Math.max(VIEWPORT_MARGIN, top),
    });
  }, [anchor.x, anchor.y, message.id, isMd]);

  // The desktop popover is an entry on the shared overlay stack, as `Menu`'s
  // is: Escape reaches it only while it is the top overlay, and any history
  // navigation closes it (`dismissOnPop`), since it is anchored to a view that
  // has gone. Below md the `Sheet` registers itself instead.
  useOverlayEntry(isMd, onClose, { dismissOnPop: true });

  // Desktop only. Below md the shared `Sheet` owns dismissal — backdrop
  // pointerdown, Escape and Back — and a document-level pointerdown handler
  // keyed on `cardRef` (which the sheet branch no longer sets) would close the
  // sheet on the first tap *inside* it. Escape is the stack's, above.
  React.useEffect(() => {
    if (!isMd) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    // The popover follows the anchor, so a scroll/resize invalidates it.
    const onScroll = () => onClose();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, isMd]);

  const isTemp = message.id.startsWith('tmp-');
  const own = message.senderId === currentUserId;
  const ownEmoji = message.reactions?.find(
    (r) => r.userId === currentUserId,
  )?.emoji;

  // `copyText` and not the clipboard API alone: in the WebView the API is
  // often missing or refused, and its second rung (the document's own copy)
  // works exactly there.
  async function handleCopy() {
    onClose();
    if (await copyText(message.body ?? '')) toast.success('Copied');
    else toast.error('Could not copy');
  }

  async function handleDownload(attachment: Attachment) {
    onClose();
    try {
      await downloadAttachment(attachment);
    } catch {
      toast.error('Download failed');
    }
  }

  const content = (
    <>
      {!isTemp ? (
        <>
          <div className="flex items-center justify-between gap-0.5 px-2 pb-1.5 pt-1">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`React ${emoji}`}
                aria-pressed={ownEmoji === emoji}
                onClick={() => {
                  onClose();
                  onToggleReaction(message, emoji);
                }}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full text-2xl hover:bg-surface-2 md:h-8 md:w-8 md:text-lg',
                  ownEmoji === emoji && 'bg-brand-soft ring-1 ring-brand',
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-border" />
          <MenuRow
            icon={<Reply width={15} height={15} strokeWidth={1.75} />}
            label="Reply"
            onClick={() => {
              onClose();
              onReply(message);
            }}
          />
        </>
      ) : null}
      {message.body ? (
        <MenuRow
          icon={<Copy width={15} height={15} strokeWidth={1.75} />}
          label="Copy"
          onClick={() => void handleCopy()}
        />
      ) : null}
      {message.attachments.map((a) => (
        <MenuRow
          key={a.storageKey}
          icon={<Download width={15} height={15} strokeWidth={1.75} />}
          label={
            message.attachments.length > 1 ? `Download ${a.filename}` : 'Download'
          }
          onClick={() => void handleDownload(a)}
        />
      ))}
      {own && !isTemp ? (
        <MenuRow
          icon={<Info width={15} height={15} strokeWidth={1.75} />}
          label="Message info"
          onClick={() => {
            onClose();
            onOpenInfo(message);
          }}
        />
      ) : null}
    </>
  );

  // Mobile: the shared bottom sheet. This used to be a hand-rolled copy of it
  // that had drifted — no `max-h-[85dvh]`, no internal scroll — so a message
  // with five attachments (one Download row each) grew past the screen and the
  // trailing "Message info" row could not be reached at all.
  if (!isMd) {
    return (
      <Sheet open onClose={onClose}>
        <div role="menu" aria-label="Message actions">
          {content}
        </div>
      </Sheet>
    );
  }

  // Desktop: anchored popover. Portalled and on the shared overlay token like
  // every other overlay, rather than a `fixed` box with a literal `z-50` inside
  // the message list: a `position: fixed` element resolves against the nearest
  // transformed ancestor, and this one was the only overlay outside the ladder.
  // The position is viewport coordinates either way, so nothing moves.
  return (
    <Portal>
      <div
        ref={cardRef}
        role="menu"
        aria-label="Message actions"
        style={{
          position: 'fixed',
          left: pos?.left ?? anchor.x,
          top: pos?.top ?? anchor.y,
          visibility: pos ? 'visible' : 'hidden',
        }}
        className="z-[var(--z-overlay)] w-60 rounded-md border border-border bg-surface py-1 shadow-md"
      >
        {content}
      </div>
    </Portal>
  );
}
