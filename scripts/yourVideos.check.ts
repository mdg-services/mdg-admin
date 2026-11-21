/**
 * Checks for the outlet's "Videos watched" card (`src/features/yourVideos/yourVideosView.ts`):
 * how the rows split into the services the outlet has and the ones it does not, the line that
 * says who watched and when, and the one-line summary under the title.
 *
 *   cd mdg-admin && npm run check:your-videos
 *
 * which is `npx tsx --test scripts/yourVideos.check.ts`. Every video, person and date here is invented.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { YourVideosAdminRow, YourVideosAdminView, YourVideosWatcher } from '../shared/src/types/yourVideos';
import { rowsByGroup, summaryWords, watcherLine } from '../src/features/yourVideos/yourVideosView';

const day = (iso: string) => iso.slice(0, 10);

const row = (id: string, over: Partial<YourVideosAdminRow> = {}): YourVideosAdminRow => ({
  id,
  title: { hi: id, en: id },
  service: 'dsr-report',
  serviceName: { en: 'Daily Sales Report', hi: 'रोज़ की बिक्री रिपोर्ट' },
  attached: true,
  durationMs: 60_000,
  watchedBy: [],
  ...over,
});

const person = (over: Partial<YourVideosWatcher> = {}): YourVideosWatcher => ({
  userId: 'u1',
  name: 'Test Owner',
  role: 'owner',
  watchedAt: '2026-11-21T06:00:00.000Z',
  ...over,
});

describe('the Videos watched card', () => {
  it('splits the rows into the services the outlet has and the ones it does not, keeping the list order', () => {
    const rows = [row('a'), row('b', { attached: false }), row('c'), row('d', { attached: false })];
    const g = rowsByGroup(rows);
    assert.deepEqual(g.has.map((r) => r.id), ['a', 'c']);
    assert.deepEqual(g.hasNot.map((r) => r.id), ['b', 'd']);
  });

  it('says who watched and when, with the role beside the name', () => {
    assert.equal(watcherLine(person(), day), 'Test Owner (owner) · 2026-11-21');
    assert.equal(watcherLine(person({ role: 'manager', name: 'Test Manager' }), day), 'Test Manager (manager) · 2026-11-21');
  });

  it('does not leave a blank for a person with no name on record', () => {
    assert.equal(watcherLine(person({ name: null }), day), 'An owner (owner) · 2026-11-21');
    assert.equal(watcherLine(person({ name: '  ', role: 'manager' }), day), 'The manager (manager) · 2026-11-21');
  });

  it('counts a video as watched when anyone watched it, and says how many people could', () => {
    const view: YourVideosAdminView = {
      rows: [row('a', { watchedBy: [person(), person({ userId: 'u2', role: 'manager' })] }), row('b'), row('c', { watchedBy: [person()] })],
      people: 3,
      lastSentAt: '2026-11-20T10:00:00.000Z',
    };
    assert.equal(summaryWords(view, day), '2 of 3 videos watched by someone · 3 people on the app · List sent 2026-11-20');
  });

  it('reads right for one person and for a list that was never sent', () => {
    const view: YourVideosAdminView = { rows: [row('a')], people: 1, lastSentAt: null };
    assert.equal(summaryWords(view, day), '0 of 1 videos watched by someone · 1 person on the app · List not sent yet');
  });
});
