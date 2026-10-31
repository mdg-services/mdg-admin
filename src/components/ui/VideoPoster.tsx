import { Play, Video } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * A video's picture in a list: its poster frame, the length in a chip, a play mark.
 *
 * The library mixes shapes — the team's walkthroughs are landscape, a dealer's
 * guide and the public explainers are phone-shaped — so the box keeps one shape
 * and the picture is never cropped: a portrait poster sits in the middle over a
 * blurred copy of itself, the way a phone's gallery shows one. A video with no
 * poster yet (not uploaded) shows a plain tile with its kind, never a broken image.
 */
export function VideoPoster({
  src,
  length,
  className,
  play = true,
  label,
}: {
  src: string | null;
  /** "1:35", or '' when not known. */
  length?: string;
  className?: string;
  /** Show the round play mark over the middle. */
  play?: boolean;
  /** What the tile says when there is no picture: "Team", "Pump know-how". */
  label?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  const showImage = Boolean(src) && !failed;

  return (
    <div className={cn('relative isolate overflow-hidden rounded-md bg-surface-2', className)}>
      {showImage ? (
        <>
          <img
            src={src ?? undefined}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover opacity-50 blur-lg"
          />
          <img
            src={src ?? undefined}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-text-subtle">
          <Video width={22} height={22} strokeWidth={1.5} aria-hidden />
          {label ? <span className="px-2 text-center text-[11px] font-medium">{label}</span> : null}
        </div>
      )}
      {play && showImage ? (
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white"
        >
          <Play
            width={16}
            height={16}
            strokeWidth={2}
            className="translate-x-px"
            fill="currentColor"
          />
        </span>
      ) : null}
      {length ? (
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-px text-[11px] font-medium tabular-nums text-white">
          {length}
        </span>
      ) : null}
    </div>
  );
}
