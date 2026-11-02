import { ExternalLink, RotateCw } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  DownloadButton,
  Drawer,
  ImageLightbox,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useClaimFileUrls } from '@/hooks/api/useCalibrationClaim';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/api';
import { isNativeShell, requestNativeDownload } from '@/lib/nativeBridge';
import type { ClaimDocumentView } from '@dk/shared';

import { SLOT_LABEL, SOURCE_LABEL, fileSize } from './format';

/**
 * One of the claim's papers, read without leaving the pane.
 *
 * Shaped on `ttDensity/InvoicePdfDrawer.tsx`, for the same reasons: below `md` the
 * `Drawer` is already a bottom sheet, and the PDF frame is NOT mounted on a phone
 * at all — no mobile engine draws `application/pdf` in a frame, and a hidden
 * iframe would still fetch the whole file over mobile data to show nothing — so a
 * phone gets one "Open" button that hands the file to the phone's own viewer. A
 * photo (the signed letter is often one) is drawn as an image on every screen and
 * opens full-size, zoomable, on a tap.
 */

/** How long a frame gets to fire `onLoad` before its skeleton is taken down anyway. */
const FRAME_READY_TIMEOUT_MS = 6000;

export function PaperViewer({
  claimId,
  doc,
  onClose,
}: {
  claimId: string;
  /** The paper to show, or `null` while the drawer is closed. */
  doc: ClaimDocumentView | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const wideEnoughToEmbed = useMediaQuery('(min-width: 768px)');
  const [zoom, setZoom] = React.useState(false);
  const urlsQ = useClaimFileUrls(claimId, doc?.slot, !!doc);
  const urls = urlsQ.data ?? null;

  const isImage = !!urls && urls.contentType.startsWith('image/');
  const isPdf = !!urls && urls.contentType === 'application/pdf';
  const missing = urlsQ.isError && urlsQ.error instanceof ApiError && urlsQ.error.status === 404;
  const failed = urlsQ.isError && !missing;

  async function openOnPhone(): Promise<void> {
    if (!urls) return;
    if (isNativeShell()) {
      // The admin shell runs with `setSupportMultipleWindows={false}`, so
      // `window.open` is unreliable inside it; the shell's own handler saves the
      // file and hands it to whatever the phone uses for PDFs.
      const result = await requestNativeDownload({
        id: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: urls.downloadUrl,
        filename: urls.filename,
        contentType: urls.contentType,
        kind: 'file',
      });
      if (result.ok) return;
      if (!result.timedOut) {
        toast.error(result.error || 'Could not open the paper');
        return;
      }
      // An old shell without the handler: fall through to the browser.
    }
    window.open(urls.viewUrl, '_blank', 'noopener');
  }

  return (
    <Drawer
      open={!!doc}
      onClose={onClose}
      width="lg"
      title={doc ? SLOT_LABEL[doc.slot] : undefined}
      description={
        doc ? `${doc.filename} · ${SOURCE_LABEL[doc.source]} · ${fileSize(doc.size)}` : undefined
      }
      footer={
        <>
          {wideEnoughToEmbed && urls ? (
            <Button
              variant="secondary"
              leftIcon={<ExternalLink width={14} height={14} strokeWidth={1.75} />}
              onClick={() => window.open(urls.viewUrl, '_blank', 'noopener')}
            >
              Open in a new tab
            </Button>
          ) : null}
          {/* One control on a phone, not two: `openOnPhone` already saves the
              file through the shell and opens it, so a second "Download" beside
              it did the same job through `window.open`, which the shell drops. */}
          {!wideEnoughToEmbed && urls ? (
            <Button onClick={() => void openOnPhone()}>Open</Button>
          ) : null}
          {wideEnoughToEmbed && urls ? (
            <DownloadButton
              variant="ghost"
              size="md"
              url={urls.downloadUrl}
              filename={urls.filename}
              contentType={urls.contentType}
              kind={isImage ? 'image' : 'file'}
            />
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {doc ? (
        <div className="grid gap-3">
          {missing ? (
            <Callout intent="warning">
              This paper is not stored, so there is nothing to show.
            </Callout>
          ) : failed ? (
            <div className="grid justify-items-start gap-2">
              <Callout intent="warning">
                The paper could not be opened just now. Try again in a moment.
              </Callout>
              <Button
                variant="secondary"
                loading={urlsQ.isFetching}
                leftIcon={<RotateCw width={14} height={14} strokeWidth={1.75} />}
                onClick={() => void urlsQ.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : !urls ? (
            <Skeleton className="h-64 w-full rounded-md" />
          ) : isImage ? (
            <>
              <button
                type="button"
                onClick={() => setZoom(true)}
                aria-label="Open the photo full size"
                className="block w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <img
                  src={urls.viewUrl}
                  alt={SLOT_LABEL[doc.slot]}
                  className="max-h-[70dvh] w-full rounded-md border border-border bg-surface-2 object-contain"
                />
              </button>
              <ImageLightbox
                open={zoom}
                onClose={() => setZoom(false)}
                src={urls.viewUrl}
                alt={SLOT_LABEL[doc.slot]}
                title={SLOT_LABEL[doc.slot]}
                downloadUrl={urls.downloadUrl}
              />
            </>
          ) : isPdf && wideEnoughToEmbed ? (
            <PdfFrame src={urls.viewUrl} title={SLOT_LABEL[doc.slot]} />
          ) : (
            <p className="text-sm text-text-muted">
              {isPdf
                ? 'A PDF opens in your phone’s own viewer. Press Open below.'
                : 'This kind of file cannot be shown here. Download it to read it.'}
            </p>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}

/** The browser's own PDF viewer, with a skeleton that cannot outlive the frame. */
function PdfFrame({ src, title }: { src: string; title: string }) {
  const [ready, setReady] = React.useState(false);

  // A frame whose load event never fires — a slow signature, a viewer that
  // decides to download instead — would otherwise shimmer for ever.
  React.useEffect(() => {
    setReady(false);
    const timer = window.setTimeout(() => setReady(true), FRAME_READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [src]);

  return (
    <div className="relative">
      {ready ? null : <Skeleton className="absolute inset-0 rounded-md" />}
      <iframe
        src={src}
        title={title}
        className="h-[calc(100dvh-16rem)] min-h-[460px] w-full rounded-md border border-border bg-white"
        referrerPolicy="no-referrer"
        onLoad={() => setReady(true)}
      />
    </div>
  );
}
