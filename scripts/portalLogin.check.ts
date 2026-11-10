/**
 * Checks for the "Ask for portal login" box's rules (`src/lib/portalLogin.ts`): which
 * logins an outlet is offered, whether the explainer video goes, and the words.
 *
 *   cd mdg-admin && npm run check:portal-login
 *
 * which is `npx tsx --test scripts/portalLogin.check.ts`. The shared tables are
 * imported from source by relative path, as `onboarding.check.ts` does, because
 * `@dk/shared` resolves to its compiled `dist/` outside Vite.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { askPortalLoginSchema } from '../shared/src/schemas/portalLogin';
import { OIL_COMPANIES } from '../shared/src/types/oilCompany';
import {
  PORTAL_IDS,
  PORTAL_NAMES,
  type PortalId,
  type PortalLoginState,
} from '../shared/src/types/portalLogin';
import {
  defaultTicked,
  describeAskResult,
  describeLoginStatus,
  loginNeedsAttention,
  loginsOfCompany,
  offersExplainerVideo,
  onDemandLogins,
  portalLoginAskedLabel,
  portalNames,
} from '../src/lib/portalLogin';

const state = (portal: PortalId, over: Partial<PortalLoginState> = {}): PortalLoginState => ({
  portal,
  needed: true,
  status: 'missing',
  ...over,
});

/** What the server sends for an outlet: every portal it has a row for, in its own order. */
const everything = (): PortalLoginState[] => PORTAL_IDS.map((p) => state(p));
const ids = (list: readonly PortalLoginState[]) => list.map((s) => s.portal);

describe('which logins an outlet is offered', () => {
  it('offers an Indian Oil outlet SDMS then IRAS, and nothing of BPCL or HPCL', () => {
    assert.deepEqual(ids(loginsOfCompany(everything(), 'iocl')), ['sdms', 'iras']);
  });

  it('offers a BPCL outlet its one portal, and an HPCL outlet its own', () => {
    assert.deepEqual(ids(loginsOfCompany(everything(), 'bpcl')), ['bpcl']);
    assert.deepEqual(ids(loginsOfCompany(everything(), 'hpcl')), ['hpcl']);
  });

  it('treats no company on record as Indian Oil, as every outlet before the step was', () => {
    assert.deepEqual(ids(loginsOfCompany(everything(), null)), ['sdms', 'iras']);
    assert.deepEqual(ids(loginsOfCompany(everything(), undefined)), ['sdms', 'iras']);
  });

  it('keeps the order the dealer is asked in, whatever order the server listed them', () => {
    const shuffled = [state('iras'), state('bpcl'), state('sdms'), state('hpcl')];
    assert.deepEqual(ids(loginsOfCompany(shuffled, 'iocl')), ['sdms', 'iras']);
  });

  it('keeps the state it was given, and invents no row the server did not send', () => {
    const saved = state('bpcl', { status: 'saved', savedBy: 'mdg', savedAt: '2026-10-27T05:00:00.000Z' });
    assert.deepEqual(loginsOfCompany([state('sdms'), state('iras'), saved], 'bpcl'), [saved]);
    assert.deepEqual(loginsOfCompany([state('sdms'), state('iras')], 'bpcl'), []);
    assert.deepEqual(loginsOfCompany([], 'iocl'), []);
  });

  it('hides a company portal login an Indian Oil outlet happens to have saved', () => {
    const list = [state('sdms'), state('iras'), state('bpcl', { status: 'saved' })];
    assert.deepEqual(ids(loginsOfCompany(list, 'iocl')), ['sdms', 'iras']);
  });

  it('offers every company at least one portal when the server sent them all', () => {
    for (const c of OIL_COMPANIES) assert.ok(loginsOfCompany(everything(), c).length > 0, c);
  });

  it('pre-ticks only the offered logins that are needed and not saved', () => {
    const list = [
      state('sdms', { status: 'saved' }),
      state('iras'),
      state('bpcl'),
      state('hpcl', { needed: false }),
    ];
    assert.deepEqual(defaultTicked(loginsOfCompany(list, 'iocl')), ['iras']);
    assert.deepEqual(defaultTicked(loginsOfCompany(list, 'bpcl')), ['bpcl']);
    assert.deepEqual(defaultTicked(loginsOfCompany(list, 'hpcl')), []);
  });
});

describe('the old SDMS, asked only on demand (beside IOC XtraPower)', () => {
  const blank = (): PortalLoginState => ({ portal: 'sdmsOld', needed: false, status: 'missing' });
  const oldOf = (rows: PortalLoginState[]) => rows.find((s) => s.portal === 'sdmsOld');

  it('is offered an Indian Oil outlet after XtraPower, as a blank row when the server sent none', () => {
    assert.deepEqual(ids(onDemandLogins([state('sdms'), state('iras')], 'iocl')), ['xtrapower', 'sdmsOld']);
    assert.deepEqual(oldOf(onDemandLogins([], 'iocl')), blank());
    assert.deepEqual(oldOf(onDemandLogins([], null)), blank());
    assert.deepEqual(oldOf(onDemandLogins([], undefined)), blank());
  });

  it('gives the server’s row as it came once the outlet has been asked or has saved one', () => {
    const asked = state('sdmsOld');
    const saved = state('sdmsOld', { status: 'saved', savedBy: 'mdg', savedAt: '2026-11-09T05:00:00.000Z' });
    assert.deepEqual(oldOf(onDemandLogins([state('sdms'), asked], 'iocl')), asked);
    assert.deepEqual(oldOf(onDemandLogins([saved, state('iras')], 'iocl')), saved);
  });

  it('is never offered a BPCL or HPCL outlet, even when the server sent a row', () => {
    assert.deepEqual(onDemandLogins(everything(), 'bpcl'), []);
    assert.deepEqual(onDemandLogins(everything(), 'hpcl'), []);
  });

  it('is left out of the outlet’s own logins, so the dialog adds it after them', () => {
    for (const c of ['iocl', 'bpcl', 'hpcl', null, undefined] as const) {
      assert.ok(!ids(loginsOfCompany(everything(), c)).includes('sdmsOld'), String(c));
    }
    const offered = [...loginsOfCompany(everything(), 'iocl'), ...onDemandLogins(everything(), 'iocl')];
    assert.deepEqual(ids(offered), ['sdms', 'iras', 'xtrapower', 'sdmsOld']);
  });

  it('is unticked until asked once, then ticked again while it is missing — as XtraPower is', () => {
    assert.deepEqual(defaultTicked([blank()]), []);
    assert.deepEqual(defaultTicked([state('sdmsOld')]), ['sdmsOld']);
    assert.deepEqual(defaultTicked([state('sdmsOld', { status: 'saved' })]), []);
  });

  it('does not bring the explainer video on its own, and does not take it away from SDMS or IRAS', () => {
    assert.equal(offersExplainerVideo(['sdmsOld']), false);
    assert.equal(offersExplainerVideo(['sdms', 'sdmsOld']), true);
    assert.equal(offersExplainerVideo(['iras', 'sdmsOld']), true);
  });

  it('is a shape the shared schema accepts for an ask, with the video off', () => {
    assert.ok(askPortalLoginSchema.safeParse({ portals: ['sdmsOld'], withVideo: false }).success);
  });

  it('is named in plain words', () => {
    assert.equal(PORTAL_NAMES.sdmsOld, 'Old SDMS');
    assert.equal(portalNames(['sdms', 'sdmsOld']), 'SDMS and Old SDMS');
    assert.equal(portalLoginAskedLabel(['sdmsOld']), 'Old SDMS login');
    assert.equal(
      describeAskResult({ posted: 1, portals: ['sdmsOld'], video: false }),
      'Asked the owner for the Old SDMS login in their chat.',
    );
  });

  it('reads its status as never asked, asked, then saved — in XtraPower’s words', () => {
    assert.equal(describeLoginStatus(blank()), 'Asked only when needed. Not asked yet');
    assert.equal(describeLoginStatus(state('sdmsOld')), 'Asked, not filled in yet');
    assert.match(
      describeLoginStatus(state('sdmsOld', { status: 'saved', savedBy: 'dealer', savedAt: '2026-11-09T05:00:00.000Z' })),
      /^Saved by the owner in the app on /,
    );
  });

  it('counts as needing attention only once asked and not saved', () => {
    assert.equal(loginNeedsAttention(blank()), false);
    assert.equal(loginNeedsAttention(state('sdmsOld')), true);
    assert.equal(loginNeedsAttention(state('sdmsOld', { status: 'saved' })), false);
  });
});

describe('the explainer video', () => {
  it('goes with an SDMS or IRAS ask, and never with a company portal alone', () => {
    assert.equal(offersExplainerVideo(['sdms', 'iras']), true);
    assert.equal(offersExplainerVideo(['sdms']), true);
    assert.equal(offersExplainerVideo(['iras']), true);
    assert.equal(offersExplainerVideo(['bpcl']), false);
    // IOC XtraPower and IndianOil Partners are not what the video explains.
    assert.equal(offersExplainerVideo(['xtrapower']), false);
    assert.equal(offersExplainerVideo(['partners']), false);
    assert.equal(offersExplainerVideo(['sdms', 'xtrapower']), true);
    assert.equal(offersExplainerVideo(['hpcl']), false);
    assert.equal(offersExplainerVideo([]), false);
  });

  it('is a shape the shared schema accepts for a BPCL or HPCL ask, with the video off', () => {
    const body = { portals: ['bpcl' as const], withVideo: false };
    assert.ok(askPortalLoginSchema.safeParse(body).success);
    assert.ok(askPortalLoginSchema.safeParse({ portals: ['hpcl'], withVideo: false }).success);
  });
});

describe('the words', () => {
  it('names a company portal by its company only, never by SDMS, IRAS or a use', () => {
    assert.equal(portalNames(['bpcl']), 'BPCL portal');
    assert.equal(portalNames(['hpcl']), 'HPCL portal');
    assert.equal(portalNames(['sdms', 'iras']), 'SDMS and IRAS');
    assert.equal(portalLoginAskedLabel(['bpcl']), 'BPCL portal login');
    assert.equal(portalLoginAskedLabel(['sdms', 'iras']), 'SDMS login, IRAS login');
    for (const p of ['bpcl', 'hpcl'] as const) assert.doesNotMatch(PORTAL_NAMES[p], /SDMS|IRAS/);
  });

  it('says what an ask of a BPCL login did', () => {
    assert.equal(
      describeAskResult({ posted: 1, portals: ['bpcl'], video: false }),
      'Asked the owner for the BPCL portal login in their chat.',
    );
    assert.equal(
      describeAskResult({ posted: 2, portals: ['sdms', 'iras'], video: true }),
      'Asked 2 owners for the SDMS and IRAS login in their chat, with the explainer video.',
    );
  });

  it('reads a login’s status the same for a company portal', () => {
    const saved = state('bpcl', { status: 'saved', savedBy: 'dealer', needed: true });
    assert.match(describeLoginStatus(saved), /^Saved by the owner in the app/);
    assert.equal(describeLoginStatus(state('bpcl')), 'Needed');
    assert.equal(describeLoginStatus(state('hpcl', { needed: false })), 'Not needed for this outlet');
    assert.equal(loginNeedsAttention(saved), false);
    assert.equal(loginNeedsAttention(state('bpcl')), true);
  });
});

describe('onDemandLogins — IOC XtraPower, asked only when the team decides', () => {
  it('offers XtraPower to an Indian Oil outlet, as not asked yet before the first ask', () => {
    const [xp] = onDemandLogins([state('sdms'), state('iras')], 'iocl');
    assert.equal(xp?.portal, 'xtrapower');
    assert.equal(xp?.needed, false);
    assert.equal(describeLoginStatus(xp!), 'Asked only when needed. Not asked yet');
    assert.deepEqual(defaultTicked([xp!]), []);
    assert.equal(onDemandLogins([], null)[0]?.portal, 'xtrapower');
  });
  it('uses the server row once asked, ticked again while it is missing', () => {
    const asked: PortalLoginState = { portal: 'xtrapower', needed: true, status: 'missing' };
    assert.deepEqual(onDemandLogins([state('sdms'), asked], 'iocl')[0], asked);
    assert.deepEqual(defaultTicked([asked]), ['xtrapower']);
  });
  it('offers nothing to a BPCL or HPCL outlet', () => {
    assert.deepEqual(onDemandLogins([], 'bpcl'), []);
    assert.deepEqual(onDemandLogins([], 'hpcl'), []);
  });
});
