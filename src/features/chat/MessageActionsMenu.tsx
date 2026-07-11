import { Copy, Download, Info, Reply } from 'lucide-react';
import * as React from 'react';

import { useToast } from '@/components/ui/Toast';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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

  React.useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    // The desktop popover follows the anchor, so a scroll/resize invalidates it
    // and closes. The mobile sheet is a fixed overlay — keep it open.
    let onScroll: (() => void) | undefined;
    if (isMd) {
      onScroll = () => onClose();
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onClose);
    }
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      if (onScroll) window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, isMd]);

  const isTemp = message.id.startsWith('tmp-');
  const own = message.senderId === currentUserId;
  const ownEmoji = message.reactions?.find(
    (r) => r.userId === currentUserId,
  )?.emoji;

  async function handleCopy() {
    onClose();
    try {
      await navigator.clipboard.writeText(message.body ?? '');
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
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

  // Mobile: a bottom sheet. The dimmed overlay isn't tappable-to-close on its
  // own — the global outside-pointerdown handler (cardRef) covers that.
  if (!isMd) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
        role="menu"
        aria-label="Message actions"
      >
        <div
          ref={cardRef}
          className="w-full rounded-t-2xl border-t border-border bg-surface pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-lg animate-sheet-up"
        >
          <div className="mx-auto mb-1 mt-2 h-1 w-9 rounded-full bg-border-strong" />
          <div className="py-1">{content}</div>
        </div>
      </div>
    );
  }

  // Desktop: anchored popover.
  return (
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
      className="z-50 w-60 rounded-md border border-border bg-surface py-1 shadow-md"
    >
      {content}
    </div>
  );
}
