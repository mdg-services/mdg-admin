import type { Message } from '@dk/shared';
import { describe, expect, it } from 'vitest';

import { guessDealerLang } from './dealerView';

const note = (body: string, createdAt: string): Message =>
  ({ id: createdAt, system: true, body, createdAt }) as unknown as Message;

describe('guessDealerLang — the resolve notice never decides the app language', () => {
  const hindi = note('आज की DSR तैयार है।', '2026-11-20T05:00:00.000Z');

  it('skips the notice an admin\'s Resolve posts now ("This is done: …", "We have finished this.")', () => {
    expect(guessDealerLang([hindi, note('This is done: DSR.', '2026-11-21T05:00:00.000Z')])).toBe('hi');
    expect(guessDealerLang([hindi, note('We have finished this.', '2026-11-21T05:00:00.000Z')])).toBe('hi');
  });

  it('still skips the older "Resolved — …" line on threads resolved before the wording changed', () => {
    expect(guessDealerLang([hindi, note('Resolved — DSR', '2026-11-21T05:00:00.000Z')])).toBe('hi');
  });

  it('lets an ordinary English notice decide', () => {
    expect(guessDealerLang([hindi, note('The DSR for 22 Nov is ready.', '2026-11-21T05:00:00.000Z')])).toBe('en');
  });

  it('defaults to Hindi with nothing to go by', () => {
    expect(guessDealerLang([note('This is done: DSR.', '2026-11-21T05:00:00.000Z')])).toBe('hi');
    expect(guessDealerLang([])).toBe('hi');
  });
});
