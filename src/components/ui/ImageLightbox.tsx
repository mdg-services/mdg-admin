import { Download, ExternalLink } from 'lucide-react';
import * as React from 'react';

import { Button } from './Button';
import { Dialog } from './Dialog';
import { DownloadButton, filenameFromUrl } from './DownloadButton';
import { ZoomableImage } from './ZoomableImage';

/**
 * One photograph, full size, with an optional Download.
 *
 * WHY THIS EXISTS
 * ---------------
 * This exact markup — `Dialog size="lg"` wrapping a `max-h-[70vh] w-auto` image
 * with a Download button in the footer — had been written out three times, in
 * `features/chat/AttachmentPreview.tsx`, `features/chat/MediaGalleryCard.tsx`
 * and `pages/dealers/DealerStaffTab.tsx`, and the three had already drifted: the
 * staff-points copy capped the image at 60vh instead of 70vh and offered no
 * download at all, so the same photo opened at a different size depending on
 * which screen you reached it from. A fourth copy was about to be written for
 * the density-register page, which is what forced the extraction.
 *
 * `draggable={false}` is not decoration. The app runs inside a WebView, where an
 * image drag is a long-press-and-hold gesture that used to hang the view; the
 * app-wide `-webkit-user-drag: none` in `index.css` covers most of it and this
 * is the belt that survives a stylesheet regression.
 *
 * TWO THINGS THAT WERE WRONG ON A PHONE
 * -------------------------------------
 * The image had `max-h-[70vh] w-auto` and NO `max-w-full`. Capping only the
 * height scales the width to match, so a 4000×3000 landscape photo came out
 * about 597px wide inside a 360px sheet; the Dialog body is `overflow-y-auto`,
 * and per CSS Overflow a non-visible value on one axis promotes the other from
 * `visible` to `auto` — so the photo opened showing its left third inside a
 * nested sideways scroller nobody could see the edges of. `max-w-full` plus
 * `object-contain` fits it, and `60dvh` (not `70vh`: `vh` is the LARGE viewport
 * on mobile, so 70vh overshoots the 92dvh panel) leaves the footer on screen.
 *
 * And once it fits, it is too small to read — these photographs carry
 * handwritten figures, and the app disables pinch-zoom app-wide. That is what
 * `ZoomableImage` is for; `zoomable` is on by default and there is rarely a
 * reason to turn it off.
 */

export interface ImageLightboxProps {
  open: boolean;
  onClose: () => void;
  /** An `inline`-disposition signed URL. An `attachment` one would save instead of render. */
  src: string;
  alt: string;
  title?: string;
  /**
   * An `attachment`-disposition URL. Omit — along with {@link onDownload} — to
   * hide the Download button entirely.
   */
  downloadUrl?: string;
  /**
   * Download by doing something rather than by following a link.
   *
   * The chat call sites need this: their stored URLs expire, so a download has
   * to presign a fresh one at the moment of the click and then hand it to the
   * native shell's gallery saver. Pointing an `<a download>` at the URL that
   * rode in with the message would 403 on an older photo, and `download` is
   * ignored cross-origin anyway — the anchor would navigate the tab away and
   * tear down whatever was open behind it.
   *
   * Wins over `downloadUrl` when both are given.
   */
  onDownload?: () => void | Promise<void>;
  /** Shows the spinner on the Download button while a caller's own download is in flight. */
  downloading?: boolean;
  /** Pinch / pan / double-tap zoom below md. Default true. */
  zoomable?: boolean;
  /**
   * Hand the file to the phone's own viewer through the native bridge, for the
   * cases zoom cannot rescue — a multi-page scan, or a picture the admin wants
   * beside another app. Renders one more footer action when supplied.
   */
  onOpenExternally?: () => void;
}

const IMAGE_CLASS =
  'mx-auto max-h-[60dvh] w-auto max-w-full rounded-sm object-contain md:max-h-[70vh]';

export function ImageLightbox({
  open,
  onClose,
  src,
  alt,
  title,
  downloadUrl,
  onDownload,
  downloading = false,
  zoomable = true,
  onOpenExternally,
}: ImageLightboxProps) {
  const download = onDownload ? (
    <Button
      size="sm"
      variant="secondary"
      loading={downloading}
      onClick={() => void onDownload()}
      leftIcon={<Download width={14} height={14} strokeWidth={1.75} />}
    >
      Download
    </Button>
  ) : downloadUrl ? (
    // Was a bare `window.open(downloadUrl, '_blank')`, which the shell drops on
    // the floor — `setSupportMultipleWindows={false}` — so the tap did nothing
    // and said nothing. `DownloadButton` goes through the native bridge and
    // reports a failure out loud.
    <DownloadButton
      url={downloadUrl}
      filename={filenameFromUrl(downloadUrl, title ?? 'photo')}
      kind="image"
      variant="ghost"
      size="sm"
    />
  ) : null;

  const footer =
    download || onOpenExternally ? (
      <>
        {onOpenExternally ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onOpenExternally}
            leftIcon={<ExternalLink width={14} height={14} strokeWidth={1.75} />}
          >
            Open in another app
          </Button>
        ) : null}
        {download}
      </>
    ) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      footer={footer}
    >
      {open ? (
        zoomable ? (
          <ZoomableImage src={src} alt={alt} className={IMAGE_CLASS} />
        ) : (
          <img
            src={src}
            alt={alt}
            draggable={false}
            className={IMAGE_CLASS}
          />
        )
      ) : null}
    </Dialog>
  );
}
