import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Composer } from './Composer';
import { MIC_STRIP_TEXT, REVIEW_TEXT } from './VoiceNoteParts';

/**
 * The team chat's voice-note button, with the recorder replaced by a puppet so
 * each way a press can end is played out on purpose.
 *
 * The case this file exists for: the July recorder asked the phone app for the
 * mic permission after EVERY failed start. On an Android team app the mic never
 * started (a permission the app was built without, see lib/micPolicy), the phone
 * app answered "granted", and the chat said "Microphone enabled. Tap the mic
 * again to record." — forever. A failure that is not a refusal must never ask
 * for the permission, and must never say that.
 */

const recorder = vi.hoisted(() => ({
  supported: true,
  status: 'idle' as 'idle' | 'recording' | 'interrupted' | 'error',
  elapsedMs: 0,
  muted: false,
  interruptReason: null as null | 'ended' | 'error',
  session: 0,
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  getLevels: vi.fn(() => [] as number[]),
  currentSession: vi.fn((): number => recorder.session),
}));
vi.mock('@/lib/useVoiceRecorder', () => ({
  useVoiceRecorder: () => recorder,
}));

const bridge = vi.hoisted(() => ({
  isNativeShell: vi.fn(() => true),
  detectPlatform: vi.fn(() => 'android'),
  // A phone app new enough to record (0.2.0+) unless a test says otherwise.
  nativeHas: vi.fn((feature: string) => feature === 'mic-ready'),
  requestNativeMicPermission: vi.fn(),
  requestNativeMicStatus: vi.fn(
    async (): Promise<{ granted: boolean; canAsk: boolean } | null> => null,
  ),
  openAppStore: vi.fn(),
  haptic: vi.fn(),
}));
vi.mock('@/lib/nativeBridge', async (orig) => ({
  ...(await orig<typeof import('@/lib/nativeBridge')>()),
  ...bridge,
}));

/** Whether the new Android app is live on Play (lib/micPolicy's switch). */
const policy = vi.hoisted(() => ({ live: false }));
vi.mock('@/lib/micPolicy', async (orig) => ({
  ...(await orig<typeof import('@/lib/micPolicy')>()),
  androidMicUpdateLive: () => policy.live,
}));

const playback = vi.hoisted(() => ({ pauseAllVoiceNotes: vi.fn(() => false) }));
vi.mock('@/lib/pausePlayingAudio', () => playback);

vi.mock('@/lib/uploadAttachment', async (orig) => ({
  ...(await orig<typeof import('@/lib/uploadAttachment')>()),
  uploadAttachment: vi.fn(async () => ({
    kind: 'audio',
    url: 'https://files.example/voice.webm',
    storageKey: 'voice.webm',
    contentType: 'audio/webm',
    size: 5,
    name: 'voice.webm',
  })),
}));

// The "Send to" picker pulls in the whole UI kit (and the PDF reader with it);
// none of it is about the mic.
vi.mock('@/components/share/ShareMenu', () => ({ ShareAudienceNote: () => null }));

/** A clip as the recorder hands it back. */
function clip(over: Partial<{ durationMs: number; maxPeak: number | null; size: number }> = {}) {
  const size = over.size ?? 5;
  return {
    blob: new Blob([size > 0 ? 'a'.repeat(size) : ''], { type: 'audio/webm' }),
    durationMs: over.durationMs ?? 3000,
    mimeType: 'audio/webm',
    peaks: [],
    maxPeak: over.maxPeak === undefined ? 0.4 : over.maxPeak,
    wasMuted: false,
    endedBy: 'stop' as const,
  };
}

/** A start() that claims the mic, exactly as the real hook does. */
function startSucceeds() {
  recorder.start.mockImplementation(() => {
    recorder.session += 1;
    return Promise.resolve({ ok: true as const, session: recorder.session });
  });
}
/** A start() that fails for a named reason (the DOMException name). */
function startFails(name: string) {
  recorder.start.mockImplementation(() => {
    recorder.session += 1;
    return Promise.resolve({ ok: false as const, cause: 'error' as const, name });
  });
}
/** A start() that hangs, as it does while the phone's permission dialog is up. */
function startHangs() {
  recorder.start.mockImplementation(() => {
    recorder.session += 1;
    return new Promise(() => {});
  });
}

beforeAll(() => {
  // jsdom has neither; the composer measures the screen and makes preview links.
  window.matchMedia =
    window.matchMedia ??
    ((query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList);
  URL.createObjectURL = URL.createObjectURL ?? (() => 'blob:clip');
  URL.revokeObjectURL = URL.revokeObjectURL ?? (() => {});
});

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* no storage */
  }
  recorder.start.mockReset();
  recorder.stop.mockReset();
  recorder.cancel.mockReset();
  recorder.cancel.mockImplementation(() => {
    recorder.session += 1;
  });
  recorder.session = 0;
  recorder.status = 'idle';
  recorder.muted = false;
  recorder.supported = true;
  bridge.isNativeShell.mockReturnValue(true);
  bridge.detectPlatform.mockReturnValue('android');
  bridge.nativeHas.mockImplementation((f: string) => f === 'mic-ready');
  bridge.requestNativeMicPermission.mockReset();
  bridge.requestNativeMicStatus.mockReset();
  bridge.requestNativeMicStatus.mockResolvedValue(null);
  bridge.openAppStore.mockReset();
  bridge.haptic.mockReset();
  playback.pauseAllVoiceNotes.mockClear();
  policy.live = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const onSend = vi.fn(async () => {});

function renderComposer() {
  onSend.mockClear();
  const utils = render(<Composer conversationId="c1" onSend={onSend} />);
  // A fresh element each time: React skips a re-render for the very same one.
  return { ...utils, rerenderSame: () => utils.rerender(<Composer conversationId="c1" onSend={onSend} />) };
}

function tapMic() {
  fireEvent.click(screen.getByRole('button', { name: 'Record voice message' }));
}

describe('Composer voice note — a mic that does not start', () => {
  it('a start failure is never treated as a refusal, and never loops on "Tap the mic again"', async () => {
    startFails('NotReadableError');
    renderComposer();
    tapMic();

    expect(await screen.findByText(MIC_STRIP_TEXT.failed.title)).toBeInTheDocument();
    expect(bridge.requestNativeMicPermission).not.toHaveBeenCalled();
    expect(screen.queryByText(/tap the mic again/i)).toBeNull();
    expect(screen.queryByText(/another app/i)).toBeNull();
    expect(bridge.haptic).toHaveBeenCalledWith('error');
  });

  it('AbortError gets the same plain strip; the second failure also offers typing', async () => {
    startFails('AbortError');
    renderComposer();
    tapMic();
    await screen.findByText(MIC_STRIP_TEXT.failed.title);
    expect(screen.queryByRole('button', { name: 'Type instead' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Type instead' })).toBeInTheDocument();
    expect(recorder.start).toHaveBeenCalledTimes(2);
    expect(bridge.requestNativeMicPermission).not.toHaveBeenCalled();
  });

  it('an old Android app says the fix comes with the next update, with no store button yet', async () => {
    bridge.nativeHas.mockReturnValue(false);
    startFails('NotReadableError');
    renderComposer();
    tapMic();

    expect(await screen.findByText(MIC_STRIP_TEXT['app-update'].title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update from Play Store' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Type instead' })).toBeInTheDocument();
  });

  it('once the new app is on Play, the card sends the person to the store', async () => {
    policy.live = true;
    bridge.nativeHas.mockReturnValue(false);
    startFails('NotReadableError');
    renderComposer();
    tapMic();

    fireEvent.click(await screen.findByRole('button', { name: 'Update from Play Store' }));
    expect(bridge.openAppStore).toHaveBeenCalledWith(
      'https://play.google.com/store/apps/details?id=in.mdgservices.dealerkavachadmin',
    );
  });

  it('an old Android app is still allowed to try: a working mic is never turned away', async () => {
    bridge.nativeHas.mockReturnValue(false);
    startSucceeds();
    renderComposer();
    tapMic();

    expect(await screen.findByText('Recording… tap Send when done')).toBeInTheDocument();
    expect(recorder.start).toHaveBeenCalledTimes(1);
  });

  it('a refusal offers "Allow" and asks the phone only when it is tapped', async () => {
    bridge.requestNativeMicStatus.mockResolvedValue({ granted: false, canAsk: true });
    startFails('NotAllowedError');
    renderComposer();
    tapMic();

    const allow = await screen.findByRole('button', { name: 'Allow' });
    expect(bridge.requestNativeMicPermission).not.toHaveBeenCalled();

    bridge.requestNativeMicPermission.mockResolvedValue({ granted: true, permanentlyDenied: false });
    startSucceeds();
    fireEvent.click(allow);
    expect(await screen.findByText('Recording… tap Send when done')).toBeInTheDocument();
    // Called with no timeout of its own: the bridge's 60 s, long enough for a person.
    expect(bridge.requestNativeMicPermission).toHaveBeenCalledWith();
  });

  it('a refusal the phone will not ask about again shows the Settings steps', async () => {
    bridge.requestNativeMicStatus.mockResolvedValue({ granted: false, canAsk: false });
    startFails('NotAllowedError');
    renderComposer();
    tapMic();

    expect(await screen.findByText(MIC_STRIP_TEXT.settings.title)).toBeInTheDocument();
    expect(bridge.requestNativeMicPermission).not.toHaveBeenCalled();
  });

  it('a laptop browser that blocked the mic is told about its own site settings', async () => {
    bridge.isNativeShell.mockReturnValue(false);
    bridge.detectPlatform.mockReturnValue('web');
    startFails('NotAllowedError');
    renderComposer();
    tapMic();

    expect(await screen.findByText(MIC_STRIP_TEXT['blocked-browser'].title)).toBeInTheDocument();
    expect(bridge.requestNativeMicPermission).not.toHaveBeenCalled();
  });

  it('a mic that never answers is given up on, and says so plainly', async () => {
    vi.useFakeTimers();
    startHangs();
    renderComposer();
    tapMic();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_100);
    });
    expect(screen.getByText(MIC_STRIP_TEXT.failed.title)).toBeInTheDocument();
    expect(recorder.cancel).toHaveBeenCalled();
  });

  it('typing clears the strip', async () => {
    startFails('NotReadableError');
    renderComposer();
    tapMic();
    await screen.findByText(MIC_STRIP_TEXT.failed.title);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    expect(screen.queryByText(MIC_STRIP_TEXT.failed.title)).toBeNull();
  });
});

describe('Composer voice note — refusals that asking again cannot fix', () => {
  /**
   * A team app from before 0.2.0 never says a refusal is permanent, so the
   * strip used to offer Allow again after every "no", round and round.
   */
  it("an old phone app's second \"no\" goes to the Settings steps, not Allow again", async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 13; SM-A135F; wv) AppleWebKit/537.36 Chrome/131 Mobile',
    );
    startFails('NotAllowedError');
    renderComposer();
    tapMic();

    const allow = await screen.findByRole('button', { name: 'Allow' });
    // Android 11 and later: the phone's own button is "While using the app".
    expect(screen.getByText(MIC_STRIP_TEXT['refused-android'].hint!)).toBeInTheDocument();

    bridge.requestNativeMicPermission.mockResolvedValue({ granted: false });
    fireEvent.click(allow);
    expect(await screen.findByText(MIC_STRIP_TEXT.settings.title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
  });

  it('an iPhone that allows the mic yet refuses it says to restart the app, not Try again', async () => {
    bridge.detectPlatform.mockReturnValue('ios');
    bridge.requestNativeMicStatus.mockResolvedValue({ granted: true, canAsk: false });
    startFails('NotAllowedError');
    renderComposer();
    tapMic();

    expect(await screen.findByText(MIC_STRIP_TEXT.restart.title)).toBeInTheDocument();
    expect(screen.getByText(MIC_STRIP_TEXT.restart.hint!)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Type instead' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('Composer voice note — a note still being saved', () => {
  /** Cancelling the recorder here used to throw away the note being sent. */
  it('a tap while the last note is still saving keeps that note and says to tap again', async () => {
    recorder.start.mockImplementation(() =>
      Promise.resolve({ ok: false as const, cause: 'busy-self' as const }),
    );
    renderComposer();
    tapMic();

    expect(
      await screen.findByText(
        'The last voice note is still being saved. Tap the mic again in a moment.',
      ),
    ).toBeInTheDocument();
    expect(recorder.cancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Record voice message' })).toBeInTheDocument();
  });
});

describe('Composer voice note — opening, recording, sending', () => {
  it('shows "Starting mic…" with no clock while the mic opens, and Send waits', async () => {
    startHangs();
    renderComposer();
    tapMic();

    expect(await screen.findByText('Starting mic…')).toBeInTheDocument();
    expect(screen.queryByText('0:00')).toBeNull();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    expect(playback.pauseAllVoiceNotes).toHaveBeenCalled();
  });

  it('records, then sends on Send, with a tick at each end', async () => {
    startSucceeds();
    recorder.stop.mockResolvedValue(clip());
    renderComposer();
    tapMic();
    await screen.findByText('Recording… tap Send when done');
    expect(bridge.haptic).toHaveBeenCalledWith('medium');

    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(bridge.haptic).toHaveBeenCalledWith('success');
  });

  it('the bin throws it away with a light tick', async () => {
    startSucceeds();
    renderComposer();
    tapMic();
    await screen.findByText('Recording… tap Send when done');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel recording' }));
    expect(recorder.cancel).toHaveBeenCalled();
    expect(bridge.haptic).toHaveBeenCalledWith('light');
    expect(screen.getByRole('button', { name: 'Record voice message' })).toBeInTheDocument();
  });

  it('"Too short" only under 700 ms', async () => {
    startSucceeds();
    recorder.stop.mockResolvedValue(clip({ durationMs: 400 }));
    renderComposer();
    tapMic();
    await screen.findByText('Recording… tap Send when done');
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(await screen.findByText(/too short to send/i)).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('a silent take goes to review instead of out', async () => {
    startSucceeds();
    recorder.stop.mockResolvedValue(clip({ maxPeak: 0.005, durationMs: 4000 }));
    renderComposer();
    tapMic();
    await screen.findByText('Recording… tap Send when done');
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(await screen.findByText(REVIEW_TEXT.silent)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send anyway' })).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('an unmeasured take (no level meter) is never called silent', async () => {
    startSucceeds();
    recorder.stop.mockResolvedValue(clip({ maxPeak: null }));
    renderComposer();
    tapMic();
    await screen.findByText('Recording… tap Send when done');
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
  });

  it('the app going to the background stops the recording for review; nothing is sent', async () => {
    startSucceeds();
    recorder.stop.mockResolvedValue(clip());
    renderComposer();
    tapMic();
    await screen.findByText('Recording… tap Send when done');

    act(() => {
      window.dispatchEvent(new CustomEvent('native-app-state', { detail: 'background' }));
    });
    expect(await screen.findByText(REVIEW_TEXT.background)).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
  });

  it('the phone taking the mic mid-recording goes to review and names the call', async () => {
    startSucceeds();
    recorder.stop.mockResolvedValue(clip());
    const { rerenderSame } = renderComposer();
    tapMic();
    await screen.findByText('Recording… tap Send when done');

    recorder.muted = true;
    rerenderSame();
    expect(await screen.findByText(REVIEW_TEXT.muted)).toBeInTheDocument();
    expect(bridge.haptic).toHaveBeenCalledWith('warning');
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('Composer voice note — leaving the screen', () => {
  /**
   * An iPhone mutes the mic as the app goes to the back. That is the person
   * leaving, not a call, so the review must not guess "a call?".
   */
  it('a mute while the app is leaving the screen reads as leaving, not as a call', async () => {
    startSucceeds();
    recorder.stop.mockResolvedValue(clip());
    const { rerenderSame } = renderComposer();
    tapMic();
    await screen.findByText('Recording… tap Send when done');

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      recorder.muted = true;
      rerenderSame();
      expect(await screen.findByText(REVIEW_TEXT.background)).toBeInTheDocument();
      expect(screen.queryByText(REVIEW_TEXT.muted)).toBeNull();
      expect(onSend).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
    }
  });
});

describe('Composer voice note — the one-time explainer', () => {
  it('a phone app that can say the mic is not yet allowed gets one sentence first', async () => {
    bridge.nativeHas.mockImplementation((f: string) => f === 'mic-ready' || f === 'mic-status');
    bridge.requestNativeMicStatus.mockResolvedValue({ granted: false, canAsk: true });
    startSucceeds();
    renderComposer();
    tapMic();

    const ok = await screen.findByRole('button', { name: 'OK' });
    expect(recorder.start).not.toHaveBeenCalled();
    fireEvent.click(ok);
    expect(await screen.findByText('Recording… tap Send when done')).toBeInTheDocument();
    expect(recorder.start).toHaveBeenCalledTimes(1);
  });
});

describe('the words on the strips', () => {
  it('never claim another app has the mic, and never send anyone round the old loop', () => {
    const all = [
      ...Object.values(MIC_STRIP_TEXT).flatMap((t) => [t.title, t.hint ?? '']),
      ...Object.values(REVIEW_TEXT),
    ].join('\n');
    expect(all).not.toMatch(/another app/i);
    expect(all).not.toMatch(/tap the mic again to record/i);
    expect(all).not.toMatch(/\bsir\b/i);
  });
});
