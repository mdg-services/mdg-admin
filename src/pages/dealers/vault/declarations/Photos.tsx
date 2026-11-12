import { ImageOff } from 'lucide-react';
import * as React from 'react';

import { ImageLightbox } from '@/components/ui';
import { WASHROOM_PHOTO_SLOTS, type WashroomPhotoSlot, type WashroomPhotoView } from '@dk/shared';

import { fileSize } from './format';

const SLOT_WORDS: Record<WashroomPhotoSlot, string> = {
  outside: 'Outside the toilet',
  inside: 'Inside the toilet',
};

/**
 * The washroom's two photos as thumbnails, from their short-lived signed links.
 * A tap opens the photo full size (pinch-zoom on a phone).
 *
 * `showMissing` draws an empty box for a slot the owner has not sent yet, so the
 * admin sees "1 of 2" at a glance. The filings table passes `false`: a past
 * filing only shows what was filed.
 */
export function WashroomPhotos({
  photos,
  showMissing = true,
}: {
  photos: readonly WashroomPhotoView[];
  showMissing?: boolean;
}) {
  const [openSlot, setOpenSlot] = React.useState<WashroomPhotoSlot | null>(null);
  const open = openSlot ? (photos.find((p) => p.slot === openSlot) ?? null) : null;

  const slots = WASHROOM_PHOTO_SLOTS.filter(
    (slot) => showMissing || photos.some((p) => p.slot === slot),
  );
  if (slots.length === 0) {
    return <p className="text-sm text-text-muted">No photos.</p>;
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-2">
        {slots.map((slot) => {
          const photo = photos.find((p) => p.slot === slot);
          return (
            <li key={slot} className="min-w-0">
              {photo ? (
                photo.url ? (
                  <button
                    type="button"
                    onClick={() => setOpenSlot(slot)}
                    aria-label={`Open the photo from ${SLOT_WORDS[slot].toLowerCase()} full size`}
                    className="block w-full overflow-hidden rounded-md border border-border bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <img
                      src={photo.url}
                      alt={SLOT_WORDS[slot]}
                      loading="lazy"
                      draggable={false}
                      className="mx-auto max-h-32 w-auto max-w-full object-contain"
                    />
                  </button>
                ) : (
                  <div className="flex h-24 items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface-2 p-3 text-sm text-text-muted">
                    <ImageOff width={16} height={16} strokeWidth={1.75} aria-hidden />
                    <span>Photo link not available. Reload to get a fresh one.</span>
                  </div>
                )
              ) : (
                <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-surface-2 p-3 text-center text-sm text-text-muted">
                  Not sent yet
                </div>
              )}
              <p className="mt-1 text-xs text-text-subtle">
                <span className="block font-medium text-text-muted">{SLOT_WORDS[slot]}</span>
                {photo ? (
                  <span className="block truncate">
                    {fileSize(photo.size)} · {photo.filename}
                  </span>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
      {open?.url ? (
        <ImageLightbox
          open
          onClose={() => setOpenSlot(null)}
          src={open.url}
          alt={SLOT_WORDS[open.slot]}
          title={SLOT_WORDS[open.slot]}
        />
      ) : null}
    </>
  );
}
