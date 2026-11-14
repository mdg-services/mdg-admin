import { afterEach, describe, expect, it, vi } from 'vitest';

import { micAskYesWords } from './micPolicy';

type ShellWindow = { __DK_NATIVE_PLATFORM__?: string };
const shell = () => window as unknown as ShellWindow;

/**
 * Android 11 and later has no "Allow" button for the microphone, only "While
 * using the app". The chat must name the button the phone actually shows. The
 * same rule as the dealer app's (mdg-client `lib/micPolicy.test.ts`).
 */
describe('micAskYesWords', () => {
  const ua = (value: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(value);
  afterEach(() => {
    delete shell().__DK_NATIVE_PLATFORM__;
  });

  it('Android 11 and later say "While using the app"', () => {
    ua('Mozilla/5.0 (Linux; Android 11; RMX2185) AppleWebKit/537.36 Chrome/120 Mobile');
    expect(micAskYesWords()).toBe('while-using');
    ua('Mozilla/5.0 (Linux; Android 14; SM-A145F; wv) AppleWebKit/537.36 Chrome/131 Mobile');
    expect(micAskYesWords()).toBe('while-using');
  });

  it('Android 10 and older keep "Allow"', () => {
    ua('Mozilla/5.0 (Linux; Android 10; Redmi 8) AppleWebKit/537.36 Chrome/96 Mobile');
    expect(micAskYesWords()).toBe('allow');
    ua('Mozilla/5.0 (Linux; Android 8.1.0; vivo 1820) AppleWebKit/537.36 Chrome/90 Mobile');
    expect(micAskYesWords()).toBe('allow');
  });

  it('an Android phone whose version cannot be read is taken as a new one', () => {
    ua('Mozilla/5.0 (Linux; Android; K) AppleWebKit/537.36 Chrome/120 Mobile');
    expect(micAskYesWords()).toBe('while-using');
    ua('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');
    shell().__DK_NATIVE_PLATFORM__ = 'android';
    expect(micAskYesWords()).toBe('while-using');
  });

  it('an iPhone or a computer keeps "Allow"', () => {
    ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15');
    expect(micAskYesWords()).toBe('allow');
    ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131');
    expect(micAskYesWords()).toBe('allow');
  });
});
