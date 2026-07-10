import * as React from 'react';

export interface LongPressPoint {
  x: number;
  y: number;
}

const MOVE_TOLERANCE_PX = 10;

/**
 * 450ms touch/pen long-press (mouse users get the hover chevron and
 * right-click instead). Fires with the press point; cancels on release,
 * pointer cancel, drift past 10px (a scroll, not a press), or a second
 * finger. The synthetic click that trails a completed long-press is swallowed
 * in the capture phase so it doesn't also activate whatever is under it.
 */
export function useLongPress(
  onLongPress: (point: LongPressPoint) => void,
  delayMs = 450,
) {
  const callbackRef = React.useRef(onLongPress);
  React.useEffect(() => {
    callbackRef.current = onLongPress;
  }, [onLongPress]);

  const timerRef = React.useRef<number | null>(null);
  const originRef = React.useRef<LongPressPoint | null>(null);
  const suppressClickRef = React.useRef(false);

  const cancel = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  }, []);

  React.useEffect(() => cancel, [cancel]);

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (!e.isPrimary) {
        cancel();
        return;
      }
      const point = { x: e.clientX, y: e.clientY };
      originRef.current = point;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        suppressClickRef.current = true;
        navigator.vibrate?.(10);
        callbackRef.current(point);
      }, delayMs);
    },
    [cancel, delayMs],
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      const origin = originRef.current;
      if (!origin || timerRef.current === null) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (dx * dx + dy * dy > MOVE_TOLERANCE_PX * MOVE_TOLERANCE_PX) cancel();
    },
    [cancel],
  );

  const onPointerUp = React.useCallback(() => cancel(), [cancel]);
  const onPointerCancel = React.useCallback(() => cancel(), [cancel]);

  const onClickCapture = React.useCallback((e: React.MouseEvent) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
  };
}
