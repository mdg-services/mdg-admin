import { Download } from 'lucide-react';
import * as React from 'react';

import { Button } from './Button';
import { Dialog } from './Dialog';

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
}

export function ImageLightbox({
  open,
  onClose,
  src,
  alt,
  title,
  downloadUrl,
  onDownload,
  downloading = false,
}: ImageLightboxProps) {
  const download = onDownload
    ? (
        <Button
          size="sm"
          variant="secondary"
          loading={downloading}
          onClick={() => void onDownload()}
          leftIcon={<Download width={14} height={14} strokeWidth={1.75} />}
        >
          Download
        </Button>
      )
    : downloadUrl
      ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.open(downloadUrl, '_blank', 'noopener')}
            leftIcon={<Download width={14} height={14} strokeWidth={1.75} />}
          >
            Download
          </Button>
        )
      : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      footer={download}
    >
      {open ? (
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="mx-auto max-h-[70vh] w-auto rounded-sm"
        />
      ) : null}
    </Dialog>
  );
}
