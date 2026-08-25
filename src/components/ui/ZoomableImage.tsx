import * as React from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';

/**
 * A photograph the admin can actually get close to on a phone.
 *
 * WHY THIS HAD TO BE WRITTEN RATHER THAN LEFT TO THE BROWSER
 * ----------------------------------------------------------
 * `index.html` ships `maximum-scale=1.0`, part of the WebView native-feel
 * hardening. It also means there is no pinch-zoom anywhere in the app — so a
 * 3000px scan fitted into a 328px sheet is simply unreadable, with no recovery
 * path. The pictures this shows are not decoration: they are the handwritten
 * staff-points hardcopy that the whole "reconcile hard copy against soft copy"
 * feature is about, the TT-density daily register, tanker invoices, and the
 * screenshot of whatever the SDMS portal did when a run failed. Each of them
 * carries a number somebody has to read off it. Without zoom the feature is
 * present on the screen and cannot be performed.
 *
 * THREE THINGS THAT ARE EASY TO GET WRONG HERE
 * --------------------------------------------
 * 1. `touch-action` is `none` ONLY while zoomed in. Setting it unconditionally
 *    would take the single-finger drag away from the sheet this usually sits
 *    in, so at 1× the photo could no longer be swiped out of the way — the
 *    picture would trap the panel that contains it. At 1× the browser keeps the
 *    gesture; a two-finger pinch still reaches us, because the viewport meta has
 *    already told the browser not to zoom the page with it.
 * 2. Zooming is anchored, not centred. When the scale goes from `s` to `s'`
 *    about the element's own centre, the offset that holds the point under the
 *    fingers still is `t' = t + (focal − centre) × (1 − s'/s)`. Scaling without
 *    that term slides the image out from under the fingers, which reads as a
 *    broken gesture even though the resulting zoom level is right.
 * 3. The live view lives in a ref as well as in state. A pinch produces a
 *    pointermove every frame, and each one needs the values the *previous* one
 *    settled on; reading them out of a state updater instead would mean running
 *    the arithmetic inside a function React is allowed to call twice, and in
 *    StrictMode it does — applying every pan delta twice.
 *
 * At ≥ md it renders a plain `<img>` and no handlers at all — a mouse has the
 * browser's own zoom, and desktop must be unchanged.
 */
export interface ZoomableImageProps {
  src: string;
  alt: string;
  /** Ceiling for pinch. Default 4×. */
  maxScale?: number;
  /** What a double-tap jumps to. Default 2.5×. */
  doubleTapScale?: number;
  onZoomChange?: (scale: number) => void;
  /** Applied to the `<img>` in both branches — this is where sizing belongs. */
  className?: string;
}

/** A second tap within this window, near the first, counts as a double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 32;

interface Point {
  x: number;
  y: number;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: View = { scale: 1, x: 0, y: 0 };

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function ZoomableImage({
  src,
  alt,
  maxScale = 4,
  doubleTapScale = 2.5,
  onZoomChange,
  className,
}: ZoomableImageProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);

  const [view, setViewState] = React.useState<View>(IDENTITY);
  const viewRef = React.useRef<View>(IDENTITY);
  // Animate only the discrete jumps (double-tap, snap-back). A transition
  // during a pinch lags the fingers by its own duration and reads as dropped
  // frames rather than as smoothing.
  const [smooth, setSmooth] = React.useState(false);

  const pointers = React.useRef(new Map<number, Point>());
  const pinch = React.useRef<{ startDist: number; startScale: number } | null>(
    null,
  );
  const pan = React.useRef<{ from: Point; origin: Point } | null>(null);
  const lastTap = React.useRef<{ at: number; point: Point } | null>(null);

  const setView = React.useCallback((next: View, animate: boolean) => {
    viewRef.current = next;
    setSmooth(animate);
    setViewState(next);
  }, []);

  // Reported through a ref so an inline `onZoomChange` lambda does not re-run
  // the effect on every render of the parent.
  const zoomListener = React.useRef(onZoomChange);
  React.useEffect(() => {
    zoomListener.current = onZoomChange;
  });
  React.useEffect(() => {
    zoomListener.current?.(view.scale);
  }, [view.scale]);

  // A new photograph starts fresh. Without this, opening a second image in the
  // same lightbox inherits the first one's zoom and lands mid-crop.
  React.useEffect(() => {
    viewRef.current = IDENTITY;
    setViewState(IDENTITY);
    setSmooth(false);
    pointers.current.clear();
    pinch.current = null;
    pan.current = null;
    lastTap.current = null;
  }, [src]);

  /**
   * Keep the picture overlapping its frame. The transform is applied about the
   * element's centre, so at scale `s` the image overhangs by half the surplus
   * on each side — and that surplus is exactly how far it may be dragged.
   */
  const clampOffset = React.useCallback((point: Point, s: number): Point => {
    const img = imgRef.current;
    const frame = frameRef.current;
    if (!img || !frame) return point;
    const maxX = Math.max(0, (img.offsetWidth * s - frame.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * s - frame.clientHeight) / 2);
    return { x: clamp(point.x, -maxX, maxX), y: clamp(point.y, -maxY, maxY) };
  }, []);

  /** Move to `nextScale` while holding the viewport point `focal` still. */
  const zoomTo = React.useCallback(
    (nextScale: number, focal: Point, animate: boolean) => {
      const img = imgRef.current;
      if (!img) return;
      const current = viewRef.current;
      const target = clamp(nextScale, 1, maxScale);
      if (target <= 1) {
        setView(IDENTITY, animate);
        return;
      }
      const ratio = target / current.scale;
      // getBoundingClientRect reports the TRANSFORMED box, so its centre
      // already carries the current offset — which is what collapses the
      // correction below into a plain difference of screen coordinates.
      const rect = img.getBoundingClientRect();
      const centre = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      const moved = clampOffset(
        {
          x: current.x + (focal.x - centre.x) * (1 - ratio),
          y: current.y + (focal.y - centre.y) * (1 - ratio),
        },
        target,
      );
      setView({ scale: target, x: moved.x, y: moved.y }, animate);
    },
    [maxScale, clampOffset, setView],
  );

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const point = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, point);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      if (a && b) {
        pinch.current = {
          startDist: distance(a, b),
          startScale: viewRef.current.scale,
        };
      }
      pan.current = null;
      lastTap.current = null; // the first finger of a pinch is not half a tap
      return;
    }

    if (pointers.current.size !== 1) return;

    const previous = lastTap.current;
    const now = Date.now();
    if (
      previous &&
      now - previous.at < DOUBLE_TAP_MS &&
      distance(previous.point, point) < DOUBLE_TAP_SLOP_PX
    ) {
      lastTap.current = null;
      zoomTo(viewRef.current.scale > 1 ? 1 : doubleTapScale, point, true);
      return;
    }
    lastTap.current = { at: now, point };
    if (viewRef.current.scale > 1) {
      pan.current = {
        from: point,
        origin: { x: viewRef.current.x, y: viewRef.current.y },
      };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const gesture = pinch.current;
    if (pointers.current.size >= 2 && gesture && gesture.startDist > 0) {
      const [a, b] = Array.from(pointers.current.values());
      if (!a || !b) return;
      const spread = distance(a, b) / gesture.startDist;
      zoomTo(gesture.startScale * spread, midpoint(a, b), false);
      return;
    }

    const drag = pan.current;
    if (!drag || pointers.current.size !== 1) return;
    const current = viewRef.current;
    if (current.scale <= 1) return;
    const moved = clampOffset(
      {
        x: drag.origin.x + (e.clientX - drag.from.x),
        y: drag.origin.y + (e.clientY - drag.from.y),
      },
      current.scale,
    );
    setView({ scale: current.scale, x: moved.x, y: moved.y }, false);
  }

  function endPointer(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size > 0) return;
    pan.current = null;
    // A pinch that ended at 1× snaps back rather than leaving the picture
    // floating small and off-centre inside its own frame.
    const current = viewRef.current;
    if (current.scale <= 1 && (current.x !== 0 || current.y !== 0)) {
      setView(IDENTITY, true);
    }
  }

  const image = (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      // Not decoration: an image drag inside the WebView is a press-and-hold
      // that used to hang the view. index.css covers it app-wide; this is the
      // belt that survives a stylesheet regression.
      draggable={false}
      className={className}
      style={
        isMd
          ? undefined
          : {
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transition: smooth ? 'transform 180ms ease-out' : 'none',
              willChange: 'transform',
            }
      }
    />
  );

  // Desktop: exactly the element that was there before, with no listeners.
  if (isMd) return image;

  return (
    <div
      ref={frameRef}
      className="relative flex justify-center overflow-hidden"
      // `none` only while zoomed — see the note at the top of the file.
      style={{ touchAction: view.scale > 1 ? 'none' : 'auto' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      {image}
    </div>
  );
}
