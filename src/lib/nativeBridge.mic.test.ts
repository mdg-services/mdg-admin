import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isOldAndroidAppForMic, TEAM_APP_PLAY_URL } from './micPolicy';
import {
  detectPlatform,
  hasNativeFeature,
  openAppStore,
  requestNativeMicPermission,
  requestNativeMicStatus,
} from './nativeBridge';

/**
 * The page's half of the phone-app contract for voice notes: what a 0.2.0 team
 * app says it can do, the status question that never prompts, the store link,
 * and the permission request that waits for a person.
 */

type ShellWindow = Window & {
  __DK_NATIVE_PLATFORM__?: 'ios' | 'android';
  __DK_NATIVE_FEATURES__?: readonly string[];
};
const w = window as ShellWindow;
const posted: Array<Record<string, unknown>> = [];

function inShell(platform: 'ios' | 'android', features?: string[]) {
  w.ReactNativeWebView = { postMessage: (m: string) => posted.push(JSON.parse(m)) };
  w.__DK_NATIVE_PLATFORM__ = platform;
  if (features) w.__DK_NATIVE_FEATURES__ = features;
}

beforeEach(() => {
  posted.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  delete w.ReactNativeWebView;
  delete w.__DK_NATIVE_PLATFORM__;
  delete w.__DK_NATIVE_FEATURES__;
});

describe('which phone app this is', () => {
  it('a 0.2.0 Android app says it can record; an older one says nothing and needs the update', () => {
    inShell('android', ['mic-ready', 'mic-status', 'open-store']);
    expect(hasNativeFeature('mic-ready')).toBe(true);
    expect(isOldAndroidAppForMic()).toBe(false);

    delete w.__DK_NATIVE_FEATURES__;
    expect(isOldAndroidAppForMic()).toBe(true);
  });

  it('the phone app saying iPhone wins over a user-agent that says Mac', () => {
    inShell('ios');
    expect(detectPlatform()).toBe('ios');
  });

  it('a laptop browser is never an old phone app', () => {
    expect(isOldAndroidAppForMic()).toBe(false);
  });
});

describe('permission:micStatus', () => {
  it('is not even asked of a phone app that cannot answer it', async () => {
    inShell('android', ['mic-ready']);
    await expect(requestNativeMicStatus()).resolves.toBeNull();
    expect(posted).toEqual([]);
  });

  it('reads the answer, and gives up after 800 ms rather than wait', async () => {
    inShell('android', ['mic-ready', 'mic-status']);
    const answer = requestNativeMicStatus();
    expect(posted).toEqual([{ type: 'permission:micStatus' }]);
    window.dispatchEvent(
      new CustomEvent('native-mic-status', { detail: { granted: false, canAsk: false } }),
    );
    await expect(answer).resolves.toEqual({ granted: false, canAsk: false });

    vi.useFakeTimers();
    const silent = requestNativeMicStatus();
    vi.advanceTimersByTime(801);
    await expect(silent).resolves.toBeNull();
  });
});

describe('permission:requestMic', () => {
  it('waits a full minute for a person to answer, not five seconds', async () => {
    vi.useFakeTimers();
    inShell('android', ['mic-ready']);
    const answer = requestNativeMicPermission();
    let settled = false;
    void answer.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(settled).toBe(false);

    window.dispatchEvent(
      new CustomEvent('native-mic-permission', { detail: { granted: true, permanentlyDenied: false } }),
    );
    await expect(answer).resolves.toEqual({ granted: true, permanentlyDenied: false });
  });
});

describe('app:openStore', () => {
  it('a phone app that can open the store is asked to', () => {
    inShell('android', ['mic-ready', 'open-store']);
    expect(openAppStore(TEAM_APP_PLAY_URL)).toBe('app');
    expect(posted).toEqual([{ type: 'app:openStore' }]);
  });

  it("an older phone app is sent to the store's web address instead", () => {
    inShell('android');
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location);
    expect(openAppStore(TEAM_APP_PLAY_URL)).toBe('browser');
    expect(assign).toHaveBeenCalledWith(
      'https://play.google.com/store/apps/details?id=in.mdgservices.dealerkavachadmin',
    );
    expect(posted).toEqual([]);
  });
});
