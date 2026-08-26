import { AlertTriangle, Pause, Play, RotateCcw, RotateCw, SkipBack } from 'lucide-react';
import * as React from 'react';

import { Button, IconButton } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
// Aliased on import: `@/lib/format` exports a DIFFERENT `formatDuration` that
// renders `3m 4s`, and `SessionDrawer` — the only place this player is used —
// imports that one for its header. Two functions of the same name printing the
// same milliseconds two ways into one panel is a trap; the clock keeps the
// clock name here.
import { formatDuration as formatClock } from '@/lib/uploadAttachment';
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
 * THE TWO RULES THAT KEEP PLAY WORKING ON A PHONE
 * -----------------------------------------------
 * 1. **`play()` is called inside the click handler, not from an effect.** A
 *    WebView only honours playback that starts inside a user gesture, and the
 *    gesture window closes the moment the handler returns. Setting React state
 *    and letting the effect below press play means the call happens a tick (or,
 *    when the element still has to load, a whole network round trip) later — by
 *    which time the browser refuses. The effect is still here, but only for the
 *    resume path: crossing into a segment the element has not loaded yet, where
 *    there is no gesture to preserve because the element has already been
 *    unlocked by the tap that started the recording.
 * 2. **Only a genuinely dead object marks a segment failed.** `play()` rejects
 *    for three quite different reasons and the old code treated all of them as
 *    "this audio is broken": `AbortError` fires at EVERY segment boundary and
 *    on every seek, because swapping `src` interrupts the play in flight;
 *    `NotAllowedError` means the gesture was not honoured and the recording is
 *    perfectly fine. Marking the segment failed on those two poisoned one index
 *    per tap until `Play` went disabled with no way back inside the session —
 *    and the `<audio>` is hidden, so there were no native controls to fall back
 *    on either. Now `AbortError` is ignored, `NotAllowedError` says "tap Play
 *    again", and anything that IS a dead object can still be retried from the
 *    bar's own control.
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

/** How far one tap of the skip buttons moves the playhead. */
const SKIP_MS = 10_000;

/**
 * Past this many utterances the per-turn bar is not a bar any more.
 *
 * A 15-minute call with short turns runs to ~100 blocks; at 2px plus a hairline
 * gap that is 299px of minimum width inside a ~304px track, and the next
 * utterance spills out of the bordered box and gives the whole drawer a
 * sideways scroll. The turn-taking texture is unreadable at that density
 * anyway, so below md a long call gets one plain progress bar instead.
 */
const DENSE_SEGMENTS = 60;

/** Strip the cast / AirPlay route and the Now-Playing tile off a hidden audio element. */
function harden(el: HTMLAudioElement | null) {
  if (!el) return;
  (el as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback =
    true;
  el.setAttribute('x-webkit-airplay', 'deny');
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
}

/**
 * The `name` off a rejected `play()`.
 *
 * Read by duck typing rather than `instanceof DOMException`: a DOMException is
 * not an `Error` in every engine, and the one thing every one of them agrees on
 * is that it carries a `name`.
 */
function errorName(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'name' in err) {
    return String((err as { name: unknown }).name);
  }
  return '';
}

function roleName(segment: AssistRecordingSegmentView): string {
  return segment.role === 'visitor' ? 'Visitor' : 'Assistant';
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
  /** True between pointerdown and pointerup on the track — a scrub in progress. */
  const scrubbingRef = React.useRef(false);

  const isMd = useMediaQuery('(min-width: 768px)');

  const [idx, setIdx] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [posMs, setPosMs] = React.useState(0);
  const [touched, setTouched] = React.useState(false);
  /** Indexes whose audio would not load. Kept as a list so the state is a new array. */
  const [failed, setFailed] = React.useState<number[]>([]);
  /** The browser refused a play() for want of a gesture. Cleared by the next one. */
  const [needsTap, setNeedsTap] = React.useState(false);

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

  /** The first segment that has a URL at all, ignoring what we marked failed. */
  const firstWithUrl = React.useCallback(() => {
    for (let i = 0; i < segments.length; i += 1) if (segments[i]?.url) return i;
    return -1;
  }, [segments]);

  const current = segments[idx];
  const currentUrl = playable(idx) ? current?.url : undefined;
  const nextIdx = nextPlayable(idx + 1);
  const nextUrl = nextIdx >= 0 ? segments[nextIdx]?.url : undefined;
  const elapsedMs = Math.min(totalMs, (offsets[idx] ?? 0) + posMs);
  const anyPlayable = nextPlayable(0) >= 0;
  /** There is audio to try, even if every index is currently marked failed. */
  const hasAudio = segments.some((s) => !!s.url);

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
   * What to do with a rejected `play()`, by reason.
   *
   * The three cases are genuinely different and used to be collapsed into one
   * `markFailed`, which is what made a single bad tap permanent. See the note
   * at the top of the file.
   */
  const onPlayRejected = React.useCallback(
    (err: unknown, i: number) => {
      const name = errorName(err);
      // The src was swapped out from under this play(). That happens at every
      // segment boundary and on every seek; the new src has its own play()
      // coming. Nothing is wrong.
      if (name === 'AbortError') return;
      // The browser would not start audio without a gesture it recognised. The
      // recording is fine — the tap was not honoured — so say so and stop.
      if (name === 'NotAllowedError') {
        setNeedsTap(true);
        setPlaying(false);
        return;
      }
      // Everything left means this object will not play: an expired signed URL,
      // a codec the WebView will not take. Mark it, skip it, keep going.
      markFailed(i);
      setPlaying(false);
    },
    [markFailed],
  );

  const attemptPlay = React.useCallback(
    (el: HTMLAudioElement, i: number) => {
      void el.play().catch((err: unknown) => onPlayRejected(err, i));
    },
    [onPlayRejected],
  );

  /**
   * Resume the segment on screen after React has swapped `src`.
   *
   * This is the CROSS-SEGMENT path only — the gesture-carrying first press is
   * handled synchronously in `toggle` (see the note at the top). By the time
   * this runs the element has already been unlocked by that press, so a
   * programmatic play is allowed.
   *
   * Waiting for `loadedmetadata` is the fiddly half: setting `currentTime` on
   * an element that has not read its duration yet is silently dropped, which is
   * how a mid-call seek lands back at the start of the utterance.
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
      if (!el.paused) return;
      attemptPlay(el, idx);
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
  }, [idx, playing, currentUrl, attemptPlay]);

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
    if (!el || !hasAudio) return;
    setTouched(true);
    setNeedsTap(false);

    if (playing) {
      stop();
      return;
    }

    // Every index has been marked failed — the dead end the old error handling
    // used to leave behind. Clear the marks and start over rather than
    // presenting a disabled button with nothing behind it.
    const retryAll = !anyPlayable;
    const finished = elapsedMs >= totalMs - 50;
    let startAt = idx;
    if (retryAll) startAt = firstWithUrl();
    else if (!playable(idx) || finished) startAt = nextPlayable(0);
    if (startAt < 0) return;

    if (retryAll) setFailed([]);
    if (startAt !== idx) {
      pendingOffsetRef.current = 0;
      setPosMs(0);
      setIdx(startAt);
    }

    // THE GESTURE. Called here, synchronously, and not from the effect above:
    // the effect runs after React has committed and — for a segment the element
    // has not loaded — after a network round trip, by which time the browser no
    // longer sees a user gesture and refuses. The condition is exactly "the
    // element already holds the object we are about to play"; the cross-segment
    // case falls through to the effect, which is allowed because this same tap
    // has unlocked the element.
    if (startAt === idx && currentUrl) {
      const pending = pendingOffsetRef.current;
      pendingOffsetRef.current = null;
      if (pending !== null && pending > 0) {
        try {
          el.currentTime = pending / 1000;
        } catch {
          /* Applied by the effect once the metadata lands. */
        }
      }
      attemptPlay(el, idx);
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
  const dense = !isMd && segments.length > DENSE_SEGMENTS;
  const playedPct = totalMs > 0 ? Math.min(100, (elapsedMs / totalMs) * 100) : 0;

  return (
    <div className={cn('rounded-md border border-border bg-surface p-3', className)}>
      {/* Wraps rather than one nowrap row: four transport controls plus the
          clock need ~350px and the drawer offers ~280px at 360px, and `main`
          clips rather than scrolls. At md every one of them fits the single
          line it always had. */}
      <div className="flex flex-wrap items-center gap-2">
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
        {/* Seek by a fixed step, on screen. It existed only as ArrowLeft /
            ArrowRight on the scrub bar, and a phone has no arrow keys — so the
            only touch seek was a single tap on a ~304px track, which for a
            15-minute call is about 3 seconds per pixel. */}
        <IconButton
          size="sm"
          aria-label="Back ten seconds"
          onClick={() => seekTo(elapsedMs - SKIP_MS)}
          disabled={!anyPlayable}
        >
          <RotateCcw width={16} height={16} strokeWidth={2} />
        </IconButton>
        <Button
          variant="secondary"
          size="sm"
          onClick={toggle}
          disabled={!hasAudio}
          aria-label={playing ? 'Pause the recording' : 'Play the recording'}
          leftIcon={
            playing ? (
              <Pause width={14} height={14} strokeWidth={2} />
            ) : (
              <Play width={14} height={14} strokeWidth={2} />
            )
          }
        >
          {playing ? 'Pause' : hasAudio && !anyPlayable ? 'Try again' : 'Play'}
        </Button>
        <IconButton
          size="sm"
          aria-label="Forward ten seconds"
          onClick={() => seekTo(elapsedMs + SKIP_MS)}
          disabled={!anyPlayable}
        >
          <RotateCw width={16} height={16} strokeWidth={2} />
        </IconButton>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-text-muted">
          {formatClock(elapsedMs)} / {formatClock(totalMs)}
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
        aria-valuetext={`${formatClock(elapsedMs)} of ${formatClock(totalMs)}`}
        // Drag, not just tap. `touch-pan-y` is what makes it a drag and not a
        // fight with the sheet: a vertical swipe still scrolls the drawer (the
        // browser cancels the pointer), while a horizontal one is ours.
        onPointerDown={(e) => {
          if (!anyPlayable) return;
          scrubbingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!scrubbingRef.current) return;
          seekFromPointer(e.clientX);
        }}
        onPointerUp={(e) => {
          scrubbingRef.current = false;
          // Guarded: a pointerup can arrive without a matching capture — the
          // press landed while the bar was disabled, or the browser released it
          // when the gesture became a scroll — and releasing one we never took
          // throws.
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => {
          scrubbingRef.current = false;
        }}
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
        className="mt-3 flex h-11 w-full touch-pan-y cursor-pointer items-center gap-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:h-6 md:gap-px"
      >
        {dense ? (
          // One plain bar. See DENSE_SEGMENTS: past ~60 utterances the per-turn
          // blocks are wider than the track and spill out of the card.
          <div className="h-2.5 w-full overflow-hidden rounded-[2px] bg-brand-soft">
            <div className="h-full bg-brand" style={{ width: `${playedPct}%` }} />
          </div>
        ) : (
          segments.map((s, i) => {
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
                    : `${roleName(s)} · ${formatClock(s.ms)}`
                }
                className={cn(
                  // `min-w-px` below md: at 2px plus a gap, a hundred-utterance
                  // call is wider than the track and overflows the card.
                  'h-2.5 min-w-px overflow-hidden rounded-[2px] md:min-w-[2px]',
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
          })
        )}
      </div>

      {/* Who is speaking, in words. It used to live only in each block's `title`
          — invisible on touch — with the visitor/assistant distinction carried
          otherwise by a 1px height difference on a 2-8px block. */}
      {current ? (
        <p className="mt-2 text-xs text-text-muted">
          <span className="font-medium text-text">
            {playing ? 'Playing' : touched ? 'Paused in' : 'Starts with'}
          </span>{' '}
          {roleName(current)} · {formatClock(current.ms)}
          {playable(idx) ? null : ' · this part could not be loaded'}
        </p>
      ) : null}

      {needsTap ? (
        <p className="mt-2 text-xs text-warning">
          The browser would not start the audio on that tap. Tap Play again — the
          recording itself is fine.
        </p>
      ) : null}

      {/* Below md the player is pinned to the bottom of the sheet, and every
          line it keeps is a line of transcript it covers — so the standing "N
          utterances" description only renders where there is room for it. The
          warning about skipped parts is operational and always renders. */}
      {isMd || skipped > 0 ? (
        <p className="mt-2 text-xs text-text-subtle">
          <span className="hidden md:inline">
            {segments.length} {segments.length === 1 ? 'utterance' : 'utterances'},
            played end to end.
          </span>
          {skipped > 0 ? (
            <span className="inline-flex items-center gap-1 text-danger md:ml-1">
              <AlertTriangle width={12} height={12} strokeWidth={2} aria-hidden />
              {skipped} could not be loaded and {skipped === 1 ? 'is' : 'are'} skipped
              (marked on the bar).
            </span>
          ) : null}
        </p>
      ) : null}

      {/* The escape hatch. A signed URL that had expired when it was first tried
          usually works on the next request, and without this the marks last as
          long as the drawer is open. */}
      {skipped > 0 ? (
        <button
          type="button"
          onClick={() => {
            setFailed([]);
            setNeedsTap(false);
          }}
          className="tap-target mt-1 w-fit rounded-sm px-1 py-1 text-left text-xs font-medium text-brand"
        >
          Try the skipped parts again
        </button>
      ) : null}

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
        onPlay={() => {
          setNeedsTap(false);
          setPlaying(true);
        }}
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
        // The element's own error event, unlike a rejected play(), only ever
        // means the object itself would not load. This is the honest source for
        // a failed segment.
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
