import { ImageOff } from 'lucide-react';
import * as React from 'react';

import { ImageLightbox } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { MockDrillPhotoView } from '@dk/shared';

import { fileSize } from './format';

/**
 * The drill's photos, from their short-lived signed links. A tap opens the
 * photo full size (pinch-zoom on a phone). `size="large"` is the review modal's:
 * the admin is checking the report against these pictures, so they get the room.
 */
export function PhotoStrip({
  photos,
  size = 'small',
  stacked = false,
}: {
  photos: readonly MockDrillPhotoView[];
  size?: 'small' | 'large';
  /** One photo per row at every width (the review modal's left column). */
  stacked?: boolean;
}) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);
  const open = openIndex === null ? null : (photos[openIndex] ?? null);

  if (photos.length === 0) {
    return <p className="text-sm text-text-muted">No photos on this drill.</p>;
  }

  return (
    <>
      <ul className={cn('grid gap-2', stacked ? 'grid-cols-1' : 'grid-cols-2')}>
        {photos.map((photo, i) => (
          <li key={photo.key} className="min-w-0">
            {photo.url ? (
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                aria-label={`Open photo ${i + 1} full size`}
                className="block w-full overflow-hidden rounded-md border border-border bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <img
                  src={photo.url}
                  alt={`Drill photo ${i + 1}`}
                  loading="lazy"
                  draggable={false}
                  className={cn(
                    'mx-auto w-auto max-w-full object-contain',
                    size === 'large' ? 'max-h-[50dvh] md:max-h-[44vh]' : 'max-h-40',
                  )}
                />
              </button>
            ) : (
              <div
                className={cn(
                  'flex items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface-2 p-3 text-sm text-text-muted',
                  size === 'large' ? 'h-40' : 'h-24',
                )}
              >
                <ImageOff width={16} height={16} strokeWidth={1.75} aria-hidden />
                <span>Photo link not available. Reload to get a fresh one.</span>
              </div>
            )}
            <p className="mt-1 truncate text-xs text-text-subtle">
              Photo {i + 1} · {photo.filename} · {fileSize(photo.size)}
            </p>
          </li>
        ))}
      </ul>
      {open?.url ? (
        <ImageLightbox
          open
          onClose={() => setOpenIndex(null)}
          src={open.url}
          alt={`Drill photo ${(openIndex ?? 0) + 1}`}
          title={`Drill photo ${(openIndex ?? 0) + 1}`}
        />
      ) : null}
    </>
  );
}
