/**
 * Checks for the "How this works" registry (`src/lib/guideVideos.ts`): that every
 * screen with the button resolves to something, that what it points at really
 * exists in MDG's video library, that a deep link lands on a chapter start, and
 * that nothing points at the retired video website.
 *
 * This app has no test runner, so these are plain `node:test` checks over the
 * pure module, run through the `tsx` the repo root already carries:
 *
 *   cd mdg-admin && npm run check:guide-videos
 *
 * which is `npx tsx --test scripts/guideVideos.check.ts`. The library files are
 * read from `../marketing/explainers` when this runs inside the monorepo checkout;
 * the checks that need them are skipped (and say so) when it does not.
 *
 * They sit outside `src/` on purpose: the build type-checks `src/`, and a test
 * import there would break a standalone build that has no test types.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { GuideVideoAdminItem } from '../shared/src/types/videoLibrary';
import {
  PUBLIC_VIDEOS_BASE,
  audienceTag,
  catalogFrom,
  chapterAt,
  clock,
  guideDescription,
  guideRegistry,
  hasDedicatedVideo,
  libraryRows,
  minutesLabel,
  refsForSurface,
  resolveRows,
  type GuideRef,
} from '../src/lib/guideVideos';

const here = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.join(here, '..');
const explainers = path.join(adminRoot, '..', 'marketing', 'explainers');
const haveLibrary = existsSync(explainers);

interface LibraryFile {
  id: string;
  audience: GuideVideoAdminItem['audience'];
  title: { hi: string; en: string };
  summary: { hi: string; en: string };
  outsideAppOnly: boolean;
  chapters: { startSec: number; label: { hi: string; en: string } }[];
}

/** Every library.json under marketing/explainers (and _admin/), by video id. */
function libraryFiles(): Map<string, LibraryFile> {
  const out = new Map<string, LibraryFile>();
  const read = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name, 'library.json');
      if (!name.startsWith('.') && existsSync(file)) {
        const lib = JSON.parse(readFileSync(file, 'utf8')) as LibraryFile;
        out.set(lib.id, lib);
      }
    }
  };
  read(explainers);
  if (existsSync(path.join(explainers, '_admin'))) read(path.join(explainers, '_admin'));
  return out;
}

/** Every `surface="…"` the portal's screens pass to <HowThisWorks>. */
function surfacesInUse(): string[] {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx$/.test(entry.name)) {
        for (const m of readFileSync(p, 'utf8').matchAll(/surface=(?:"([^"]+)"|\{'([^']+)'\})/g)) {
          const id = m[1] ?? m[2];
          if (id) found.add(id);
        }
      }
    }
  };
  walk(path.join(adminRoot, 'src'));
  return [...found].sort();
}

function item(over: Partial<GuideVideoAdminItem> & { id: string }): GuideVideoAdminItem {
  return {
    title: { hi: 'शीर्षक', en: over.id },
    summary: { hi: 'सार', en: `About ${over.id}` },
    durationMs: 120_000,
    service: null,
    available: true,
    audience: 'admin',
    outsideAppOnly: false,
    chapters: [],
    ...over,
  };
}

describe('every screen with the button resolves to something', () => {
  const surfaces = surfacesInUse();

  it('finds the screens that carry the button', () => {
    assert.ok(surfaces.length > 90, `expected about a hundred surfaces, found ${surfaces.length}`);
  });

  for (const surface of surfaces) {
    it(`${surface} has at least the library row, last`, () => {
      const refs = refsForSurface(surface);
      assert.ok(refs.length >= 1);
      assert.equal(refs[refs.length - 1]?.kind, 'library');
      assert.equal(resolveRows(refs, undefined).length >= 1, true);
    });
  }
});

describe('the tiers', () => {
  it('an exact entry wins, and says it is of this screen', () => {
    const refs = refsForSurface('admin-dsr-generate');
    assert.equal(refs[0]?.kind, 'video');
    assert.equal(refs[0]?.fit, 'screen');
    assert.match(guideDescription(refs), /this exact screen/);
    assert.ok(hasDedicatedVideo('admin-dsr-generate'));
  });

  it('a topic match is about the subject, never the screen, even for a screen video', () => {
    const refs = refsForSurface('admin-dealer-vault-credit-dod-extra');
    const first = refs[0];
    assert.equal(first?.kind, 'video');
    assert.equal(first?.fit, 'subject');
    assert.match(guideDescription(refs), /not of this exact screen/);
    assert.equal(hasDedicatedVideo('admin-dealer-vault-credit-dod-extra'), false);
  });

  it('the more specific topic wins (credit-dod before vault)', () => {
    const first = refsForSurface('admin-x-credit-dod-vault')[0];
    assert.equal(first?.kind === 'video' && first.id, 'admin_credit_dod');
  });

  it('an unknown screen gets only the library, and says no walkthrough exists', () => {
    const refs = refsForSurface('admin-something-new');
    assert.deepEqual(
      refs.map((r) => r.kind),
      ['library'],
    );
    assert.match(guideDescription(refs), /No walkthrough for this screen yet/);
  });

  it('a public explainer is never presented as of the screen', () => {
    const refs = refsForSurface('admin-bank-holidays');
    const web = refs.find((r) => r.kind === 'web');
    assert.ok(web);
    assert.equal(web.fit, 'subject');
  });
});

describe('resolveRows', () => {
  const catalog = [
    item({
      id: 'admin_credit_dod',
      title: { hi: 'हि', en: 'What the service does' },
      durationMs: 197_525,
    }),
    item({ id: 'admin_credit_dod_portal', available: false }),
    item({ id: 'points_system', audience: 'owner' }),
    item({ id: 'points_give', audience: 'owner' }),
    item({ id: 'paying_bill', audience: 'both', outsideAppOnly: true }),
  ];

  it('takes title, summary and length from the library', () => {
    const rows = resolveRows(refsForSurface('admin-credit-dod-card'), catalog);
    const first = rows[0];
    assert.equal(first?.title, 'What the service does');
    assert.equal(first?.blurb, 'About admin_credit_dod');
    assert.equal(first?.minutes, '3 min');
    assert.equal(first?.available, true);
  });

  it('marks a video the library has but has no file for as not available', () => {
    const rows = resolveRows(refsForSurface('admin-credit-dod-card'), catalog);
    assert.equal(rows[1]?.available, false);
  });

  it('shows a video the library does not list at all as not available, rather than hiding it', () => {
    const rows = resolveRows(refsForSurface('admin-dsr-generate'), catalog);
    assert.equal(rows[0]?.id, 'admin_hand_entry');
    assert.equal(rows[0]?.available, false);
  });

  it('keeps every row tappable with its own title while the library is still loading', () => {
    const rows = resolveRows(refsForSurface('admin-dsr-generate'), undefined);
    assert.equal(rows[0]?.title, 'Adding or correcting a tanker receipt');
    assert.equal(rows[0]?.available, true);
  });

  it('a deep link keeps the name of the PART it opens, and its start second', () => {
    const rows = resolveRows(refsForSurface('admin-shift-sheet'), catalog);
    assert.equal(rows[0]?.title, 'Typing a day into the Shift sheet');
    assert.equal(rows[0]?.at, 39.33);
  });

  it('the staff-points set expands from the library by prefix, and is empty before it loads', () => {
    const refs = refsForSurface('admin-staff-x');
    assert.deepEqual(
      resolveRows(refs, catalog)
        .filter((r) => r.kind === 'video')
        .map((r) => r.id),
      ['points_system', 'points_give'],
    );
    assert.deepEqual(
      resolveRows(refs, undefined).map((r) => r.kind),
      ['library'],
    );
  });

  it('a web row carries its address', () => {
    const rows = resolveRows(refsForSurface('admin-bank-holidays'), catalog);
    const web = rows.find((r) => r.kind === 'web');
    assert.equal(web?.href, `${PUBLIC_VIDEOS_BASE}/dod-clock`);
  });
});

describe('the full library list', () => {
  const catalog = [
    item({ id: 'z_dealer', audience: 'owner', title: { hi: 'x', en: 'Zebra' } }),
    item({ id: 'b_team', audience: 'admin', title: { hi: 'x', en: 'Beta' } }),
    item({ id: 'a_team', audience: 'admin', title: { hi: 'x', en: 'Alpha' } }),
    item({
      id: 'paying_bill',
      audience: 'both',
      outsideAppOnly: true,
      title: { hi: 'x', en: 'Paying' },
    }),
  ];

  it('lists the team videos first, then the rest, each by title, and leaves none out', () => {
    const rows = libraryRows(catalog);
    assert.deepEqual(
      rows.map((r) => r.id),
      ['a_team', 'b_team', 'paying_bill', 'z_dealer'],
    );
  });

  it('tags who each is for', () => {
    const tags = libraryRows(catalog).map((r) => r.tag);
    assert.deepEqual(tags, ['Team', 'Team', 'WhatsApp only', 'For owners']);
    assert.equal(audienceTag({ audience: 'both', outsideAppOnly: false }), 'For dealers');
    assert.equal(audienceTag({ audience: 'manager', outsideAppOnly: false }), 'For managers');
  });
});

describe('small helpers', () => {
  it('minutesLabel never says 0 min', () => {
    assert.equal(minutesLabel(44_000), '1 min');
    assert.equal(minutesLabel(197_525), '3 min');
    assert.equal(minutesLabel(0), '');
    assert.equal(minutesLabel(undefined), '');
  });

  it('clock writes m:ss', () => {
    assert.equal(clock(0), '0:00');
    assert.equal(clock(81.7), '1:21');
    assert.equal(clock(257.4), '4:17');
  });

  it('chapterAt picks the last chapter that has started', () => {
    const starts = [0, 19.3, 34.7, 52.4];
    assert.equal(chapterAt(starts, 0), 0);
    assert.equal(chapterAt(starts, 19.2), 1); // the quarter-second grace of a seek
    assert.equal(chapterAt(starts, 40), 2);
    assert.equal(chapterAt(starts, 999), 3);
    assert.equal(chapterAt([], 5), -1);
  });

  it('catalogFrom takes an array or an {items} wrapper, and nothing else', () => {
    const a = [item({ id: 'a' })];
    assert.deepEqual(catalogFrom(a), a);
    assert.deepEqual(catalogFrom({ items: a }), a);
    assert.deepEqual(catalogFrom(null), []);
    assert.deepEqual(catalogFrom({ nope: 1 }), []);
  });
});

describe(
  'the registry against the real library',
  { skip: !haveLibrary && 'no marketing/explainers beside this app' },
  () => {
    const library = haveLibrary ? libraryFiles() : new Map<string, LibraryFile>();
    const { bySurface, byTopic } = guideRegistry();
    const all: GuideRef[] = [
      ...Object.values(bySurface).flat(),
      ...byTopic.flatMap((t) => [...t.refs]),
    ];

    it('reads the team videos', () => {
      // `admin_dsr_receipts` and `admin_manual_shift_data` became `admin_hand_entry` (31 Oct 2026).
      for (const id of [
        'admin_credit_dod',
        'admin_credit_dod_portal',
        'admin_hand_entry',
        'admin_onboarding',
      ]) {
        assert.equal(library.get(id)?.audience, 'admin', id);
      }
    });

    it('every video a screen names exists in the library', () => {
      for (const ref of all) {
        if (ref.kind === 'video') assert.ok(library.has(ref.id), `${ref.id} is not in the library`);
      }
    });

    it('every deep link starts at a chapter, so it lands on a scene cut', () => {
      for (const ref of all) {
        if (ref.kind !== 'video' || ref.at === undefined) continue;
        const starts = library.get(ref.id)?.chapters.map((c) => c.startSec) ?? [];
        assert.ok(
          starts.includes(ref.at),
          `${ref.id} has no chapter starting at ${ref.at}s (chapters: ${starts.join(', ')})`,
        );
      }
    });

    it('every team video has an English title and chapter labels for the list', () => {
      for (const lib of library.values()) {
        if (lib.audience !== 'admin') continue;
        assert.ok(lib.title.en.length > 0);
        for (const c of lib.chapters) assert.ok(c.label.en.length > 0, `${lib.id} @${c.startSec}`);
      }
    });
  },
);

describe('nothing points at the retired video website', () => {
  it('no ref or row carries a guide.mdgservices.in address', () => {
    const { bySurface, byTopic } = guideRegistry();
    const refs = [...Object.values(bySurface).flat(), ...byTopic.flatMap((t) => [...t.refs])];
    assert.doesNotMatch(JSON.stringify(refs), /guide\.mdgservices/i);
    for (const row of resolveRows(refs, undefined))
      assert.doesNotMatch(JSON.stringify(row), /guide\.mdgservices/i);
  });

  it('the public explainers live under mdgservices.in/videos/<slug>', () => {
    const { bySurface, byTopic } = guideRegistry();
    const refs = [...Object.values(bySurface).flat(), ...byTopic.flatMap((t) => [...t.refs])];
    const webs = refs.filter((r): r is Extract<GuideRef, { kind: 'web' }> => r.kind === 'web');
    assert.ok(webs.length >= 2);
    for (const w of webs) assert.match(w.href, /^https:\/\/mdgservices\.in\/videos\/[a-z0-9-]+$/);
  });

  it('no source file in the portal still reads the guide-site address or its env setting', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (
          /\.(ts|tsx)$/.test(entry.name) &&
          /guide\.mdgservices|VITE_GUIDE_BASE_URL/.test(readFileSync(p, 'utf8'))
        ) {
          offenders.push(path.relative(adminRoot, p));
        }
      }
    };
    walk(path.join(adminRoot, 'src'));
    assert.deepEqual(offenders, []);
  });
});
