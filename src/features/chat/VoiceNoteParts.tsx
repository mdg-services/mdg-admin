import { MicOff, Pause, Play, Send, Trash2, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/uploadAttachment';
import type { VoiceRecording } from '@/lib/useVoiceRecorder';

/**
 * The pieces of the voice-note bar that are only pictures and words: the strip
 * that says why the mic did not start, the bar while recording, and the review
 * step for a recording the phone stopped. `useVoiceNote` makes every decision;
 * these only draw what it decided. The same states and words as the dealer
 * app's chat, in the team app's English.
 */

/**
 * Why the mic did not start, as one of a few things the person can act on.
 *
 *  - `failed`         — it did not start, after the quiet retry. Try again.
 *  - `muted`          — the phone gave us a mic it was using (a call, Siri). We
 *                       know this one for certain, so we may say so.
 *  - `app-update`     — an Android phone app built without the mic fix.
 *  - `refused`        — permission is off and the phone will still ask: Allow.
 *  - `settings`       — permission is off and only the phone's Settings can
 *                       turn it on (the team app cannot open Settings itself).
 *  - `restart`        — the phone says the mic is allowed, yet it is refused
 *                       anyway. Only closing and reopening the app clears it.
 *  - `blocked-browser`— a laptop or phone browser refused; its site settings fix it.
 *  - `missing`        — no microphone at all.
 *  - `unavailable`    — this browser cannot record voice notes.
 *  - `explainer`      — not a failure: the one-time note before the phone's own
 *                       permission dialog, so the dialog is not refused cold.
 */
export type MicStripKind =
  | 'failed'
  | 'muted'
  | 'app-update'
  | 'refused'
  | 'settings'
  | 'restart'
  | 'blocked-browser'
  | 'missing'
  | 'unavailable'
  | 'explainer';

export interface MicStripAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

/**
 * The words for each strip. One place, so a test can check that none of them
 * claims another app has the mic (we never know that) or sends anyone round the
 * old "Microphone enabled. Tap the mic again" loop.
 *
 * The `-android` entries are for Android 11 and later, whose permission screen
 * has no "Allow" for the mic, only "While using the app" (lib/micPolicy).
 */
export const MIC_STRIP_TEXT: Record<
  MicStripKind | 'app-update-live' | 'refused-android' | 'explainer-android',
  { title: string; hint?: string }
> = {
  failed: {
    title: "The mic didn't start",
    hint: "Try again. If you're on a call, finish it first.",
  },
  muted: {
    title: 'The phone is using the mic right now (a call?)',
    hint: 'Finish the call, then try again.',
  },
  'app-update': {
    title: 'Voice notes will work after the next app update',
    hint: 'Until then, please type your message.',
  },
  'app-update-live': {
    title: 'Voice notes need the latest Admin Dealer Kavach app.',
    hint: 'Update it from the Play Store, then open this chat again.',
  },
  refused: {
    title: 'Microphone permission is off',
    hint: 'Tap Allow, then choose “Allow” on the next screen.',
  },
  'refused-android': {
    title: 'Microphone permission is off',
    hint: 'Tap Allow, then choose “While using the app” on the next screen.',
  },
  settings: {
    title: 'Turn on the microphone in Settings',
    hint: "Open your phone's Settings, find Admin Dealer Kavach, turn on Microphone, then come back and tap the mic.",
  },
  restart: {
    title: "The mic is allowed, but it won't start",
    hint: 'Close the app completely, open it again, then tap the mic.',
  },
  'blocked-browser': {
    title: 'This browser has blocked the microphone',
    hint: 'Allow the microphone for this site (the lock or settings icon beside the web address), then tap the mic again.',
  },
  missing: {
    title: 'No microphone found',
    hint: 'Connect or turn on a microphone, or type your message.',
  },
  unavailable: {
    title: "Voice notes don't work in this browser",
    hint: 'Please type your message, or use the latest Chrome or Safari.',
  },
  explainer: {
    title: 'To send voice notes, the app needs the microphone.',
    hint: 'On the next screen, tap Allow.',
  },
  'explainer-android': {
    title: 'To send voice notes, the app needs the microphone.',
    hint: 'On the next screen, tap “While using the app”.',
  },
};

/** Labels on the strip's buttons. */
export const MIC_ACTION_TEXT = {
  tryAgain: 'Try again',
  typeInstead: 'Type instead',
  allow: 'Allow',
  update: 'Update from Play Store',
  ok: 'OK',
} as const;

/**
 * The strip above the box when the mic did not start.
 *
 * NOT A PASSING LINE OF RED TEXT. It stays until recording starts, the person
 * types, or the chat changes, and carries the one button that helps. Polite live
 * region: read out once, never interrupting.
 */
export function MicStatusStrip({
  title,
  hint,
  actions,
  tone = 'neutral',
  onDismiss,
}: {
  title: string;
  hint?: string;
  actions: MicStripAction[];
  tone?: 'neutral' | 'warning';
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'mb-2 flex items-start gap-2 rounded-md border px-3 py-2',
        tone === 'warning'
          ? 'border-warning/40 bg-warning-soft text-warning-strong'
          : 'border-border bg-surface-2 text-text',
      )}
    >
      <MicOff width={16} height={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{title}</p>
        {hint ? <p className="mt-0.5 text-xs leading-snug text-text-muted">{hint}</p> : null}
        {actions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button
                key={a.label}
                type="button"
                size="sm"
                variant={a.primary ? 'primary' : 'secondary'}
                onClick={a.onClick}
              >
                {a.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="tap-target -my-1 shrink-0 rounded-sm p-1 text-text-muted hover:text-text"
      >
        <X width={14} height={14} strokeWidth={2} />
      </button>
    </div>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/**
 * A small level meter while recording, so the person can see the mic hears
 * them. Read on each animation frame, without a re-render per frame. Nothing
 * moves for someone who asked for less motion.
 */
function LiveMeter({ getLevels, bars = 16 }: { getLevels: () => number[]; bars?: number }) {
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el || typeof requestAnimationFrame === 'undefined') return;
    const kids = Array.from(el.children) as HTMLElement[];
    let raf = 0;
    const loop = () => {
      const levels = getLevels();
      const offset = levels.length - kids.length;
      kids.forEach((kid, i) => {
        const v = levels[offset + i] ?? 0;
        kid.style.transform = `scaleY(${(0.1 + Math.min(1, v) * 0.9).toFixed(3)})`;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced, getLevels]);
  if (reduced) return null;
  return (
    <div ref={ref} aria-hidden className="hidden h-5 items-center gap-[3px] text-text-subtle sm:flex">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="h-full w-[3px] origin-center rounded-full bg-current"
          style={{ transform: 'scaleY(0.1)' }}
        />
      ))}
    </div>
  );
}

/**
 * The bar while a voice note is being made.
 *
 * OPENING shows "Starting mic…" with no clock: a clock running before the mic is
 * open promised a recording that had not begun, and the first words were lost.
 * The bin works at once; Send waits until there is something to send.
 */
export function VoiceRecordingBar({
  opening,
  elapsedMs,
  getLevels,
  sending,
  onCancel,
  onSend,
}: {
  opening: boolean;
  elapsedMs: number;
  getLevels: () => number[];
  sending: boolean;
  onCancel: () => void;
  onSend: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel recording"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text md:h-9 md:w-9"
      >
        <Trash2 width={18} height={18} strokeWidth={1.75} />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2" role="status" aria-live="polite">
        {opening ? (
          <>
            <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-text-subtle" />
            <span className="truncate text-sm text-text-subtle">Starting mic…</span>
          </>
        ) : (
          <>
            <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-danger" />
            <span className="text-sm font-medium tabular-nums text-text">{formatDuration(elapsedMs)}</span>
            <LiveMeter getLevels={getLevels} />
            <span className="truncate text-sm text-text-subtle">Recording… tap Send when done</span>
          </>
        )}
      </div>
      <Button
        type="button"
        onClick={onSend}
        disabled={opening}
        loading={sending}
        leftIcon={sending ? null : <Send width={16} height={16} strokeWidth={1.75} />}
      >
        Send
      </Button>
    </div>
  );
}

/** Why a recording is waiting for the person to decide, instead of being sent. */
export type ReviewReason = 'background' | 'interrupted' | 'muted' | 'silent';

export const REVIEW_TEXT: Record<ReviewReason, string> = {
  background: 'Recording stopped. Send what was recorded, or delete it.',
  interrupted: 'Recording stopped. Send what was recorded, or delete it.',
  muted:
    'The phone took the mic (a call?) — recording paused. Send what was recorded, or delete it.',
  silent: 'No sound was recorded — is the mic covered? Try again.',
};

/**
 * A recording to look at before it goes: the phone stopped it (the app went to
 * the background, a call came in, the recorder failed), or it came out silent.
 * NEVER sent by itself.
 */
export function VoiceReviewBar({
  clip,
  url,
  reason,
  sending,
  onDelete,
  onSend,
  onRecordAgain,
}: {
  clip: VoiceRecording;
  url: string;
  reason: ReviewReason;
  sending?: boolean;
  onDelete: () => void;
  onSend: () => void;
  onRecordAgain: () => void;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play?.()?.catch?.(() => setPlaying(false));
    else el.pause();
  };
  const warn = reason === 'muted' || reason === 'silent';
  return (
    <div>
      <p
        role="status"
        aria-live="polite"
        className={cn(
          'mb-2 rounded-md px-3 py-1.5 text-xs leading-snug',
          warn ? 'bg-warning-soft text-warning-strong' : 'bg-surface-2 text-text-muted',
        )}
      >
        {REVIEW_TEXT[reason]}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Delete recording"
          onClick={onDelete}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text md:h-9 md:w-9"
        >
          <Trash2 width={18} height={18} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={playing ? 'Pause recording' : 'Play recording'}
          onClick={toggle}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text hover:bg-surface-2 md:h-9 md:w-9"
        >
          {playing ? <Pause width={18} height={18} strokeWidth={1.75} /> : <Play width={18} height={18} strokeWidth={1.75} />}
        </button>
        <span className="flex-1 text-sm font-medium tabular-nums text-text">
          {formatDuration(clip.durationMs)}
        </span>
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
        {reason === 'silent' ? (
          <>
            <Button type="button" size="sm" variant="secondary" onClick={onSend} disabled={sending}>
              Send anyway
            </Button>
            <Button type="button" size="sm" onClick={onRecordAgain}>
              Record again
            </Button>
          </>
        ) : (
          <Button
            type="button"
            onClick={onSend}
            loading={sending}
            leftIcon={sending ? null : <Send width={16} height={16} strokeWidth={1.75} />}
          >
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
