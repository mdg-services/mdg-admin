import { ChevronRight } from 'lucide-react';
import * as React from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';

import { DownloadButton, filenameFromUrl } from './DownloadButton';
import { Drawer } from './Drawer';
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
 * WHICH IS WHY THIS IS ONLY HALF THE ANSWER. Pair it with a native figure list
 * built from the report's own digest — one stacked block per product, with the
 * dip, water dip, stock, sales, receipts, testing and variation per tank — so
 * every number survives even when the frame is useless. A picture of a
 * spreadsheet is not a way to read a spreadsheet.
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
  /** Desktop inline height of the `html` frame. Default `h-[72vh] min-h-[520px]`. */
  desktopHeightClass?: string;
  /** Classes for the mobile preview card. */
  className?: string;
}

export function WideReportViewer({
  kind,
  src,
  title,
  preview,
  actions,
  desktopHeightClass = 'h-[72vh] min-h-[520px]',
  className,
}: WideReportViewerProps) {
  const isMd = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = React.useState(false);

  // Branching in JS rather than with `md:hidden`, deliberately: a CSS branch
  // keeps BOTH trees mounted, and this one contains an <iframe>. That is the
  // whole report fetched and parsed twice on a phone that is regularly on 2G.
  if (isMd) {
    return kind === 'html' ? (
      <iframe
        src={src}
        title={title}
        className={cn('w-full border-0 bg-white', desktopHeightClass)}
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
        {/* `-m-4` cancels the Drawer body's own padding: a report that is
            already too wide should not also lose 32px of it to a gutter.
            A fixed `70dvh` rather than `h-full`, because the Drawer body's
            height comes from its content — `height: 100%` inside it resolves
            against an indefinite height and collapses the frame to nothing. */}
        <div className="-m-4">
          <iframe
            src={src}
            title={title}
            className="h-[70dvh] w-full border-0 bg-white"
            referrerPolicy="no-referrer"
          />
        </div>
      </Drawer>
    </>
  );
}
