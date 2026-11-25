import { ChevronLeft, ChevronRight, FileText, Maximize2 } from 'lucide-react';
import * as React from 'react';

import { Button, IconButton, ImageLightbox, PdfViewer, ZoomableImage } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fetchPdfBytes } from '@/lib/pdf';
import type { KavachFile } from '@dk/shared';

export function isPdf(f: Pick<KavachFile, 'contentType' | 'filename'>): boolean {
  return f.contentType === 'application/pdf' || /\.pdf$/i.test(f.filename);
}

type Viewing =
  | { kind: 'image'; url: string; alt: string; title: string }
  | { kind: 'pdf'; url: string; title: string };

/** Open a photo or PDF big from anywhere on the review screen (a panel's photo, "last accepted"). */
export function useKavachViewer() {
  const [viewing, setViewing] = React.useState<Viewing | null>(null);
  const openImage = React.useCallback(
    (url: string, alt: string, title = alt) => setViewing({ kind: 'image', url, alt, title }),
    [],
  );
  const openFile = React.useCallback((f: KavachFile, title: string) => {
    if (!f.url) return;
    setViewing(
      isPdf(f)
        ? { kind: 'pdf', url: f.url, title: f.filename || title }
        : { kind: 'image', url: f.url, alt: title, title },
    );
  }, []);
  const viewer = viewing ? (
    viewing.kind === 'pdf' ? (
      <PdfViewer
        title={viewing.title}
        load={() => fetchPdfBytes(viewing.url)}
        onClose={() => setViewing(null)}
      />
    ) : (
      <ImageLightbox
        open
        onClose={() => setViewing(null)}
        src={viewing.url}
        alt={viewing.alt}
        title={viewing.title}
      />
    )
  ) : null;
  return { openImage, openFile, viewer };
}

/**
 * What the outlet sent: one file at a time, big, with the others as small
 * pictures underneath and Previous / Next between them. A photo zooms (pinch
 * on a phone; Enlarge on a laptop); a PDF opens in the reader.
 */
export function CheckPhotos({
  files,
  label,
  onOpen,
  className,
}: {
  files: KavachFile[];
  /** Said to a screen reader: "Update DSR before 10 am, 1E". */
  label: string;
  onOpen: (file: KavachFile) => void;
  className?: string;
}) {
  const [index, setIndex] = React.useState(0);
  const [broken, setBroken] = React.useState<ReadonlySet<string>>(() => new Set());
  // A new check brings a new set of files: start again at the first.
  const key = files.map((f) => f.storageKey).join('|');
  React.useEffect(() => setIndex(0), [key]);

  if (files.length === 0) {
    return (
      <div
        className={cn(
          'flex min-h-48 items-center justify-center rounded-md border border-dashed border-border-strong bg-surface-2 p-6 text-center text-sm text-text-muted',
          className,
        )}
      >
        No photo on this check.
      </div>
    );
  }

  const at = Math.min(index, files.length - 1);
  const file = files[at]!;
  const many = files.length > 1;

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <div className="relative flex min-h-48 flex-1 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2">
        {isPdf(file) ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <FileText width={36} height={36} strokeWidth={1.5} className="text-text-muted" aria-hidden />
            <p className="max-w-full break-all text-sm text-text">{file.filename || 'PDF'}</p>
            <Button onClick={() => onOpen(file)}>Read the PDF</Button>
          </div>
        ) : file.url && !broken.has(file.url) ? (
          <>
            <ZoomableImage
              onError={() => setBroken((b) => new Set(b).add(file.url!))}
              src={file.url}
              alt={`${label}, photo ${at + 1} of ${files.length}`}
              className="max-h-[56dvh] w-full object-contain md:max-h-full"
            />
            <IconButton
              aria-label="Enlarge photo"
              variant="secondary"
              size="sm"
              onClick={() => onOpen(file)}
              className="absolute right-2 top-2 hidden md:inline-flex"
            >
              <Maximize2 width={16} height={16} strokeWidth={1.75} />
            </IconButton>
          </>
        ) : (
          <p className="p-6 text-center text-sm text-text-muted">
            This photo could not be opened. Reload the page; if it still does not open, ask the outlet to send it again.
          </p>
        )}
      </div>

      {many ? (
        <div className="flex items-center gap-2">
          <IconButton
            aria-label="Previous photo"
            variant="secondary"
            size="sm"
            disabled={at === 0}
            onClick={() => setIndex(at - 1)}
            className="size-11"
          >
            <ChevronLeft width={16} height={16} strokeWidth={1.75} />
          </IconButton>
          <span className="text-xs text-text-muted" aria-live="polite">
            Photo {at + 1} of {files.length}
          </span>
          <IconButton
            aria-label="Next photo"
            variant="secondary"
            size="sm"
            disabled={at === files.length - 1}
            onClick={() => setIndex(at + 1)}
            className="size-11"
          >
            <ChevronRight width={16} height={16} strokeWidth={1.75} />
          </IconButton>
          <div className="ml-auto flex min-w-0 gap-1.5 overflow-x-auto">
            {files.map((f, i) => (
              <button
                key={f.storageKey}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === at}
                className={cn(
                  'h-12 w-12 shrink-0 overflow-hidden rounded-sm border bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  i === at ? 'border-brand' : 'border-border',
                )}
              >
                {f.url && !isPdf(f) ? (
                  <img src={f.url} alt="" draggable={false} className="h-full w-full object-cover" />
                ) : (
                  <FileText width={16} height={16} className="mx-auto text-text-muted" aria-hidden />
                )}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
