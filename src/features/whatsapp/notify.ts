/**
 * How the inbox gets noticed when nobody is looking at it: a soft two-tone
 * sound, and — on a desktop browser, with the person's say-so — a system
 * notification.
 *
 * Phones do not use the second one. The admin app on a phone is a WebView shell
 * and every message already reaches it as a push, from the alert the server
 * raises; a notification from the page as well would ring twice for one message.
 *
 * Both preferences live in the browser's own storage, because they belong to
 * the device and not to the account: a laptop on a desk wants the sound, the
 * same person's other laptop in a meeting does not. Every read and write is
 * wrapped, since storage can be switched off, and nothing here may stop a
 * message being read.
 */
import * as React from 'react';

import { isNativeShell } from '@/lib/nativeBridge';

const MUTED_KEY = 'dk.whatsapp.muted';
const ALERTS_KEY = 'dk.whatsapp.desktopAlerts';

// ─────────────────────────────────────────────────────────────────────────
// A tiny preference store the header buttons and the live listener share
// ─────────────────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changing the switch should move this one too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === MUTED_KEY || e.key === ALERTS_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage is off: the choice lasts until the page is closed, which is fine.
  }
  emit();
}

// Kept in memory too, so a switch still works when storage refuses to hold it.
let mutedMemory: boolean | null = null;
let alertsMemory: 'on' | 'off' | null = null;

export function isMuted(): boolean {
  return mutedMemory ?? readFlag(MUTED_KEY) === '1';
}

export function setMuted(muted: boolean): void {
  mutedMemory = muted;
  writeFlag(MUTED_KEY, muted ? '1' : null);
}

/** The sound switch, live. */
export function useMuted(): boolean {
  return React.useSyncExternalStore(subscribe, isMuted, () => false);
}

function alertsChoice(): 'on' | 'off' {
  if (alertsMemory) return alertsMemory;
  return readFlag(ALERTS_KEY) === 'off' ? 'off' : 'on';
}

// ─────────────────────────────────────────────────────────────────────────
// The sound
// ─────────────────────────────────────────────────────────────────────────

type AudioCtor = typeof AudioContext;

let audio: AudioContext | null = null;
let lastPlayedAt = 0;

function audioContext(): AudioContext | null {
  try {
    const Ctor: AudioCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return null;
    audio ??= new Ctor();
    return audio;
  } catch {
    return null;
  }
}

/**
 * Browsers keep sound off until the person has touched the page once. Called
 * from the first tap or key press, so the first message after that can be heard.
 */
export function unlockSound(): void {
  const ctx = audioContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

/**
 * Two short soft notes, rising. Made on the spot, so there is no sound file to
 * ship or to fail to load. Quiet on purpose: this plays all day.
 */
export function playIncomingSound(): void {
  if (isMuted()) return;
  // A burst of messages is one sound, not a rattle.
  const nowMs = Date.now();
  if (nowMs - lastPlayedAt < 1200) return;
  lastPlayedAt = nowMs;
  try {
    const ctx = audioContext();
    if (!ctx || ctx.state !== 'running') return;
    const start = ctx.currentTime + 0.01;
    const note = (freq: number, at: number, length: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // A quick rise and a long fall: no click at either end.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.07, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + length + 0.02);
    };
    note(660, start, 0.16);
    note(880, start + 0.13, 0.22);
  } catch {
    // A sound that does not play is not worth a message.
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Desktop notifications
// ─────────────────────────────────────────────────────────────────────────

export type AlertPermission = 'unsupported' | 'default' | 'granted' | 'denied';

/** Whether this browser can show system notifications at all, and what it has been told. */
export function alertPermission(): AlertPermission {
  if (isNativeShell() || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** True when a notification would actually be shown: allowed by the browser and not switched off here. */
export function desktopAlertsOn(): boolean {
  return alertPermission() === 'granted' && alertsChoice() === 'on';
}

export interface DesktopAlerts {
  permission: AlertPermission;
  /** Allowed and not switched off. */
  on: boolean;
  /**
   * What a click on the bell does: ask the browser the first time, then switch
   * the alerts on and off. Resolves to the permission afterwards, so the caller
   * can explain a refusal.
   */
  toggle: () => Promise<AlertPermission>;
}

export function useDesktopAlerts(): DesktopAlerts {
  const [permission, setPermission] = React.useState<AlertPermission>(alertPermission);
  const choice = React.useSyncExternalStore(subscribe, alertsChoice, () => 'on' as const);

  // The person can change the permission in the browser's own settings while
  // this page is open; there is no event for it, so look again on coming back.
  React.useEffect(() => {
    const look = () => setPermission(alertPermission());
    document.addEventListener('visibilitychange', look);
    window.addEventListener('focus', look);
    return () => {
      document.removeEventListener('visibilitychange', look);
      window.removeEventListener('focus', look);
    };
  }, []);

  const toggle = React.useCallback(async (): Promise<AlertPermission> => {
    const current = alertPermission();
    if (current === 'unsupported' || current === 'denied') {
      setPermission(current);
      return current;
    }
    if (current === 'default') {
      let next: NotificationPermission = 'default';
      try {
        next = await Notification.requestPermission();
      } catch {
        next = Notification.permission;
      }
      setPermission(next);
      if (next === 'granted') {
        alertsMemory = 'on';
        writeFlag(ALERTS_KEY, null);
      }
      return next;
    }
    const nextChoice = alertsChoice() === 'on' ? 'off' : 'on';
    alertsMemory = nextChoice;
    writeFlag(ALERTS_KEY, nextChoice === 'off' ? 'off' : null);
    return current;
  }, []);

  return { permission, on: permission === 'granted' && choice === 'on', toggle };
}

/**
 * A system notification for one message. The tag is the person, so a burst
 * from one chat becomes one notification that updates instead of a stack.
 * Never throws: some browsers refuse the constructor outright.
 */
export function showDesktopNotification(opts: {
  tag: string;
  title: string;
  body: string;
  onClick: () => void;
}): void {
  if (!desktopAlertsOn()) return;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon: '/icon.png',
    });
    n.onclick = () => {
      n.close();
      opts.onClick();
    };
  } catch {
    // Nothing to do: the toast and the title badge still tell the story.
  }
}
