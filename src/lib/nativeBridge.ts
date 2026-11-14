/**
 * Bridge helpers for talking to the Expo WebView shell that wraps this web app.
 *
 * Everything here is no-op-safe in a normal browser: when there is no
 * `window.ReactNativeWebView` (i.e. we are not running inside the native shell)
 * the post helpers simply do nothing, and the injected-token reader returns
 * undefined.
 */

export type NativePlatform = 'ios' | 'android' | 'web';

declare global {
  interface Window {
    /** Present only inside the React Native WebView. */
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
    /** Injected by native after it obtains an Expo push token. */
    __EXPO_PUSH_TOKEN__?: string;
    /** Set by the SPA once it consumes a deep link so native knows. */
    __handledDeepLink?: boolean;
    /**
     * Which phone the shell is running on, defined by the shell before any page
     * script runs. The user-agent cannot say: an iPad reports itself as a Mac.
     */
    __DK_NATIVE_PLATFORM__?: 'ios' | 'android';
    /**
     * What this shell build can do beyond the basics, defined by the shell before
     * any page script runs (`mic-ready`, `mic-status`, `open-store`). Absent from a
     * shell built before the list existed (every team app before 0.2.0).
     */
    __DK_NATIVE_FEATURES__?: readonly string[];
  }
  interface WindowEventMap {
    /** The phone put the app in the background or brought it back. */
    'native-app-state': CustomEvent<NativeAppState>;
    /** The shell's answer to `permission:micStatus` (never a prompt). */
    'native-mic-status': CustomEvent<NativeMicStatus>;
  }
}

/** What the phone is doing with the app (`native-app-state`). */
export type NativeAppState = 'active' | 'background';

/** The last `native-app-state` the shell sent, and when (ms since epoch). */
let lastAppState: { state: NativeAppState | null; at: number } = { state: null, at: 0 };
let appStateTracked = false;

/**
 * Start remembering what the shell says about the app being in the foreground.
 *
 * The voice recorder needs it to know whether a mic that failed to open failed
 * because the phone had the app in the background (wait until it is back, then
 * try again) or with the app on screen. The team shell does not send this yet;
 * until it does the recorder goes by the page being visible, which still works.
 * Safe to call many times; one listener.
 */
export function trackNativeAppState(): void {
  if (appStateTracked || typeof window === 'undefined') return;
  appStateTracked = true;
  window.addEventListener('native-app-state', (e) => {
    const state = (e as CustomEvent<NativeAppState>).detail;
    if (state === 'active' || state === 'background') lastAppState = { state, at: Date.now() };
  });
}

/** The last app state the shell reported (`state: null` if it never has). */
export function nativeAppState(): { state: NativeAppState | null; at: number } {
  return lastAppState;
}

/**
 * Send a structured message to the native shell. No-op in a normal browser.
 */
export function postToNative(msg: object): void {
  try {
    const bridge =
      typeof window !== 'undefined' ? window.ReactNativeWebView : undefined;
    bridge?.postMessage(JSON.stringify(msg));
  } catch {
    // Best-effort: never let bridge messaging break app flow.
  }
}

/**
 * Read the Expo push token native may have injected onto `window`.
 */
export function getInjectedPushToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.__EXPO_PUSH_TOKEN__;
}

/** True when running inside the Expo native shell (vs a plain browser). */
export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && !!window.ReactNativeWebView;
}

/**
 * How hard the tap feels. `selection` is the light tick of a picker. `success`,
 * `warning` and `error` are what the voice-note bar says without words: sent,
 * stopped by the phone, and did not start.
 */
export type HapticStyle = 'light' | 'medium' | 'selection' | 'success' | 'warning' | 'error';

/**
 * What a phone app's haptic handler understands: three taps. The three newer
 * names are turned into the nearest of those here. The team shell has no haptic
 * handler yet and ignores the message, so on an iPhone nothing is felt there.
 */
const SHELL_HAPTIC: Record<HapticStyle, 'light' | 'medium' | 'selection'> = {
  light: 'light',
  medium: 'medium',
  selection: 'selection',
  success: 'light',
  warning: 'medium',
  error: 'medium',
};

/**
 * Android's vibration for each style, in milliseconds (a list is buzz, gap, buzz).
 * A warning and an error buzz twice so they can be told apart from a plain tap
 * with the phone in a pocket.
 */
const VIBRATION: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 10,
  selection: 10,
  success: 10,
  warning: [20, 60, 20],
  error: [30, 50, 30],
};

/**
 * A small tick under the finger. Android's WebView has `navigator.vibrate`; an
 * iPhone's does not, so inside the shell the tick is asked of the phone app
 * instead. A plain desktop browser gets neither, and nothing happens.
 */
export function haptic(style: HapticStyle = 'light'): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATION[style] ?? 10);
      return;
    }
  } catch {
    // Some WebViews throw on vibrate when the page has not been touched yet.
  }
  if (isNativeShell()) postToNative({ type: 'haptic', style: SHELL_HAPTIC[style] ?? 'light' });
}

/** What the shell's OS permission prompt came back with. */
export interface MicPermissionResult {
  granted: boolean;
  /**
   * Android has stopped asking ("Don't allow" twice, or "Never ask again").
   * Asking from here can never show a dialog again — only the phone's Settings
   * can turn it back on.
   */
  permanentlyDenied: boolean;
}

// A single in-flight request, so rapid repeated taps coalesce into ONE native
// prompt and ONE result (only one 'native-mic-permission' listener alive at a
// time — the untagged event can't then resolve a stale request from another tap).
let micRequestInFlight: Promise<MicPermissionResult> | null = null;

/**
 * Ask the native shell to request the OS microphone permission (the Android
 * RECORD_AUDIO runtime grant). In a plain browser — or if the shell never answers
 * within `timeoutMs` — resolves not granted.
 *
 * ONLY EVER CALLED FROM A TAP ON "ALLOW", AFTER A REFUSAL (NotAllowedError). It
 * used to be called after every failed start, whatever the cause. The shell then
 * answered "granted" (the permission was never the problem), and the chat said
 * "Microphone enabled. Tap the mic again" — forever, because the next press
 * failed the same way.
 *
 * Native replies with a `native-mic-permission` CustomEvent, detail
 * `{ granted, permanentlyDenied }`.
 *
 * The timeout MUST outlast a human. The shell's request does not answer until the
 * person taps on the OS dialog, so this clock measures how long someone takes to
 * read "Allow … to record audio?" and tap. It used to be 5 s, which a real person
 * overran, and the page then said the mic was off while they were tapping Allow.
 * The deadline only guards a shell with no handler at all.
 */
export function requestNativeMicPermission(timeoutMs = 60_000): Promise<MicPermissionResult> {
  if (!isNativeShell() || typeof window === 'undefined') {
    return Promise.resolve({ granted: false, permanentlyDenied: false });
  }
  if (micRequestInFlight) return micRequestInFlight;

  micRequestInFlight = new Promise<MicPermissionResult>((resolve) => {
    let settled = false;
    // Holder so the timer id can be set after `finish` is defined while keeping
    // the binding const (finish clears it once the promise settles).
    const timer: { id?: ReturnType<typeof window.setTimeout> } = {};
    const finish = (result: MicPermissionResult) => {
      if (settled) return;
      settled = true;
      if (timer.id !== undefined) window.clearTimeout(timer.id);
      window.removeEventListener('native-mic-permission', onResult as EventListener);
      micRequestInFlight = null;
      resolve(result);
    };
    const onResult = (e: Event) => {
      const detail = (e as CustomEvent<{ granted?: boolean; permanentlyDenied?: boolean }>)
        .detail;
      finish({
        granted: !!detail?.granted,
        // Only a shell new enough to report this can set it, so an older one
        // simply never sends the person to Settings.
        permanentlyDenied: detail?.permanentlyDenied === true,
      });
    };
    window.addEventListener('native-mic-permission', onResult as EventListener);
    postToNative({ type: 'permission:requestMic' });
    timer.id = window.setTimeout(
      () => finish({ granted: false, permanentlyDenied: false }),
      timeoutMs,
    );
  });
  return micRequestInFlight;
}

/** Where the phone's microphone permission stands, as the shell reads it. */
export interface NativeMicStatus {
  granted: boolean;
  /**
   * The phone would still show its permission dialog. False once Android has
   * stopped asking (refused twice, or "Don't ask again"): from then on only the
   * phone's Settings can turn it on.
   */
  canAsk: boolean;
}

/**
 * Ask the shell where the microphone permission stands, WITHOUT showing any
 * dialog (`permission:micStatus`).
 *
 * This is what lets the chat pick the right button after a refusal. The Android
 * WebView shows its own permission dialog the moment the page asks for the mic;
 * asking the shell to request it AGAIN straight after a "Don't allow" put a
 * second dialog on screen, and on Android 11 and later two refusals make the
 * refusal permanent. Reading the status first means we only offer "Allow" when
 * the phone will still ask.
 *
 * Resolves `null` when this shell cannot answer (a plain browser, a shell built
 * before the message existed, or no answer within `timeoutMs`). The caller reads
 * `null` as "we don't know" and must not wait any longer for it.
 */
export function requestNativeMicStatus(timeoutMs = 800): Promise<NativeMicStatus | null> {
  if (!nativeHas('mic-status') || typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer: { id?: ReturnType<typeof window.setTimeout> } = {};
    const finish = (result: NativeMicStatus | null) => {
      if (timer.id !== undefined) window.clearTimeout(timer.id);
      window.removeEventListener('native-mic-status', onStatus);
      resolve(result);
    };
    const onStatus = (e: Event) => {
      const detail = (e as CustomEvent<Partial<NativeMicStatus>>).detail;
      if (!detail || typeof detail.granted !== 'boolean') return;
      finish({ granted: detail.granted, canAsk: detail.canAsk !== false && !detail.granted });
    };
    // Listening first, THEN asking: a shell that answers in the same tick must
    // not find nobody there.
    window.addEventListener('native-mic-status', onStatus);
    postToNative({ type: 'permission:micStatus' });
    timer.id = window.setTimeout(() => finish(null), timeoutMs);
  });
}

/**
 * Send the person to this app's page in the phone's app store, to update it.
 *
 * A shell that can (`open-store`) opens the Play Store app straight on the page.
 * An older shell gets `fallbackUrl` (the store's web address) through the road
 * every outside link takes in the phone app: the page asks to go there, and the
 * shell hands the address to the phone, which offers the Play Store app. Decided
 * inside the tap, so nothing blocks it.
 */
export function openAppStore(fallbackUrl: string): 'app' | 'browser' {
  if (nativeHas('open-store')) {
    postToNative({ type: 'app:openStore' });
    return 'app';
  }
  if (isNativeShell()) {
    window.location.assign(fallbackUrl);
    return 'browser';
  }
  window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
  return 'browser';
}

/** What the shell did with a requested media download. */
export interface NativeDownloadResult {
  ok: boolean;
  /** 'gallery' = saved via the media library; 'browser' = handed to Chrome. */
  mode?: 'gallery' | 'browser';
  error?: string;
  /**
   * True when the shell never ACKNOWLEDGED the request — an old binary without
   * the 'media:download' handler (version skew during a Play rollout). The
   * caller should fall back to a plain browser download. A shell that acked
   * but then went silent is a FAILURE (no `timedOut`), not a fallback: the
   * shell may still be downloading, and opening the browser too would fetch
   * the file twice over the same 2G link.
   */
  timedOut?: boolean;
}

export interface NativeDownloadRequest {
  /** Correlation id — echoed back in the started + result events. */
  id: string;
  url: string;
  filename: string;
  contentType?: string;
  kind?: 'image' | 'file' | 'audio';
}

/**
 * How long to wait for the shell's 'native-media-download-started' ack. A new
 * shell injects it immediately after validating the request — before any slow
 * download/permission work — so silence this long means an old binary without
 * the handler.
 */
const DOWNLOAD_ACK_TIMEOUT_MS = 3000;
/**
 * Completion cap once the shell HAS acked: a chat photo over 2G plus a human
 * answering the gallery-permission prompt is slow, but not endless.
 */
const DOWNLOAD_RESULT_TIMEOUT_MS = 120_000;

interface PendingDownload {
  /** Settle with the shell's final result (clears whichever timer is armed). */
  settle: (result: NativeDownloadResult) => void;
  /** The shell acked: swap the short old-shell timer for the completion cap. */
  onStarted: () => void;
}

// Unlike the mic request (one prompt at a time), downloads can overlap, so each
// request is keyed by a correlation id and ONE shared pair of listeners
// dispatches the 'native-media-download(-started)' events to whichever request
// they belong to. Both listeners detach again once no request is pending.
const pendingDownloads = new Map<string, PendingDownload>();
let downloadListenersAttached = false;

const onDownloadResult = (e: Event) => {
  const detail = (
    e as CustomEvent<{
      id?: string;
      ok?: boolean;
      mode?: 'gallery' | 'browser';
      error?: string;
    }>
  ).detail;
  if (!detail?.id) return;
  const pending = pendingDownloads.get(detail.id);
  if (!pending) return; // stale/duplicate result — already timed out or settled
  pendingDownloads.delete(detail.id);
  pending.settle({ ok: !!detail.ok, mode: detail.mode, error: detail.error });
  detachDownloadListenersIfIdle();
};

// The started ack must NOT consume the pending entry — only the completion
// event or a timeout settles a request. It merely re-arms the timers.
const onDownloadStarted = (e: Event) => {
  const detail = (e as CustomEvent<{ id?: string }>).detail;
  if (!detail?.id) return;
  pendingDownloads.get(detail.id)?.onStarted();
};

function attachDownloadListeners(): void {
  if (downloadListenersAttached || typeof window === 'undefined') return;
  downloadListenersAttached = true;
  window.addEventListener('native-media-download', onDownloadResult as EventListener);
  window.addEventListener(
    'native-media-download-started',
    onDownloadStarted as EventListener,
  );
}

function detachDownloadListenersIfIdle(): void {
  if (!downloadListenersAttached || pendingDownloads.size > 0) return;
  downloadListenersAttached = false;
  window.removeEventListener('native-media-download', onDownloadResult as EventListener);
  window.removeEventListener(
    'native-media-download-started',
    onDownloadStarted as EventListener,
  );
}

/**
 * Ask the native shell to download a file (save an image to the gallery, or
 * hand anything else to the system browser). Two-phase protocol: the shell
 * acks with 'native-media-download-started' as soon as it takes the job, then
 * reports the outcome via 'native-media-download'.
 *
 * Resolves `{ ok: false, timedOut: true }` in a plain browser or when the
 * shell never acks within `ackTimeoutMs` (old binary — caller falls back to a
 * browser download). Once acked, a missing result within `resultTimeoutMs`
 * resolves `{ ok: false, error: 'timeout' }` WITHOUT `timedOut`, so the caller
 * reports failure instead of double-downloading via the browser.
 */
export function requestNativeDownload(
  req: NativeDownloadRequest,
  ackTimeoutMs = DOWNLOAD_ACK_TIMEOUT_MS,
  resultTimeoutMs = DOWNLOAD_RESULT_TIMEOUT_MS,
): Promise<NativeDownloadResult> {
  if (!isNativeShell() || typeof window === 'undefined') {
    return Promise.resolve({ ok: false, timedOut: true });
  }
  attachDownloadListeners();
  return new Promise<NativeDownloadResult>((resolve) => {
    let timer = window.setTimeout(() => {
      if (pendingDownloads.delete(req.id)) {
        resolve({ ok: false, timedOut: true });
        detachDownloadListenersIfIdle();
      }
    }, ackTimeoutMs);
    pendingDownloads.set(req.id, {
      settle: (result) => {
        window.clearTimeout(timer);
        resolve(result);
      },
      onStarted: () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (pendingDownloads.delete(req.id)) {
            resolve({ ok: false, error: 'timeout' });
            detachDownloadListenersIfIdle();
          }
        }, resultTimeoutMs);
      },
    });
    postToNative({ type: 'media:download', ...req });
  });
}

/**
 * Which phone this is. Defaults to 'web'.
 *
 * The shell says so itself (`__DK_NATIVE_PLATFORM__`, from team app 0.2.0),
 * because the user-agent cannot be trusted for it: an iPad asks for desktop sites
 * and reports a Mac. Without that word, anything inside the shell that is not
 * Android is an iPhone or iPad; outside it, the user-agent is all there is.
 */
export function detectPlatform(): NativePlatform {
  if (typeof window !== 'undefined') {
    const said = window.__DK_NATIVE_PLATFORM__;
    if (said === 'ios' || said === 'android') return said;
  }
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (isNativeShell()) return 'ios';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'web';
}

/** True when this shell build says it can do `feature` (`__DK_NATIVE_FEATURES__`). */
export function nativeHas(feature: string): boolean {
  if (!isNativeShell()) return false;
  const list = window.__DK_NATIVE_FEATURES__;
  return Array.isArray(list) && list.includes(feature);
}

/** The same check under the name the phone-app contract uses. */
export const hasNativeFeature = nativeHas;
