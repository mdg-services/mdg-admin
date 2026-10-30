import * as React from 'react';

import { cn } from '@/lib/cn';

export interface ColumnResizerProps {
  /** What it resizes, in words: "Resize the conversation list". */
  label: string;
  /** The id of the column it resizes. */
  controls?: string;
  /**
   * Which edge of that column the handle sits on: `right` for a column on the
   * left of the page (dragging right widens it), `left` for one on the right.
   */
  edge: 'right' | 'left';
  value: number;
  min: number;
  max: number;
  /**
   * During a drag, the width the pointer is asking for — at most once a frame,
   * and NOT clamped, so the page can act on a drag past the minimum (the list
   * folds away). The page draws it without a React render of its own.
   */
  onLive: (width: number) => void;
  /** The drag, or an arrow key, is done: keep this width. Not clamped either. */
  onCommit: (width: number) => void;
  /**
   * A drag that moved but ended with no new width: let go on the pixel it
   * started from, or the handle went away mid-drag. Put back what was drawn.
   */
  onCancel: () => void;
  /** Double-click or Enter: back to the default width. */
  onReset: () => void;
  className?: string;
}

/**
 * The drag handle on the edge between two columns.
 *
 * A zero-width flex item, so it changes no layout; its hit area is 8px, 2px over
 * the column on its left and 6px over the one on its right. Lopsided on
 * purpose: both columns that end at a handle (the list, the chat) keep their
 * scrollbar at their right-hand edge, and a centred hit area sat on top of it.
 *
 * A separator in the ARIA sense, so it is reachable by Tab and moved by the
 * arrow keys (16px a press, 64px with Shift; Home and End go to the narrowest
 * and widest), and a screen reader hears its width.
 */
export function ColumnResizer({
  label,
  controls,
  edge,
  value,
  min,
  max,
  onLive,
  onCommit,
  onCancel,
  onReset,
  className,
}: ColumnResizerProps) {
  const [dragging, setDragging] = React.useState(false);
  const drag = React.useRef<{ x: number; from: number; to: number; moved: boolean } | null>(
    null,
  );
  const frame = React.useRef(0);

  // While dragging, the whole page shows the resize cursor and no text in the
  // chat gets selected as the pointer crosses it.
  React.useEffect(() => {
    if (!dragging) return;
    const s = document.body.style;
    const before = { cursor: s.cursor, userSelect: s.userSelect };
    s.cursor = 'col-resize';
    s.userSelect = 'none';
    return () => {
      s.cursor = before.cursor;
      s.userSelect = before.userSelect;
    };
  }, [dragging]);

  // The handle can go away mid-drag (the window narrows under lg, the panel is
  // shut) and then no pointer-up reaches it: what the drag drew is put back here.
  const cancelRef = React.useRef(onCancel);
  cancelRef.current = onCancel;
  React.useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      const d = drag.current;
      drag.current = null;
      if (d?.moved) cancelRef.current();
    },
    [],
  );

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, from: value, to: value, moved: false };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    d.moved = true;
    d.to = edge === 'right' ? d.from + dx : d.from - dx;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (drag.current) onLive(drag.current.to);
    });
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // A click with no movement is not a resize; a drag that came back to where
    // it started keeps the old width, but what it drew must be undone.
    if (d.to !== d.from) onCommit(d.to);
    else if (d.moved) onCancel();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Alt+Left is the browser's Back, and Cmd/Ctrl+arrows are the system's own.
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = e.shiftKey ? 64 : 16;
    const wider = edge === 'right' ? 'ArrowRight' : 'ArrowLeft';
    const narrower = edge === 'right' ? 'ArrowLeft' : 'ArrowRight';
    let next: number | null = null;
    if (e.key === wider) next = value + step;
    else if (e.key === narrower) next = value - step;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    else if (e.key === 'Enter') {
      e.preventDefault();
      onReset();
      return;
    }
    if (next === null) return;
    e.preventDefault();
    onCommit(Math.min(max, Math.max(min, next)));
  }

  return (
    <div className={cn('relative z-30 w-0 shrink-0', className)}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-controls={controls}
        aria-valuenow={Math.round(value)}
        aria-valuemin={min}
        aria-valuemax={Math.round(max)}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={onReset}
        onKeyDown={onKeyDown}
        className="group absolute inset-y-0 -left-0.5 w-2 cursor-col-resize touch-none outline-none"
      >
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 left-px w-0.5 transition-colors duration-150',
            dragging
              ? 'bg-brand'
              : 'bg-transparent group-hover:bg-border-strong group-focus-visible:bg-brand',
          )}
        />
      </div>
    </div>
  );
}
