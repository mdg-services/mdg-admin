import * as React from 'react';
import { flushSync } from 'react-dom';

import { moveItem } from './navOrder';

/**
 * Drag-to-reorder for a list of equal rows, done with pointer events.
 *
 * The browser's own drag and drop was tried first (25 Oct 2026) and was not
 * good enough: the rows were re-laid out under the pointer on every move, so
 * a row sliding into place counted as a new target and the list shook, worst
 * at the two ends; and it never scrolled a list that scrolls inside the page,
 * so taking a page from the bottom to the top meant two drags.
 *
 * Here nothing is re-laid out until the drop. Every row is measured once when
 * the drag starts; the held row follows the pointer by a transform, clamped to
 * the list so it cannot overshoot either end; the others slide a fixed step
 * out of its way; and where it lands is worked out from the measured
 * positions, never from rows that are still moving. Near the top or bottom
 * edge of the scrolling box the box scrolls by itself, faster the closer the
 * pointer gets. Let go and the row glides into its slot, then the new order
 * is saved and drawn in the same frame, so nothing jumps.
 *
 * Mouse and pen only: on a touch screen a swipe down the sidebar is a scroll.
 */

/** A row held, and where it is going. */
export interface RowDrag {
  from: number;
  to: number;
  /** How far each passed row steps aside: one row and the gap after it. */
  step: number;
  /** Let go: the row is gliding into its slot and the order is about to be saved. */
  settling: boolean;
}

const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
/** How long a passed row takes to step aside. */
const STEP_MS = 200;
/** How long the dropped row takes to glide into its slot. */
const SETTLE_MS = 180;
/** A press that moves less than this is a click on the link, not a drag. */
const START_PX = 4;
/** How close to the box's top or bottom edge the pointer must be to scroll it. */
const EDGE_PX = 64;
/** Fastest scroll, per frame, with the pointer at or past the edge. */
const MAX_SCROLL_PX = 18;

const DRAGGING_BODY = ['select-none', '[&_*]:!cursor-grabbing'];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function at(list: readonly number[], i: number): number {
  return list[i] ?? 0;
}

/** The nearest box that scrolls this element, or the page. */
function scrollBoxOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === 'auto' || overflowY === 'scroll') return p;
  }
  return document.documentElement;
}

/**
 * A click that ends a drag must not also open the link it ended on. The click
 * follows the pointer-up in the same task, so a listener armed now and taken
 * down on the next tick catches it and nothing later.
 */
function swallowNextClick() {
  const swallow = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
}

export function useSortableRows<T extends HTMLElement>(
  routes: readonly string[],
  onReorder: (routes: string[]) => void,
) {
  const listRef = React.useRef<T>(null);
  const [drag, setDrag] = React.useState<RowDrag | null>(null);
  // The drag in progress, if any: how to end it early when the list unmounts.
  const abortRef = React.useRef<(() => void) | null>(null);
  // Read when the drop is saved, which can be a while after the press.
  const latest = React.useRef({ routes, onReorder });
  latest.current = { routes, onReorder };

  React.useEffect(() => () => abortRef.current?.(), []);

  const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLElement>, index: number) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    // Cmd/Ctrl/Shift-click open the link elsewhere; leave them to the browser.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const list = listRef.current;
    if (!list || abortRef.current) return;

    const row = e.currentTarget;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    let lastY = startY;
    let started = false;
    let to = index;
    let frame = 0;
    let settleTimer = 0;
    let box: HTMLElement = document.documentElement;
    let startScroll = 0;
    let tops: number[] = [];
    let heights: number[] = [];

    function begin() {
      started = true;
      box = scrollBoxOf(list as HTMLElement);
      startScroll = box.scrollTop;
      const origin = box.getBoundingClientRect().top - box.scrollTop;
      const rows = Array.from((list as HTMLElement).querySelectorAll<HTMLElement>(':scope > [data-sort-row]'));
      tops = rows.map((r) => r.getBoundingClientRect().top - origin);
      heights = rows.map((r) => r.offsetHeight);
      const gap = rows.length > 1 ? at(tops, 1) - at(tops, 0) - at(heights, 0) : 0;
      row.style.transition = 'none';
      row.style.willChange = 'transform';
      try {
        // Keeps the moves and the release coming if the pointer leaves the window.
        row.setPointerCapture(pointerId);
      } catch {
        // Already released; the window listeners still see the moves.
      }
      document.body.classList.add(...DRAGGING_BODY);
      setDrag({ from: index, to, step: at(heights, index) + gap, settling: false });
      frame = requestAnimationFrame(tick);
    }

    function tick() {
      const edge = box.getBoundingClientRect();
      const zone = Math.min(EDGE_PX, edge.height / 4);
      const above = (edge.top + zone - lastY) / zone;
      const below = (lastY - (edge.bottom - zone)) / zone;
      if (above > 0) box.scrollTop -= Math.max(1, Math.round(MAX_SCROLL_PX * clamp(above, 0, 1) ** 2));
      else if (below > 0) box.scrollTop += Math.max(1, Math.round(MAX_SCROLL_PX * clamp(below, 0, 1) ** 2));

      const last = tops.length - 1;
      const home = at(tops, index);
      const height = at(heights, index);
      const offset = clamp(
        lastY - startY + box.scrollTop - startScroll,
        at(tops, 0) - home,
        at(tops, last) + at(heights, last) - height - home,
      );
      row.style.transform = `translate3d(0, ${offset}px, 0)`;

      // Where it lands: after every other row whose middle it has passed.
      const middle = home + offset + height / 2;
      let next = 0;
      tops.forEach((top, i) => {
        if (i !== index && top + at(heights, i) / 2 < middle) next += 1;
      });
      if (next !== to) {
        to = next;
        setDrag((d) => (d ? { ...d, to } : d));
      }
      frame = requestAnimationFrame(tick);
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      lastY = ev.clientY;
      if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) >= START_PX) begin();
    }

    function stopListening() {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onCancel);
    }

    function clearRow() {
      row.style.transform = '';
      row.style.transition = '';
      row.style.willChange = '';
    }

    function finish(keep: boolean) {
      stopListening();
      if (!started) {
        abortRef.current = null;
        return;
      }
      document.body.classList.remove(...DRAGGING_BODY);
      if (keep) swallowNextClick();
      const dest = keep ? to : index;
      const home = at(tops, index);
      const slot =
        dest <= index ? at(tops, dest) : at(tops, dest) + at(heights, dest) - at(heights, index);
      row.style.transition = `transform ${SETTLE_MS}ms ${EASE}, box-shadow ${SETTLE_MS}ms ${EASE}`;
      row.style.transform = `translate3d(0, ${slot - home}px, 0)`;
      setDrag((d) => (d ? { ...d, to: dest, settling: true } : d));
      settleTimer = window.setTimeout(() => {
        const { routes: current, onReorder: save } = latest.current;
        // Saved and drawn in one go, and the row's own offset dropped straight
        // after, so the frame that shows the new order is the first one painted.
        flushSync(() => {
          if (dest !== index && current.length === tops.length) {
            save(moveItem(current, index, dest));
          }
          setDrag(null);
        });
        clearRow();
        abortRef.current = null;
      }, SETTLE_MS);
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId === pointerId) finish(true);
    }

    function onCancel() {
      finish(false);
    }

    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'Escape' || !started) return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    }

    abortRef.current = () => {
      stopListening();
      window.clearTimeout(settleTimer);
      document.body.classList.remove(...DRAGGING_BODY);
      clearRow();
      abortRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onCancel);
  }, []);

  /** The inline style for the row at `index` while a drag is on. */
  function styleFor(index: number): React.CSSProperties | undefined {
    if (!drag || index === drag.from) return undefined;
    let y = 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) y = -drag.step;
    else if (drag.to < drag.from && index >= drag.to && index < drag.from) y = drag.step;
    return {
      transform: `translate3d(0, ${y}px, 0)`,
      transition: `transform ${STEP_MS}ms ${EASE}`,
    };
  }

  return { listRef, drag, onPointerDown, styleFor };
}
