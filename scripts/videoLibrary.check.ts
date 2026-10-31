/**
 * Checks for the Video library page (`src/lib/videoLibrary.ts`): its shelves, its
 * filter chips and the words on a card. Plain `node:test`, as the other checks:
 *
 *   cd mdg-admin && npm run check:video-library
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GuideVideoAdminItem } from '../shared/src/types/videoLibrary';
import {
  filterLibrary,
  isLibraryFilter,
  libraryShelves,
  libraryTag,
  limitWords,
  searchLibrary,
  sendNote,
  videoShape,
} from '../src/lib/videoLibrary';

function video(id: string, over: Partial<GuideVideoAdminItem> = {}): GuideVideoAdminItem {
  return {
    id,
    title: { hi: `${id} हिंदी`, en: `Title of ${id}` },
    summary: { hi: 'सार', en: `What ${id} teaches` },
    durationMs: 60_000,
    service: null,
    available: true,
    audience: 'both',
    outsideAppOnly: false,
    chapters: [{ startSec: 0, label: { hi: 'शुरू', en: 'Start' }, text: 'शुरू' }],
    family: 'guide',
    aliases: [],
    sendWhen: [],
    sendable: true,
    posterUrl: null,
    publicUrl: null,
    transcript: null,
    companies: null,
    onlyFor: null,
    ...over,
  };
}

const LIBRARY: GuideVideoAdminItem[] = [
  video('papers', { title: { hi: 'कागज़', en: 'Papers' } }),
  video('app_tour', { title: { hi: 'ऐप', en: 'App tour' } }),
  video('svc_dsr', { service: 'dsr-report' }),
  video('paying_bill', { outsideAppOnly: true }),
  video('admin_onboarding', { audience: 'admin' }),
  video('pk_water_dip', { family: 'explainer', title: { hi: 'पानी का डिप', en: 'The water dip' } }),
];

describe('the library’s shelves', () => {
  it('shows the app how-tos, the services, WhatsApp-only, the explainers, then the team’s — each by title', () => {
    const shelves = libraryShelves(LIBRARY);
    assert.deepEqual(
      shelves.map((s) => [s.key, s.items.map((v) => v.id)]),
      [
        ['howTo', ['app_tour', 'papers']],
        ['services', ['svc_dsr']],
        ['whatsapp', ['paying_bill']],
        ['explainer', ['pk_water_dip']],
        ['team', ['admin_onboarding']],
      ],
    );
  });

  it('leaves an empty shelf out', () => {
    assert.deepEqual(
      libraryShelves([video('papers')]).map((s) => s.key),
      ['howTo'],
    );
    assert.deepEqual(libraryShelves([]), []);
  });
});

describe('the filter chips', () => {
  it('keeps what each chip names', () => {
    const ids = (f: Parameters<typeof filterLibrary>[1]) =>
      filterLibrary(LIBRARY, f).map((v) => v.id);
    assert.deepEqual(ids('team'), ['admin_onboarding']);
    assert.deepEqual(ids('explainer'), ['pk_water_dip']);
    assert.deepEqual(ids('dealer'), ['papers', 'app_tour', 'svc_dsr', 'paying_bill']);
    assert.equal(ids('all').length, LIBRARY.length);
    assert.equal(isLibraryFilter('team'), true);
    assert.equal(isLibraryFilter('nonsense'), false);
    assert.equal(isLibraryFilter(null), false);
  });

  it('searches inside the chip only', () => {
    assert.deepEqual(
      searchLibrary(LIBRARY, 'water', 'all').map((h) => h.item.id),
      ['pk_water_dip'],
    );
    assert.deepEqual(searchLibrary(LIBRARY, 'water', 'team'), []);
  });
});

describe('the words on a card', () => {
  it('says who it is for, and the shape of its picture', () => {
    assert.equal(libraryTag(video('pk', { family: 'explainer' })), 'Public · anyone');
    assert.equal(libraryTag(video('a', { audience: 'admin' })), 'Team');
    assert.equal(libraryTag(video('b', { outsideAppOnly: true })), 'WhatsApp only');
    assert.equal(libraryTag(video('c', { audience: 'owner' })), 'Owners');
    assert.equal(videoShape(video('a', { audience: 'admin' })), 'landscape');
    assert.equal(videoShape(video('papers')), 'portrait');
  });

  it('says in words why a video cannot be sent into a chat, and nothing when it can', () => {
    assert.match(sendNote(video('a', { audience: 'admin' })) ?? '', /team only/);
    assert.match(sendNote(video('b', { outsideAppOnly: true })) ?? '', /WhatsApp only/);
    assert.match(sendNote(video('c', { sendable: false })) ?? '', /Not uploaded/);
    assert.equal(sendNote(video('papers')), null);
  });

  it('names where it is limited', () => {
    const v = video('x', { onlyFor: { service: 'tt-density' }, companies: ['iocl'] });
    assert.deepEqual(
      limitWords(v, (id) => (id === 'tt-density' ? 'TT Density' : id)),
      ['Only for pumps on TT Density', 'Indian Oil pumps only'],
    );
    assert.deepEqual(
      limitWords(video('y'), (id) => id),
      [],
    );
  });
});
