/**
 * The Onboarding page's words for where a registration was filled in and what the
 * owner signs in on: "App · Android", "Uses: Android app", and the 90-day count
 * beside the funnel (owner's request, 30 Oct 2026). The device itself is read on
 * the server (shared `lib/device.ts`); this only names it.
 *
 * Its own file, with type-only imports, so `scripts/signupOrigin.check.ts` can run
 * it without loading the rest of the onboarding helpers.
 */
import type { DeviceKind, DeviceSeen, SignupMix, SignupOrigin } from '@dk/shared';

const DEVICE_NAME: Record<DeviceKind, string> = {
  android: 'Android',
  iphone: 'iPhone',
  computer: 'Computer',
  other: 'Other device',
};

/** "App · Android", "Website · iPhone"; the form alone for one from before the device was recorded. */
export function originLabel(o: SignupOrigin): string {
  const form = o.via === 'app' ? 'App' : 'Website';
  return o.device ? `${form} · ${DEVICE_NAME[o.device.kind]}` : form;
}

/** What the owner signs in on: "Android app", "iPhone, in a browser", "Computer"; null when unreadable. */
export function deviceUseLabel(d: DeviceSeen | null): string {
  if (!d) return 'Unknown device';
  if (d.kind === 'android') return d.inApp ? 'Android app' : 'Android, in a browser';
  if (d.kind === 'iphone') return d.inApp ? 'iPhone app' : 'iPhone, in a browser';
  return DEVICE_NAME[d.kind];
}

/**
 * The two lines beside the funnel: "App 3 · Website 2" and "Android 4 · iPhone 1 ·
 * Computer 0". "Other device" and "Not recorded" (forms from before 30 Oct 2026)
 * appear only when there are some.
 */
export function signupMixLines(m: SignupMix): { via: string; device: string } {
  const parts = [
    `Android ${m.device.android}`,
    `iPhone ${m.device.iphone}`,
    `Computer ${m.device.computer}`,
    ...(m.device.other > 0 ? [`Other device ${m.device.other}`] : []),
    ...(m.device.unknown > 0 ? [`Not recorded ${m.device.unknown}`] : []),
  ];
  return { via: `App ${m.via.app} · Website ${m.via.website}`, device: parts.join(' · ') };
}
