import { Copy, Reply } from 'lucide-react';
import * as React from 'react';

import { Portal } from '@/components/ui/Portal';
import { Sheet, SheetItem } from '@/components/ui/Sheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useOverlayEntry } from '@/hooks/useOverlayStack';

/** Viewport point the menu opens at: the chevron's corner, the cursor, or the press point. */
export interface BubbleAnchor {
  x: number;
  y: number;
}

export interface BubbleActionsProps {
  anchor: BubbleAnchor;
  /** Quote this message in the next answer. Absent when a reply cannot quote (a template goes out unquoted). */
  onReply?: () => void;
  /** Copy the words. Absent when the message has none. */
  onCopy?: () => void;
  onClose: () => void;
}

const VIEWPORT_MARGIN = 8;

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none md:min-h-9"
    >
      <span className="shrink-0 text-text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

/**
 * What can be done with one message: answer it (quoting it), or copy its words.
 *
 * A small popover beside the chevron — or the cursor, for a right-click — at md
 * and up, and the app's own bottom sheet below it, which is where a long press
 * lands: a 240px popover pinned to a thumb is unusable on a 360px screen, and
 * the sheet cannot run off an edge.
 */
export function BubbleActions({ anchor, onReply, onCopy, onClose }: BubbleActionsProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);

  // Measure after it renders, then put it below the anchor if it fits and above
  // it if not, kept inside the window.
  React.useLayoutEffect(() => {
    if (!isMd) return;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = anchor.x;
    let top = anchor.y + 4;
    if (left + rect.width > window.innerWidth - VIEWPORT_MARGIN) left = window.innerWidth - rect.width - VIEWPORT_MARGIN;
    if (top + rect.height > window.innerHeight - VIEWPORT_MARGIN) top = anchor.y - rect.height - 4;
    setPos({ left: Math.max(VIEWPORT_MARGIN, left), top: Math.max(VIEWPORT_MARGIN, top) });
  }, [anchor.x, anchor.y, isMd]);

  // On the overlay stack: Escape closes this and nothing under it. A history
  // navigation closes it too — the popover belongs to a view that has gone.
  useOverlayEntry(isMd, onClose, { dismissOnPop: true });

  React.useEffect(() => {
    if (!isMd) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    // The popover is placed against a spot in the thread; any scroll moves the spot.
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [isMd, onClose]);

  const rows = (
    <>
      {onReply ? (
        <Row
          icon={<Reply width={15} height={15} strokeWidth={1.75} />}
          label="Reply"
          onClick={() => {
            onClose();
            onReply();
          }}
        />
      ) : null}
      {onCopy ? (
        <Row
          icon={<Copy width={15} height={15} strokeWidth={1.75} />}
          label="Copy text"
          onClick={() => {
            onClose();
            onCopy();
          }}
        />
      ) : null}
    </>
  );

  if (!isMd) {
    return (
      <Sheet open onClose={onClose}>
        <div role="menu" aria-label="Message actions">
          {onReply ? (
            <SheetItem
              icon={<Reply width={20} height={20} strokeWidth={1.75} />}
              onClick={() => {
                onClose();
                onReply();
              }}
            >
              Reply
            </SheetItem>
          ) : null}
          {onCopy ? (
            <SheetItem
              icon={<Copy width={20} height={20} strokeWidth={1.75} />}
              onClick={() => {
                onClose();
                onCopy();
              }}
            >
              Copy text
            </SheetItem>
          ) : null}
        </div>
      </Sheet>
    );
  }

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
        className="z-[var(--z-overlay)] w-48 rounded-md border border-border bg-surface py-1 shadow-md"
      >
        {rows}
      </div>
    </Portal>
  );
}
