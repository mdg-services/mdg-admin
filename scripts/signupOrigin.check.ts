/**
 * Checks for the Onboarding page's words for where a registration was filled in
 * and what the owner signs in on (`src/lib/signupOrigin.ts`).
 *
 *   cd mdg-admin && npx tsx --test scripts/signupOrigin.check.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deviceUseLabel, originLabel, signupMixLines } from '../src/lib/signupOrigin';

describe('where they signed up, and the device they use', () => {
  it('names the form and the device; the form alone for a registration from before the device was kept', () => {
    assert.equal(originLabel({ via: 'app', device: { kind: 'android', inApp: true } }), 'App · Android');
    assert.equal(originLabel({ via: 'website', device: { kind: 'iphone', inApp: false } }), 'Website · iPhone');
    assert.equal(originLabel({ via: 'website', device: { kind: 'computer', inApp: false } }), 'Website · Computer');
    assert.equal(originLabel({ via: 'app', device: null }), 'App');
  });

  it('says whether the owner uses the app or a browser on the phone', () => {
    assert.equal(deviceUseLabel({ kind: 'android', inApp: true }), 'Android app');
    assert.equal(deviceUseLabel({ kind: 'android', inApp: false }), 'Android, in a browser');
    assert.equal(deviceUseLabel({ kind: 'iphone', inApp: true }), 'iPhone app');
    assert.equal(deviceUseLabel({ kind: 'iphone', inApp: false }), 'iPhone, in a browser');
    assert.equal(deviceUseLabel({ kind: 'computer', inApp: false }), 'Computer');
    assert.equal(deviceUseLabel(null), 'Unknown device');
  });

  it('counts by form and by device, naming "other" and "not recorded" only when there are some', () => {
    const lines = signupMixLines({
      via: { app: 3, website: 2 },
      device: { android: 3, iphone: 1, computer: 0, other: 0, unknown: 1 },
    });
    assert.equal(lines.via, 'App 3 · Website 2');
    assert.equal(lines.device, 'Android 3 · iPhone 1 · Computer 0 · Not recorded 1');
    const all = signupMixLines({
      via: { app: 0, website: 1 },
      device: { android: 0, iphone: 0, computer: 0, other: 1, unknown: 0 },
    });
    assert.equal(all.device, 'Android 0 · iPhone 0 · Computer 0 · Other device 1');
  });
});
