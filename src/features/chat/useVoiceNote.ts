import * as React from 'react';

import { errorName } from '@/lib/errors';
import { micDiagnostics } from '@/lib/micDiagnostics';
import { isMicStartFailure, isOldAndroidAppForMic } from '@/lib/micPolicy';
import { addCrumb, reportIssue } from '@/lib/monitoring';
import {
  detectPlatform,
  haptic,
  isNativeShell,
  nativeAppState,
  nativeHas,
  requestNativeMicPermission,
  requestNativeMicStatus,
} from '@/lib/nativeBridge';
import { pauseAllVoiceNotes } from '@/lib/pausePlayingAudio';
import {
  useVoiceRecorder,
  type StartFailure,
  type StartResult,
  type VoiceRecording,
} from '@/lib/useVoiceRecorder';
import { MAX_VOICE_DURATION_MS } from '@dk/shared/schemas';

import type { MicStripKind, ReviewReason } from './VoiceNoteParts';

/**
 * Everything the team chat's voice-note button decides, kept out of the composer
 * so the composer only draws it. The same rules as the dealer app's chat
 * (mdg-client `features/chat/Composer.tsx`), for a button that is tapped rather
 * than held: tap to start, Send or the bin to finish.
 *
 * WHAT THIS REPLACED. The July recorder asked the phone app for the microphone
 * permission after EVERY failed start, whatever the cause. On an Android team app
 * the mic never started at all (lib/micPolicy explains why), the phone app then
 * answered "granted" — the permission was never the problem — and the chat said
 * "Microphone enabled. Tap the mic again to record." Every tap after that failed
 * the same way, so the message came back forever. Now the permission is only
 * asked for on a refusal, and only when the person taps "Allow".
 *
 * The states: idle → opening ("Starting mic…", no clock yet, the bin works, Send
 * does not) → recording (red dot, clock) → idle, with a review step when the
 * phone stopped the recording, the app left the screen, or nothing was heard.
 */

/**
 * The watchdog for a mic that never opens. 12 s, or 30 s on an iPhone, while a
 * permission dialog may be on screen: then we are waiting on a person reading,
 * not on a hung mic. 6 s once the mic has worked on this phone before and the app
 * never lost the screen during the press.
 */
const START_TIMEOUT_MS = 12_000;
const START_TIMEOUT_IOS_MS = 30_000;
const START_TIMEOUT_FOREGROUND_MS = 6000;

/** Under this, a recording is "too short". A longer clip is never called that. */
export const TOO_SHORT_MS = 700;
/**
 * A take whose loudest moment stays under this, for more than a second, has no
 * voice in it: a covered mic, or a call that silenced the track.
 */
export const SILENCE_PEAK = 0.02;
const SILENCE_MIN_MS = 1000;
/** Away from the screen this long while recording → stop and review. */
export const AWAY_MS = 1500;
/**
 * A mute this soon after the app left the screen is the app leaving, not the
 * phone taking the mic: an iPhone mutes the mic as the app goes to the back.
 */
const LEAVING_MUTE_MS = 1000;

/** Set once the mic has opened on this phone: no first-time dialog can be up. */
const MIC_WORKED_KEY = 'dk.mic.worked';
/** Set once the "we need the mic" note has been shown. */
const MIC_EXPLAINED_KEY = 'dk.mic.explained';

/** Browser storage can be missing or throw (private mode); a missing flag is "no". */
function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* only a convenience */
  }
}

/** No voice in it — and only when the meter could actually measure (`maxPeak` not null). */
export function isSilent(rec: VoiceRecording): boolean {
  return (
    typeof rec.maxPeak === 'number' && rec.maxPeak < SILENCE_PEAK && rec.durationMs > SILENCE_MIN_MS
  );
}

/**
 * Which strip a failed start gets, from the failure and what the phone said.
 *
 * Pure, so the rules can be tested on their own. `refusal` is what to do for a
 * NotAllowedError inside the phone app — that one needs the shell's answer first,
 * so the caller works it out (see `handleRefusal`).
 */
export function stripForFailure(
  failure: Exclude<StartFailure, { cause: 'superseded' } | { cause: 'busy-self' }>,
  ctx: { nativeShell: boolean; oldAndroidApp: boolean },
): MicStripKind | 'refusal' {
  if (failure.cause === 'unsupported') return 'unavailable';
  switch (failure.name) {
    case 'NotAllowedError':
      return ctx.nativeShell ? 'refusal' : 'blocked-browser';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    case 'SecurityError':
    case 'TypeError':
      // Not a secure page, or a WebView with no microphone support at all.
      return 'unavailable';
    default:
      // NotReadableError, AbortError, RecorderStartError, Timeout, and anything
      // new. An Android phone app built without the mic fix can never start it,
      // so that one says the app needs updating instead.
      if (isMicStartFailure(failure.name) && ctx.oldAndroidApp) return 'app-update';
      return 'failed';
  }
}

export type VoiceMode = 'idle' | 'opening' | 'recording';

export interface VoiceReview {
  clip: VoiceRecording;
  url: string;
  reason: ReviewReason;
}

interface Options {
  /** Upload and send a finished clip. */
  sendClip: (rec: VoiceRecording) => Promise<void>;
  /** Put the keyboard in the text box ("Type instead"). */
  focusText: () => void;
  /** A one-line message under the box (too short, lost, the ten-minute cap). */
  notify: (message: string) => void;
}

export function useVoiceNote({ sendClip, focusText, notify }: Options) {
  const recorder = useVoiceRecorder();
  const [mode, setModeState] = React.useState<VoiceMode>('idle');
  /** Why the mic did not start, shown above the box until it helps. */
  const [strip, setStrip] = React.useState<MicStripKind | null>(null);
  /**
   * Plain failures in this chat; from the second one "Type instead" is offered.
   * State, not a ref: a second identical failure changes nothing else on screen,
   * so only this count makes the strip draw its new button.
   */
  const [failCount, setFailCount] = React.useState(0);
  const [review, setReview] = React.useState<VoiceReview | null>(null);

  /** The mode, readable from window listeners that outlive a render. */
  const modeRef = React.useRef<VoiceMode>('idle');
  const setMode = (m: VoiceMode) => {
    modeRef.current = m;
    setModeState(m);
  };
  /** Counts presses; the watchdog belongs to one press, retries and all. */
  const pressRef = React.useRef(0);
  /** The press whose start() has not come back yet, if any. */
  const pendingPressRef = React.useRef<number | null>(null);
  /** The app lost the screen during this press: a permission dialog may be up. */
  const dialogSeenRef = React.useRef(false);
  const startTimerRef = React.useRef<{ press: number; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  );
  /** Pending "away too long" stop while recording. */
  const awayTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A stop-to-review is running; a second trigger must not stop it twice. */
  const stoppingRef = React.useRef(false);
  /** Never touch state from an async tail after unmount. */
  const unmountedRef = React.useRef(false);
  /**
   * Refusals while the phone says the mic IS allowed, since the mic last worked.
   * Asking again cannot fix that; from the second one the strip says to restart.
   */
  const grantedRefusalsRef = React.useRef(0);
  /** When the app last left the screen (ms since epoch), to read a mute that follows. */
  const leftAtRef = React.useRef(0);

  // ── small pieces ─────────────────────────────────────────────────────────

  const showStrip = (kind: MicStripKind) => {
    if (kind === 'failed' || kind === 'muted') setFailCount((n) => n + 1);
    setStrip(kind);
    haptic(kind === 'explainer' ? 'light' : 'error');
  };

  const dismissStrip = () => setStrip(null);

  const typeInstead = () => {
    setStrip(null);
    focusText();
  };

  const clearAway = () => {
    if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
    awayTimerRef.current = null;
  };

  const disarmStartWatchdog = (press?: number) => {
    const armed = startTimerRef.current;
    if (!armed) return;
    if (press !== undefined && armed.press !== press) return;
    clearTimeout(armed.timer);
    startTimerRef.current = null;
  };

  /** Put everything back to normal, whatever the recorder was doing. */
  const resetRecording = () => {
    disarmStartWatchdog();
    clearAway();
    // `cancel()` bumps the recorder session, which is what invalidates any
    // getUserMedia still in flight.
    recorder.cancel();
    setMode('idle');
  };

  const openReview = (clip: VoiceRecording, reason: ReviewReason) => {
    setReview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { clip, reason, url: URL.createObjectURL(clip.blob) };
    });
  };

  const closeReview = () => {
    setReview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  // ── failures ─────────────────────────────────────────────────────────────

  /**
   * The mic was refused inside the phone app. Pick the button that can help.
   *
   * NEVER ASK AGAIN BY ITSELF. The Android WebView shows its own permission
   * dialog the moment the page asks for the mic; asking the phone app to show
   * ANOTHER one straight after a "Don't allow" put two dialogs in a row on
   * screen, and on Android 11 and later two refusals make the refusal permanent.
   * So the strip offers "Allow" when the phone will still ask, and the Settings
   * steps when it will not, and nothing pops up until the person taps.
   */
  const handleRefusal = async () => {
    const session = recorder.currentSession();
    const status = await requestNativeMicStatus();
    if (unmountedRef.current || session !== recorder.currentSession()) return;
    if (status?.granted) {
      // The phone allows it, yet the page was refused. Nothing to allow, and
      // Try again only refuses again: on an iPhone this does not clear until
      // the app is closed and opened again, and elsewhere a second refusal in a
      // row says the same. Then the strip says to restart the app.
      grantedRefusalsRef.current += 1;
      const restart = detectPlatform() === 'ios' || grantedRefusalsRef.current >= 2;
      showStrip(restart ? 'restart' : 'failed');
      return;
    }
    if (status && !status.canAsk) {
      showStrip('settings');
      return;
    }
    // The team app cannot read an iPhone's permission, and an iPhone shows its
    // dialog only once: from then on Settings is the only way.
    if (!status && detectPlatform() === 'ios') {
      showStrip('settings');
      return;
    }
    showStrip('refused');
  };

  /**
   * Turn a failed start into the strip that says something true. The failure
   * travels as an ARGUMENT, never through a ref read later, so the message
   * cannot drift onto a different attempt.
   */
  const handleStartFailure = async (failure: StartFailure) => {
    if (failure.cause === 'superseded' || failure.cause === 'busy-self') return;
    const kind = stripForFailure(failure, {
      nativeShell: isNativeShell(),
      oldAndroidApp: isOldAndroidAppForMic(),
    });
    if (kind === 'refusal') await handleRefusal();
    else showStrip(kind);
  };

  // ── the watchdog ─────────────────────────────────────────────────────────

  const watchdogMs = () => {
    if (dialogSeenRef.current || !readFlag(MIC_WORKED_KEY)) {
      return detectPlatform() === 'ios' ? START_TIMEOUT_IOS_MS : START_TIMEOUT_MS;
    }
    return START_TIMEOUT_FOREGROUND_MS;
  };

  /**
   * Give up on a mic that never opens. Keyed to the PRESS, not to the recorder's
   * session: the recorder's quiet retry happens inside one press and must not
   * reset the clock. Only counts time on screen: while the phone's permission
   * dialog is up the watchdog is off (see the window effect below).
   */
  const armStartWatchdog = (press: number) => {
    disarmStartWatchdog();
    const ms = watchdogMs();
    startTimerRef.current = {
      press,
      timer: setTimeout(() => {
        startTimerRef.current = null;
        if (pendingPressRef.current !== press) return;
        // getUserMedia never answered, on screen, for the whole timeout. No error
        // name explains that, so it is reported here.
        void micDiagnostics().then((diag) => {
          reportIssue({
            name: 'mic.never-settled',
            level: 'error',
            tags: {
              nativeShell: diag.nativeShell,
              'mic.permission': diag.permissionState,
              'mic.platform': diag.platform,
              audioInputs: diag.audioInputs,
            },
            extra: { ...(diag as unknown as Record<string, unknown>), timeoutMs: ms },
          });
        });
        resetRecording();
        void handleStartFailure({ cause: 'error', name: 'Timeout' });
      }, ms),
    };
  };

  /**
   * Open the mic with the watchdog around it. EVERY start goes through here.
   * try/finally, so a start that throws can never leave the watchdog armed and
   * fire a "didn't start" message long after. A playing voice note is paused
   * first, so it does not run on into the recording.
   */
  const startWithWatchdog = async (): Promise<StartResult> => {
    pressRef.current += 1;
    const press = pressRef.current;
    pendingPressRef.current = press;
    dialogSeenRef.current = false;
    const voiceNotePlaying = pauseAllVoiceNotes();
    armStartWatchdog(press);
    try {
      return await recorder.start({ voiceNotePlaying });
    } catch (err) {
      return { ok: false, cause: 'error', name: errorName(err) || 'RecorderStartError' };
    } finally {
      disarmStartWatchdog(press);
      if (pendingPressRef.current === press) pendingPressRef.current = null;
    }
  };

  // ── starting ─────────────────────────────────────────────────────────────

  /**
   * Before the very first press reaches the phone's permission dialog, explain
   * it once. Only asked of a phone app that can answer without prompting
   * (`mic-status`), only until the mic has worked once or the note has been
   * seen, and never waited on for longer than 800 ms.
   */
  const mayNeedExplainer = () =>
    nativeHas('mic-status') && !readFlag(MIC_WORKED_KEY) && !readFlag(MIC_EXPLAINED_KEY);
  const explainFirst = async (): Promise<boolean> => {
    const session = recorder.currentSession();
    const status = await requestNativeMicStatus();
    if (unmountedRef.current) return true;
    // Cancelled while we asked: the press is over either way.
    if (session !== recorder.currentSession()) return true;
    if (!status || status.granted || !status.canAsk) return false;
    writeFlag(MIC_EXPLAINED_KEY);
    resetRecording();
    showStrip('explainer');
    return true;
  };

  /**
   * Tap the mic (or "Try again", "Allow", the explainer's OK, "Record again").
   * The bar shows at once, saying the mic is starting, so a tap never looks like
   * it did nothing. `quiet` skips the strip on failure (the caller handles it).
   */
  const start = async (opts?: { quiet?: boolean; skipExplainer?: boolean }): Promise<StartResult> => {
    notify('');
    if (!recorder.supported) {
      showStrip('unavailable');
      return { ok: false, cause: 'unsupported' };
    }
    setStrip(null);
    setMode('opening');
    if (!opts?.skipExplainer && mayNeedExplainer() && (await explainFirst())) {
      return { ok: false, cause: 'superseded' };
    }
    const result = await startWithWatchdog();
    if (unmountedRef.current) return result;
    if (!result.ok) {
      if (result.cause === 'superseded') return result;
      if (result.cause === 'busy-self') {
        // The last note is still being finished. Not a fault, and cancelling the
        // recorder here would throw that note away: just put the bar back, and
        // say why the tap did nothing, so it is not taken for a broken mic.
        setMode('idle');
        notify('The last voice note is still being saved. Tap the mic again in a moment.');
        return result;
      }
      resetRecording();
      if (!opts?.quiet) void handleStartFailure(result);
      return result;
    }
    // A newer attempt claimed the mic while this one was opening.
    if (result.session !== recorder.currentSession()) return result;
    setMode('recording');
    setFailCount(0);
    grantedRefusalsRef.current = 0;
    setStrip(null);
    writeFlag(MIC_WORKED_KEY);
    haptic('medium');
    return result;
  };

  /** "Allow": ask the phone for the mic now — on the person's tap, once. */
  const allowMic = async () => {
    setStrip(null);
    addCrumb('mic: asking the phone app for the permission');
    const session = recorder.currentSession();
    const answer = await requestNativeMicPermission();
    addCrumb('mic: native permission answered', { ...answer });
    // The dialog can sit on screen for a minute. Anything done in the meantime
    // owns the composer now — a stale answer must not seize it.
    if (unmountedRef.current || session !== recorder.currentSession()) return;
    if (answer.granted) {
      // They asked for a voice note and then did what we asked: start recording,
      // rather than announcing success and making them tap again.
      const result = await start({ quiet: true, skipExplainer: true });
      if (unmountedRef.current || result.ok || result.cause !== 'error') return;
      // Allowed at the phone level and the mic STILL won't open: permission is
      // not the problem, and this is the case worth hearing about.
      reportIssue({
        name: 'mic.granted-but-unopenable',
        level: 'error',
        tags: { 'mic.error': result.name, 'mic.platform': detectPlatform() },
      });
      await handleStartFailure(result);
      return;
    }
    // A team app from before 0.2.0 (no `mic-status`) never says the refusal is
    // permanent, so "refused" offered Allow again, which asked again and was
    // refused again, round and round. Without `mic-status` a second "no" sends
    // the person to Settings instead.
    const askAgain = !answer.permanentlyDenied && nativeHas('mic-status');
    showStrip(askAgain ? 'refused' : 'settings');
  };

  /** The explainer's OK: the phone's own dialog comes next. */
  const explainerOk = () => {
    setStrip(null);
    void start({ skipExplainer: true });
  };

  // ── finishing ────────────────────────────────────────────────────────────

  /** The bin: throw the recording away (or stop a mic that is still opening). */
  const cancel = () => {
    resetRecording();
    haptic('light');
  };

  /**
   * Stop and send what was captured — unless there is nothing worth sending.
   * No clip at all is "lost", under 700 ms is "too short", and a clip with no
   * sound in it goes to the review step instead of out as a silent note.
   */
  const stopAndSend = async () => {
    // Nothing is recording yet: there is nothing to send.
    if (modeRef.current !== 'recording') return;
    clearAway();
    // Idle at once, so a second tap on Send cannot race this stop.
    setMode('idle');
    const rec = await recorder.stop();
    if (unmountedRef.current) return;
    if (!rec || rec.blob.size === 0) {
      haptic('error');
      notify('The recording was lost. Please record it again.');
      return;
    }
    if (rec.durationMs < TOO_SHORT_MS) {
      notify('Too short to send. Record a little longer.');
      return;
    }
    if (isSilent(rec)) {
      // A covered mic, or a call that silenced the track without muting it.
      reportIssue({
        name: 'mic.silent-recording',
        level: 'info',
        tags: { 'mic.platform': detectPlatform(), 'mic.wasMuted': rec.wasMuted },
        extra: { durationMs: rec.durationMs, maxPeak: rec.maxPeak },
      });
      haptic('warning');
      openReview(rec, 'silent');
      return;
    }
    haptic('success');
    await sendClip(rec);
  };

  /**
   * End a recording the person did not end, and hold it for review: the app left
   * the screen, the phone took the mic, or the recorder stopped by itself. Never
   * sent on its own, and never silently dropped. An empty clip is let go quietly.
   */
  const stopToReview = async (reason: ReviewReason) => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    disarmStartWatchdog();
    clearAway();
    setMode('idle');
    try {
      const rec = await recorder.stop();
      if (unmountedRef.current) return;
      if (!rec || rec.blob.size === 0) {
        if (reason === 'muted') showStrip('muted');
        return;
      }
      if (reason === 'muted' && rec.durationMs < TOO_SHORT_MS) {
        // Muted the moment it arrived: nothing to review, but we do know why.
        showStrip('muted');
        return;
      }
      haptic(reason === 'muted' ? 'warning' : 'light');
      openReview(rec, reason);
    } finally {
      stoppingRef.current = false;
    }
  };

  const sendReviewed = () => {
    const current = review;
    if (!current) return;
    closeReview();
    haptic('success');
    void sendClip(current.clip);
  };

  const deleteReviewed = () => {
    closeReview();
    haptic('light');
  };

  const recordAgain = () => {
    closeReview();
    void start();
  };

  // ── what the phone does meanwhile ────────────────────────────────────────

  /**
   * While the mic is opening, losing the screen usually means the phone's
   * permission dialog is up: the watchdog stops, and starts again with the long
   * clock when the app is back.
   *
   * While recording, leaving the app (the phone app saying it went to the
   * background, or the page hidden for 1.5 s) stops the recording and puts it up
   * for review — never sent by itself. Inside the phone app losing focus counts
   * too, because the WebView does not always say it was hidden. In a laptop
   * browser it does not: clicking into another window is not leaving the chat.
   */
  React.useEffect(() => {
    if (mode === 'idle') return;

    const awayWhileRecording = () => {
      if (!awayTimerRef.current) {
        awayTimerRef.current = setTimeout(() => {
          awayTimerRef.current = null;
          void stopToReview('background');
        }, AWAY_MS);
      }
    };
    const onLost = (fromBlur: boolean) => {
      if (modeRef.current === 'opening') {
        dialogSeenRef.current = true;
        disarmStartWatchdog();
        return;
      }
      if (fromBlur && !isNativeShell()) return;
      awayWhileRecording();
    };
    const onBack = () => {
      clearAway();
      // Back on screen with the mic still not open: put the clock back on the
      // press that is actually waiting — and only if one is.
      if (
        modeRef.current === 'opening' &&
        pendingPressRef.current !== null &&
        startTimerRef.current === null
      ) {
        armStartWatchdog(pendingPressRef.current);
      }
    };
    const onBlur = () => onLost(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        leftAtRef.current = Date.now();
        onLost(false);
      } else onBack();
    };
    const onAppState = (e: Event) => {
      const state = (e as CustomEvent<string>).detail;
      if (state === 'background') {
        leftAtRef.current = Date.now();
        if (modeRef.current === 'recording') void stopToReview('background');
        else onLost(false);
      } else if (state === 'active') {
        onBack();
      }
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onBack);
    window.addEventListener('native-app-state', onAppState);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onBack);
      window.removeEventListener('native-app-state', onAppState);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read refs; re-binding per render would drop the away timer
  }, [mode]);

  // An away timer must never outlive the recording it was for.
  React.useEffect(() => {
    if (mode === 'idle') clearAway();
  }, [mode]);

  /** The recorder stopped by itself (the track ended, the recorder failed). */
  React.useEffect(() => {
    if (recorder.status !== 'interrupted') return;
    void stopToReview('interrupted');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the change only
  }, [recorder.status]);

  /**
   * The phone took the mic (a call, Siri): the track went silent. The one moment
   * we KNOW something else has the mic, so the review line may say so. Keyed on
   * the mode too, so a track that arrived already muted is caught the moment
   * the recording starts.
   *
   * EXCEPT WHILE THE APP IS LEAVING THE SCREEN. An iPhone mutes the mic as the
   * app goes to the back, so a mute then is the person leaving, not a call, and
   * "a call?" would be a wrong guess. That stops the same way as leaving does.
   */
  React.useEffect(() => {
    if (!recorder.muted || mode !== 'recording') return;
    const leaving =
      (typeof document !== 'undefined' && document.visibilityState === 'hidden') ||
      nativeAppState().state === 'background' ||
      Date.now() - leftAtRef.current < LEAVING_MUTE_MS;
    if (leaving) {
      void stopToReview('background');
      return;
    }
    reportIssue({
      name: 'mic.muted-mid-recording',
      level: 'info',
      tags: { 'mic.platform': detectPlatform() },
    });
    void stopToReview('muted');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the change only
  }, [recorder.muted, mode]);

  /**
   * Past ten minutes the clip fails the server's check, after the whole file has
   * gone up. Ending it a few seconds short sends what was actually said. Through
   * a ref, because `stopAndSend` is rebuilt every render.
   */
  const stopAndSendRef = React.useRef(stopAndSend);
  stopAndSendRef.current = stopAndSend;
  const maxReachedRef = React.useRef(false);
  React.useEffect(() => {
    if (mode !== 'recording') {
      maxReachedRef.current = false;
      return;
    }
    if (maxReachedRef.current) return;
    if (recorder.elapsedMs < MAX_VOICE_DURATION_MS - 5000) return;
    maxReachedRef.current = true;
    void stopAndSendRef.current().then(() => {
      if (!unmountedRef.current) notify('Voice notes stop at 10 minutes, so this one was sent as it was.');
    });
  }, [mode, recorder.elapsedMs, notify]);

  // Never leave a timer running — or an async tail writing state — after the
  // composer goes away. The review's preview link goes with it.
  const reviewRef = React.useRef(review);
  reviewRef.current = review;
  React.useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (startTimerRef.current) clearTimeout(startTimerRef.current.timer);
      startTimerRef.current = null;
      if (awayTimerRef.current) clearTimeout(awayTimerRef.current);
      awayTimerRef.current = null;
      if (reviewRef.current) URL.revokeObjectURL(reviewRef.current.url);
    };
  }, []);

  /** A different chat: nothing from the last one carries over. */
  const resetForNewChat = () => {
    if (modeRef.current !== 'idle') resetRecording();
    setStrip(null);
    setFailCount(0);
    closeReview();
  };

  return {
    supported: recorder.supported,
    mode,
    elapsedMs: recorder.elapsedMs,
    getLevels: recorder.getLevels,
    strip,
    failCount,
    review,
    start,
    cancel,
    stopAndSend,
    allowMic,
    explainerOk,
    typeInstead,
    dismissStrip,
    sendReviewed,
    deleteReviewed,
    recordAgain,
    resetForNewChat,
  };
}
