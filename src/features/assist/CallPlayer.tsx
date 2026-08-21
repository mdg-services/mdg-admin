import { AlertTriangle, Pause, Play, SkipBack } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/uploadAttachment';
import type { AssistRecordingSegmentView } from '@dk/shared';

/**
 * The recording of one call, played as one recording.
 *
 * There is no ffmpeg on the box (ADR 0009 §5.1), so a call is never joined into
 * a single file: each utterance — the visitor's and ours — is written to S3 as
 * its own object the moment it exists, and a manifest puts them in order. That
 * is a storage decision, not a listening one. Nobody wants to press play
 * fourteen times to hear a three-minute conversation, so this component hides
 * the seam entirely: one play button, one progress bar built from the segments'
 * own millisecond lengths, one clock, and click-to-seek that works out which
 * object holds that moment and how far into it to jump.
 *
 * Two things it does that a naive sequential player does not:
 *
 *  - **Preloads the next segment while the current one plays.** Without it every
 *    boundary is a fresh S3 round trip and the conversation stutters once per
 *    utterance.
 *  - **Skips a segment whose signed URL has expired or failed**, leaving a
 *    visible marker on the bar, instead of stalling the whole recording. A gap
 *    you can see is recoverable; a play button that stops working is not.
 *
 * Privacy is handled the way the client's voice notes handle it: the OS cast /
 * AirPlay route is stripped and the Now-Playing tile is cleared, so a
 * stranger's phone call cannot be pushed to a speaker in the room or surfaced
 * on a lock screen.
 */

export interface CallPlayerProps {
  segments: AssistRecordingSegmentView[];
  /**
   * Called with the segment being played (or `null` before anything is), so the
   * transcript above can highlight the line currently being spoken.
   */
  onActiveSegmentChange?: (segment: AssistRecordingSegmentView | null) => void;
  className?: string;
}

/** Strip the cast / AirPlay route and the Now-Playing tile off a hidden audio element. */
function harden(el: HTMLAudioElement | null) {
  if (!el) return;
  (el as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback =
    true;
  el.setAttribute('x-webkit-airplay', 'deny');
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
}

export function CallPlayer({
  segments,
  onActiveSegmentChange,
  className,
}: CallPlayerProps) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const preloadRef = React.useRef<HTMLAudioElement>(null);
  /** Where in the upcoming segment to resume, in ms. Consumed once, then null. */
  const pendingOffsetRef = React.useRef<number | null>(null);
  /** The URL the element is known to have loaded. See the play effect. */
  const loadedUrlRef = React.useRef<string | undefined>(undefined);
  const trackRef = React.useRef<HTMLDivElement>(null);

  const [idx, setIdx] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [posMs, setPosMs] = React.useState(0);
  const [touched, setTouched] = React.useState(false);
  /** Indexes whose audio would not load. Kept as a list so the state is a new array. */
  const [failed, setFailed] = React.useState<number[]>([]);

  /** Cumulative start offset of every segment, and the total length. */
  const { offsets, totalMs } = React.useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const s of segments) {
      out.push(acc);
      acc += Math.max(0, s.ms || 0);
    }
    return { offsets: out, totalMs: acc };
  }, [segments]);

  const playable = React.useCallback(
    (i: number) => {
      const s = segments[i];
      return !!s?.url && !failed.includes(i);
    },
    [segments, failed],
  );

  const nextPlayable = React.useCallback(
    (from: number) => {
      for (let i = from; i < segments.length; i += 1) if (playable(i)) return i;
      return -1;
    },
    [segments.length, playable],
  );

  const current = segments[idx];
  const currentUrl = playable(idx) ? current?.url : undefined;
  const nextIdx = nextPlayable(idx + 1);
  const nextUrl = nextIdx >= 0 ? segments[nextIdx]?.url : undefined;
  const elapsedMs = Math.min(totalMs, (offsets[idx] ?? 0) + posMs);
  const anyPlayable = nextPlayable(0) >= 0;

  /* Cast / AirPlay off, on both elements, once each. */
  React.useEffect(() => {
    harden(audioRef.current);
    harden(preloadRef.current);
  }, []);

  /* Tell the transcript which line is on air. */
  React.useEffect(() => {
    onActiveSegmentChange?.(touched ? (segments[idx] ?? null) : null);
  }, [idx, touched, segments, onActiveSegmentChange]);

  /* Drop the reported segment when the player unmounts, so a stale highlight
     cannot outlive the drawer it belonged to. */
  React.useEffect(
    () => () => onActiveSegmentChange?.(null),
    [onActiveSegmentChange],
  );

  const markFailed = React.useCallback((i: number) => {
    setFailed((prev) => (prev.includes(i) ? prev : [...prev, i]));
  }, []);

  /**
   * Start (or resume) the segment on screen.
   *
   * React has already swapped `src` by the time this runs, so all that is left
   * is to honour a pending seek offset and press play. Waiting for
   * `loadedmetadata` is the fiddly half: setting `currentTime` on an element
   * that has not read its duration yet is silently dropped, which is how a
   * mid-call seek lands back at the start of the utterance.
   *
   * `readyState` alone is not a safe test for that, because it can still be
   * reporting the PREVIOUS object in the moment after `src` changes. So the
   * element is treated as ready only when it has told us it loaded this exact
   * URL — resuming the same segment goes immediately, crossing into a new one
   * always waits.
   */
  React.useEffect(() => {
    const el = audioRef.current;
    if (!el || !playing) return;
    if (!currentUrl) return;

    let cancelled = false;
    const go = () => {
      if (cancelled) return;
      loadedUrlRef.current = currentUrl;
      const pending = pendingOffsetRef.current;
      pendingOffsetRef.current = null;
      if (pending !== null && pending > 0) {
        try {
          el.currentTime = pending / 1000;
        } catch {
          /* Not seekable yet — playback starts from the top of the segment. */
        }
      }
      void el.play().catch(() => markFailed(idx));
    };

    if (el.readyState >= 1 && loadedUrlRef.current === currentUrl) {
      go();
      return () => {
        cancelled = true;
      };
    }
    el.addEventListener('loadedmetadata', go, { once: true });
    return () => {
      cancelled = true;
      el.removeEventListener('loadedmetadata', go);
    };
  }, [idx, playing, currentUrl, markFailed]);

  const stop = React.useCallback(() => {
    const el = audioRef.current;
    el?.pause();
    setPlaying(false);
  }, []);

  const advance = React.useCallback(() => {
    const n = nextPlayable(idx + 1);
    if (n < 0) {
      // End of the recording: rest at the very end rather than snapping to the
      // start, so "we listened to all of it" stays on screen.
      setPosMs(Math.max(0, totalMs - (offsets[idx] ?? 0)));
      stop();
      return;
    }
    pendingOffsetRef.current = 0;
    setPosMs(0);
    setIdx(n);
  }, [idx, nextPlayable, offsets, totalMs, stop]);

  function toggle() {
    const el = audioRef.current;
    if (!el || !anyPlayable) return;
    setTouched(true);
    if (playing) {
      stop();
      return;
    }
    // Finished, or parked on a dead segment: rewind to the first playable one.
    if (!playable(idx) || elapsedMs >= totalMs - 50) {
      const first = nextPlayable(0);
      if (first < 0) return;
      pendingOffsetRef.current = 0;
      setPosMs(0);
      setIdx(first);
    }
    setPlaying(true);
  }

  const seekTo = React.useCallback(
    (ms: number) => {
      if (totalMs <= 0) return;
      const clamped = Math.max(0, Math.min(totalMs, ms));
      // The segment holding that instant; if it is unplayable, the next one that is.
      let i = 0;
      for (let k = 0; k < segments.length; k += 1) {
        if (clamped >= (offsets[k] ?? 0)) i = k;
      }
      if (!playable(i)) {
        const n = nextPlayable(i + 1);
        if (n < 0) return;
        i = n;
      }
      const offset = Math.max(0, clamped - (offsets[i] ?? 0));
      setTouched(true);
      pendingOffsetRef.current = offset;
      setPosMs(offset);
      if (i === idx) {
        const el = audioRef.current;
        if (el) {
          try {
            el.currentTime = offset / 1000;
          } catch {
            /* Applied on the next play instead. */
          }
        }
      } else {
        setIdx(i);
      }
    },
    [totalMs, segments.length, offsets, playable, nextPlayable, idx],
  );

  function seekFromPointer(clientX: number) {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    seekTo(((clientX - box.left) / box.width) * totalMs);
  }

  function restart() {
    const first = nextPlayable(0);
    if (first < 0) return;
    setTouched(true);
    pendingOffsetRef.current = 0;
    setPosMs(0);
    setIdx(first);
  }

  if (segments.length === 0) return null;

  const skipped = segments.filter((_s, i) => !playable(i)).length;

  return (
    <div className={cn('rounded-md border border-border bg-surface p-3', className)}>
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={toggle}
          disabled={!anyPlayable}
          aria-label={playing ? 'Pause the recording' : 'Play the recording'}
          leftIcon={
            playing ? (
              <Pause width={14} height={14} strokeWidth={2} />
            ) : (
              <Play width={14} height={14} strokeWidth={2} />
            )
          }
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={restart}
          disabled={!anyPlayable}
          aria-label="Back to the start of the recording"
          leftIcon={<SkipBack width={14} height={14} strokeWidth={2} />}
        >
          Start
        </Button>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-text-muted">
          {formatDuration(elapsedMs)} / {formatDuration(totalMs)}
        </span>
      </div>

      {/* One bar across the whole call. Each block is one utterance, sized by its
          own milliseconds, with hairline gaps so the turn-taking is visible
          without spending a second colour on it. */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={anyPlayable ? 0 : -1}
        aria-label="Position in the recording"
        aria-valuemin={0}
        aria-valuemax={Math.round(totalMs)}
        aria-valuenow={Math.round(elapsedMs)}
        aria-valuetext={`${formatDuration(elapsedMs)} of ${formatDuration(totalMs)}`}
        onClick={(e) => seekFromPointer(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            seekTo(elapsedMs + 5000);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            seekTo(elapsedMs - 5000);
          } else if (e.key === 'Home') {
            e.preventDefault();
            seekTo(0);
          } else if (e.key === 'End') {
            e.preventDefault();
            seekTo(totalMs);
          }
        }}
        className="mt-3 flex h-11 w-full cursor-pointer items-center gap-px rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:h-6"
      >
        {segments.map((s, i) => {
          const dead = !playable(i);
          const fillPct =
            i < idx ? 100 : i > idx ? 0 : s.ms > 0 ? Math.min(100, (posMs / s.ms) * 100) : 0;
          return (
            <div
              key={`${s.seq}-${s.key}`}
              style={{ flexGrow: Math.max(1, s.ms || 1) }}
              title={
                dead
                  ? 'This part of the recording could not be loaded'
                  : `${s.role === 'visitor' ? 'Visitor' : 'Assistant'} · ${formatDuration(s.ms)}`
              }
              className={cn(
                'h-2.5 min-w-[2px] overflow-hidden rounded-[2px]',
                dead ? 'chart-hatch bg-danger-soft' : 'bg-brand-soft',
                // The assistant's turns sit a shade lower so the back-and-forth
                // is readable as shape, not as a second hue.
                s.role === 'assistant' && !dead ? 'h-1.5 self-center' : null,
              )}
            >
              {dead ? null : (
                <div className="h-full bg-brand" style={{ width: `${fillPct}%` }} />
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-text-subtle">
        {segments.length} {segments.length === 1 ? 'utterance' : 'utterances'}, played
        end to end.
        {skipped > 0 ? (
          <span className="ml-1 inline-flex items-center gap-1 text-danger">
            <AlertTriangle width={12} height={12} strokeWidth={2} aria-hidden />
            {skipped} could not be loaded and {skipped === 1 ? 'is' : 'are'} skipped
            (marked on the bar).
          </span>
        ) : null}
      </p>

      <audio
        ref={audioRef}
        src={currentUrl}
        preload="auto"
        // Recorded here, not only in the play effect: a segment can finish
        // loading while the player is paused, and the effect's one-shot
        // listener would then be waiting for an event that has already been
        // and gone — a play button that does nothing.
        onLoadedMetadata={() => {
          loadedUrlRef.current = currentUrl;
        }}
        onPlay={() => setPlaying(true)}
        // Reaching the end of an utterance fires `pause` BEFORE `ended` — the
        // spec sets `paused` and fires both from one task, in that order. Taking
        // that as "the listener stopped it" clears `playing`, and then `advance`
        // loads the next segment into an element the play effect has already
        // given up on: the recording dies at the first boundary and the call has
        // to be played one utterance per click. The element's own `ended` flag is
        // already true at that moment, which is exactly what tells this apart
        // from somebody pressing Pause.
        onPause={(e) => {
          if (e.currentTarget.ended) return;
          setPlaying(false);
        }}
        onEnded={advance}
        onError={() => {
          markFailed(idx);
          advance();
        }}
        onTimeUpdate={(e) => setPosMs(e.currentTarget.currentTime * 1000)}
        className="hidden"
      />
      {/* The next utterance, fetched while this one plays. Never started — its
          only job is to be in the browser's cache before it is needed. */}
      <audio ref={preloadRef} src={nextUrl} preload="auto" muted className="hidden" />
    </div>
  );
}
