import { VideoOff } from 'lucide-react';
import * as React from 'react';

import { useGuideVideoPlay } from '@/hooks/api/useGuideVideos';
import { cn } from '@/lib/cn';
import { chapterAt, clock } from '@/lib/guideVideos';

import { Button } from './Button';
import { Skeleton } from './Skeleton';

/**
 * One guide video, played in the portal, with its chapters to jump between.
 *
 * It asks the server for the video the moment it is shown (`GET
 * /admin/guide-videos/:id`, a link signed for a few minutes) and plays from the
 * second a deep link names. The chapters come back with it, so "jump to" costs no
 * second request. If the browser cannot play the link — it expired, or the signal
 * dropped — it asks once more, and after that says so with a button to try again.
 *
 * The video is landscape for the team's walkthroughs and portrait for a dealer's,
 * and is never stretched: the box takes the video's shape (16:9, or a phone's 9:16
 * held to the height of the screen) and the picture sits inside it.
 */
export function GuideVideoPlayer({
  id,
  startSec,
  title,
  shape = 'landscape',
  poster,
  autoPlay = true,
  showChapters = true,
  compact = false,
}: {
  id: string;
  /** Where to begin, in seconds. 0 for the start. */
  startSec: number;
  title: string;
  /** The video's shape: the team's walkthroughs are landscape, a dealer's guide is a phone's. */
  shape?: 'landscape' | 'portrait';
  /** The picture to show while it loads. */
  poster?: string | null;
  autoPlay?: boolean;
  /** List the chapters under it, to jump between. */
  showChapters?: boolean;
  /** In a narrow column: a phone-shaped video takes the column's width, not the screen's height. */
  compact?: boolean;
}) {
  const play = useGuideVideoPlay(id, startSec);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const refreshed = React.useRef(false);
  const [position, setPosition] = React.useState(startSec);
  const [broken, setBroken] = React.useState(false);

  const data = play.data;
  const chapters = React.useMemo(() => data?.chapters ?? [], [data]);
  const starts = React.useMemo(() => chapters.map((c) => c.startSec), [chapters]);
  const current = chapterAt(starts, position);

  // A new link is a new element: the browser starts it cleanly, from the chapter.
  const src = data
    ? `${data.url}${data.url.includes('#') ? '' : `#t=${data.startSec > 0 ? data.startSec : 0.1}`}`
    : undefined;

  const onError = () => {
    if (!refreshed.current) {
      refreshed.current = true;
      void play.refetch();
    } else {
      setBroken(true);
    }
  };

  const tryAgain = () => {
    refreshed.current = false;
    setBroken(false);
    void play.refetch();
  };

  const jump = (sec: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = sec;
    void el.play().catch(() => undefined);
    setPosition(sec);
  };

  const failed = play.isError || broken;

  return (
    <div className="grid gap-3">
      <div
        className={cn(
          'relative overflow-hidden rounded-md bg-black',
          shape === 'landscape'
            ? 'aspect-video w-full'
            : compact
              ? 'aspect-[9/16] w-full'
              : 'mx-auto aspect-[9/16] h-[min(62vh,560px)] max-w-full',
        )}
        data-testid="guide-video-box"
      >
        {src && !failed ? (
          <video
            key={src}
            ref={videoRef}
            src={src}
            data-testid="guide-video"
            controls
            autoPlay={autoPlay}
            poster={poster ?? undefined}
            playsInline
            preload="metadata"
            disablePictureInPicture
            controlsList="nodownload noremoteplayback"
            aria-label={title}
            onError={onError}
            onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : null}
        {play.isPending && !failed ? (
          <Skeleton className="absolute inset-0 rounded-none bg-surface-2/20" />
        ) : null}
        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white/85">
            <VideoOff width={28} height={28} strokeWidth={1.5} aria-hidden />
            <p className="text-sm">This video did not play. Check the connection and try again.</p>
            <Button variant="secondary" size="sm" onClick={tryAgain}>
              Try again
            </Button>
          </div>
        ) : null}
      </div>

      {showChapters && chapters.length > 1 ? (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-subtle">
            In this video
          </p>
          <ol className="grid gap-0.5">
            {chapters.map((c, i) => (
              <li key={c.startSec}>
                <button
                  type="button"
                  onClick={() => jump(c.startSec)}
                  aria-current={i === current ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2',
                    i === current ? 'bg-surface-2 font-medium text-text' : 'text-text-muted',
                  )}
                >
                  <span className="w-10 shrink-0 tabular-nums text-xs text-text-subtle">
                    {clock(c.startSec)}
                  </span>
                  <span className="min-w-0">{c.label.en}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
