import { ChevronRight, Minus, Plus } from 'lucide-react';
import * as React from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';

import { DownloadButton, filenameFromUrl } from './DownloadButton';
import { Drawer } from './Drawer';
import { IconButton } from './IconButton';
import { ImageLightbox } from './ImageLightbox';

/**
 * A wide, spreadsheet-shaped artifact that we did not author and cannot
 * restyle — shown inline on a desktop and opened full screen on a phone.
 *
 * THE CASE THIS EXISTS FOR
 * ------------------------
 * The Daily Sales Report is the deliverable the whole DSR area produces, and it
 * is rendered into an `<iframe>` fixed at `h-[72vh] min-h-[520px] w-full`. On a
 * 360px phone that frame is about 296px wide and holds a day book with three
 * diesel tanks — nine dip columns — plus a meter column per nozzle. So the
 * admin pans a nested scroller, inside a 520px window, inside the page
 * scroller, with no pinch-zoom anywhere in the app. And `min-h-[520px]` spends
 * 520 of a 640px viewport on the frame before anything else is on screen. The
 * report cannot be read.
 *
 * Full screen does not make the HTML narrow; nothing can, short of rewriting an
 * artifact we do not own. What it does is give the frame the whole device
 * instead of a third of it, and take the frame out from inside two other
 * scrollers, so panning it is one gesture rather than three that fight.
 *
 * ZOOM IS THE OTHER HALF OF THAT. The frame is laid out at a desktop width
 * (`frameWidth`, 1100px by default) and then SCALED, rather than being handed a
 * 360px viewport and left to overflow. Scaled to fit, the whole day book is on
 * screen at once — small, but its shape is legible and the admin can see what
 * is where. Stepping the scale up to 1 renders the text at full size and the
 * pane is panned like a map. The app ships `maximum-scale=1.0`, so pinch-zoom
 * is not available to do this: the two buttons over the frame are the only
 * zoom the report has.
 *
 * IT IS STILL ONLY HALF THE ANSWER. Pass `figures` — a native block built from
 * the report's own digest, one stack per product with the dip, water dip,
 * stock, sales, receipts, testing and variation per tank — so every number
 * survives even when the frame does not. A picture of a spreadsheet is not a
 * way to read a spreadsheet.
 *
 * `kind="image"` is the easy half: it hands off to `ImageLightbox`, which has
 * real pinch-zoom. `actions` is for the `html` branch — the image branch's
 * footer belongs to the lightbox.
 */
export interface WideReportViewerProps {
  kind: 'html' | 'image';
  src: string;
  title: string;
  /** The mobile tap card. Defaults to a titled row with an "Open" chevron. */
  preview?: React.ReactNode;
  /** Extra footer actions inside the mobile full-screen view (`html` only). */
  actions?: React.ReactNode;
  /** The report's own numbers, in native markup, shown above the frame in the
   *  mobile full-screen view. This is the part that stays readable. */
  figures?: React.ReactNode;
  /** Desktop inline height of the `html` frame. Default `h-[72vh] min-h-[520px]`. */
  desktopHeightClass?: string;
  /**
   * The width at which the inline desktop frame is used instead of the mobile
   * tap card. Default `'(min-width: 768px)'`.
   *
   * A 768-1023px Android tablet is the case this exists for: it is `md`, so it
   * gets the inline 520px frame, which is the state this whole component was
   * written to replace — just at a slightly larger size. A caller whose report
   * is a 15-column day book should pass `'(min-width: 1024px)'` and let the
   * tablet have the full-screen view too.
   */
  fullScreenBelow?: string;
  /** The logical width the frame is laid out at before scaling. Default 1100 —
   *  a desktop-ish viewport, so the report's own layout does not collapse into
   *  its narrow form. Raise it for a report with more columns than that fits. */
  frameWidth?: number;
  /** The logical height of the frame, same idea. The document is cross-origin,
   *  so nothing can measure the real one. Default 1600. */
  frameHeight?: number;
  /** Classes for the mobile preview card. */
  className?: string;
}

/**
 * How tall the embedded report says it is, so the frame can stop scrolling.
 *
 * THE PROBLEM. The day book sat in a frame fixed at 72vh, which put a second
 * scrollbar a centimetre inside the page's own — one window inside another,
 * each taking the wheel depending on where the pointer happened to be, and
 * neither showing the whole sheet. The frame's height could not simply be
 * measured: the document is served from S3 under a presigned URL, so it is
 * cross-origin and `contentDocument` is unreachable.
 *
 * So the report says so itself. `renderDigestHtml` posts its own scrollHeight
 * on load, on resize, and after the Devanagari webfont lands; this listens,
 * checks the message really came from THIS frame (any page can post to any
 * window), and hands back a pixel height. Until one arrives — and for any
 * report generated before the sheet learned to say — it returns null and the
 * caller keeps its fixed frame, exactly as before.
 *
 * The clamp is not decoration. The height sizes an element, and an unbounded
 * number from a document is an unbounded element.
 */
const MIN_REPORT_HEIGHT = 240;
const MAX_REPORT_HEIGHT = 20000;

function useReportedHeight(
  frameRef: React.RefObject<HTMLIFrameElement | null>,
  enabled: boolean,
): number | null {
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!enabled) {
      setHeight(null);
      return;
    }
    const onMessage = (e: MessageEvent) => {
      // Only the frame we are sizing gets to say how tall it is.
      const win = frameRef.current?.contentWindow;
      if (!win || e.source !== win) return;
      const data = e.data as { type?: unknown; height?: unknown } | null;
      if (!data || data.type !== 'mdg:report-height') return;
      const h = Number(data.height);
      if (!Number.isFinite(h)) return;
      setHeight(Math.min(Math.max(Math.round(h), MIN_REPORT_HEIGHT), MAX_REPORT_HEIGHT));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frameRef, enabled]);
  return height;
}

/** Scale steps above "fit". 1 is the report at its own size. */
const ZOOM_STEPS = [0.5, 0.75, 1];

export function WideReportViewer({
  kind,
  src,
  title,
  preview,
  actions,
  figures,
  desktopHeightClass = 'h-[72vh] min-h-[520px]',
  fullScreenBelow = '(min-width: 768px)',
  frameWidth = 1100,
  frameHeight = 1600,
  className,
}: WideReportViewerProps) {
  const isMd = useMediaQuery(fullScreenBelow);
  const [open, setOpen] = React.useState(false);
  const inlineFrameRef = React.useRef<HTMLIFrameElement | null>(null);
  // Only the INLINE desktop frame grows to fit. The full-screen mobile view is
  // a scaled map of the sheet inside its own pan surface, where a frame taller
  // than the screen is the point rather than a fault.
  const reportedHeight = useReportedHeight(inlineFrameRef, isMd && kind === 'html');
  const paneRef = React.useRef<HTMLDivElement | null>(null);
  const [paneWidth, setPaneWidth] = React.useState(0);
  // `null` means "fit": the scale is whatever puts the whole frame on screen,
  // and it has to be recomputed rather than stored, because it depends on a
  // width that changes when the device is rotated.
  const [zoom, setZoom] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!open) {
      setZoom(null);
      return;
    }
    const el = paneRef.current;
    if (!el) return;
    const measure = () => setPaneWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const fit = paneWidth > 0 ? Math.min(paneWidth / frameWidth, 1) : 1;
  const steps = React.useMemo(
    () => Array.from(new Set([fit, ...ZOOM_STEPS])).sort((a, b) => a - b),
    [fit],
  );
  const scale = zoom ?? fit;
  const stepIndex = steps.findIndex((v) => v >= scale - 0.001);
  const atMin = stepIndex <= 0;
  const atMax = stepIndex >= steps.length - 1;

  // Branching in JS rather than with `md:hidden`, deliberately: a CSS branch
  // keeps BOTH trees mounted, and this one contains an <iframe>. That is the
  // whole report fetched and parsed twice on a phone that is regularly on 2G.
  if (isMd) {
    return kind === 'html' ? (
      // One scroll, not two: once the sheet has said how tall it is, the frame
      // becomes exactly that tall, nothing overflows, and the page is the only
      // thing that scrolls. `+2` absorbs sub-pixel rounding that would leave a
      // scrollbar for two pixels of nothing. A report that never says — one
      // generated before the sheet learned to — keeps the fixed frame it had.
      //
      // Scrolling is NOT disabled, deliberately. The height arrives more than
      // once (first paint, then again once the Devanagari webfont has swapped
      // in and the tables have their real row heights), and the early number is
      // the smaller one. If a later message were ever missed, a frame with
      // `scrolling="no"` would CUT the report off with no way to reach the rest;
      // leaving it on means the worst case degrades to the inner scrollbar we
      // are removing, rather than to a truncated deliverable.
      <iframe
        ref={inlineFrameRef}
        src={src}
        title={title}
        style={reportedHeight ? { height: reportedHeight + 2 } : undefined}
        className={cn(
          'w-full border-0 bg-white',
          reportedHeight ? 'block' : desktopHeightClass,
        )}
        referrerPolicy="no-referrer"
      />
    ) : (
      // An image needs no height budget — it is as tall as it is. The height
      // class is the iframe's, which has to be told how much room to take.
      <img
        src={src}
        alt={title}
        draggable={false}
        className="mx-auto max-w-full rounded-sm object-contain"
      />
    );
  }

  const card = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        'flex min-h-11 w-full items-center justify-between gap-3 rounded-lg',
        'border border-border bg-surface p-3 text-left hover:bg-surface-2/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        className,
      )}
    >
      {preview ?? (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-text">
            {title}
          </span>
          <span className="mt-0.5 block text-xs text-text-subtle">
            Open full screen
          </span>
        </span>
      )}
      <ChevronRight
        width={18}
        height={18}
        strokeWidth={1.75}
        aria-hidden
        className="shrink-0 text-text-subtle"
      />
    </button>
  );

  if (kind === 'image') {
    return (
      <>
        {card}
        <ImageLightbox
          open={open}
          onClose={() => setOpen(false)}
          src={src}
          alt={title}
          title={title}
          downloadUrl={src}
        />
      </>
    );
  }

  return (
    <>
      {card}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        width="lg"
        // The whole viewport, and no gutter: a report that is already too wide
        // should not also lose 5% of the height and 32px of the width to the
        // sheet's own chrome.
        presentation="fullscreen"
        bodyPadding="none"
        footer={
          actions ?? (
            <DownloadButton
              url={src}
              filename={filenameFromUrl(src, `${title}.html`)}
              kind="file"
              variant="secondary"
            />
          )
        }
      >
        {figures ? <div className="p-3">{figures}</div> : null}
        {/* An explicit height, not `h-full`: the Drawer body's height comes
            from its content, so a percentage inside it resolves against an
            indefinite height and collapses the frame to nothing. The 11rem is
            the sheet's own chrome — its header and its footer. */}
        <div className="relative">
          <div
            ref={paneRef}
            className="h-[calc(100dvh-11rem)] min-h-[20rem] overflow-auto overscroll-contain bg-white"
          >
            {/* The spacer carries the SCALED size, because a transform does not
                affect layout: without it the scroller would size itself to the
                frame's 1100px logical width at every zoom level, so "fit" would
                still pan sideways over empty white. */}
            <div
              style={{
                width: frameWidth * scale,
                height: frameHeight * scale,
              }}
            >
              <iframe
                src={src}
                title={title}
                className="border-0 bg-white"
                style={{
                  width: frameWidth,
                  height: frameHeight,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
          {/* Floating over the frame, and a sibling of the scroller rather than
              a child of it — a child would scroll away with the report, and a
              row of controls in the flow above it would cost 44px of the one
              thing this view is short of. */}
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full border border-border bg-surface/95 p-1 shadow-sm">
            <IconButton
              aria-label="Zoom out"
              size="sm"
              disabled={atMin}
              onClick={() => setZoom(steps[Math.max(0, stepIndex - 1)] ?? fit)}
            >
              <Minus width={18} height={18} strokeWidth={1.75} />
            </IconButton>
            <span className="min-w-[3ch] text-center text-xs tabular-nums text-text-muted">
              {Math.round(scale * 100)}%
            </span>
            <IconButton
              aria-label="Zoom in"
              size="sm"
              disabled={atMax}
              onClick={() =>
                setZoom(steps[Math.min(steps.length - 1, stepIndex + 1)] ?? 1)
              }
            >
              <Plus width={18} height={18} strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
      </Drawer>
    </>
  );
}
