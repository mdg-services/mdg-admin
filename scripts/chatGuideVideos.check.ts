/**
 * Checks for "Send a video" (`src/lib/chatGuideVideos.ts`): what the picker offers
 * out of MDG's video library, in what order, and from which chapter.
 *
 * This app has no test runner, so these are plain `node:test` checks over the pure
 * module, run through the `tsx` the repo root already carries:
 *
 *   cd mdg-admin && npm run check:chat-videos
 *
 * which is `npx tsx --test scripts/chatGuideVideos.check.ts`. They sit outside
 * `src/` on purpose: the build type-checks `src/`, and a test import there would
 * break a standalone build that has no test types.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GuideVideoAdminItem } from '../shared/src/types/videoLibrary';
import {
  allChoices,
  audienceWord,
  canSendNow,
  chapterChoices,
  clockLabel,
  defaultVideo,
  describeVideoSent,
  isSendable,
  lengthLabel,
  metaLine,
  searchChoices,
  sendFailureMessage,
  startToSend,
  videoChoices,
} from '../src/lib/chatGuideVideos';

function video(id: string, over: Partial<GuideVideoAdminItem> = {}): GuideVideoAdminItem {
  return {
    id,
    title: { hi: `${id} हिंदी`, en: `Title of ${id}` },
    summary: { hi: 'सार', en: `What ${id} teaches` },
    durationMs: 95_000,
    service: null,
    available: true,
    audience: 'both',
    outsideAppOnly: false,
    chapters: [
      { startSec: 0, label: { hi: 'शुरू', en: 'Start' } },
      { startSec: 14.2, label: { hi: 'आगे', en: 'Next part' } },
      { startSec: 70, label: { hi: 'आख़िर', en: 'Last part' } },
    ],
    ...over,
  };
}

const LIBRARY: GuideVideoAdminItem[] = [
  video('svc_tt_density', { service: 'tt-density' }),
  video('kavach_photos'),
  video('paying_bill', { outsideAppOnly: true }),
  video('admin_credit_dod', { audience: 'admin' }),
  video('papers'),
  video('svc_dsr', { service: 'dsr-report' }),
  video('app_tour'),
  video('density_register'),
  video('getting_started'),
  video('portal_login', { audience: 'owner' }),
  video('add_manager', { audience: 'owner', available: false }),
];

describe('what can be sent into a dealer chat', () => {
  it('leaves out the WhatsApp-only video and the team’s own walkthroughs', () => {
    assert.equal(isSendable(video('paying_bill', { outsideAppOnly: true })), false);
    assert.equal(isSendable(video('admin_x', { audience: 'admin' })), false);
    assert.equal(isSendable(video('papers')), true);
    const ids = [...videoChoices(LIBRARY).howTo, ...videoChoices(LIBRARY).services].map((v) => v.id);
    assert.ok(!ids.includes('paying_bill'));
    assert.ok(!ids.includes('admin_credit_dod'));
  });

  it('puts the first days first, then the other how-tos by name, and the services in their own group', () => {
    const { howTo, services } = videoChoices(LIBRARY);
    assert.deepEqual(
      howTo.map((v) => v.id),
      ['getting_started', 'app_tour', 'portal_login', 'add_manager', 'papers', 'density_register', 'kavach_photos'],
    );
    assert.deepEqual(
      services.map((v) => v.id),
      ['svc_dsr', 'svc_tt_density'],
    );
  });

  it('never loses a video it does not know: a new id sorts after the first days, not out of the list', () => {
    const { howTo } = videoChoices([video('a_brand_new_howto'), video('app_tour')]);
    assert.deepEqual(
      howTo.map((v) => v.id),
      ['app_tour', 'a_brand_new_howto'],
    );
  });

  it('is empty, not an error, before the library has loaded', () => {
    assert.deepEqual(videoChoices(undefined), { howTo: [], services: [], explainers: [] });
    assert.equal(defaultVideo(videoChoices(undefined)), null);
  });

  it('starts on the first video that can be sent now, never on one that is not uploaded', () => {
    const lib = [video('getting_started', { available: false }), video('app_tour')];
    assert.equal(defaultVideo(videoChoices(lib))?.id, 'app_tour');
    assert.equal(defaultVideo(videoChoices([video('x', { available: false })])), null);
  });
});

describe('what can be sent from the WhatsApp inbox', () => {
  it('offers the WhatsApp-only video there, and still never a team walkthrough', () => {
    assert.equal(isSendable(video('paying_bill', { outsideAppOnly: true }), 'whatsapp'), true);
    assert.equal(isSendable(video('admin_x', { audience: 'admin' }), 'whatsapp'), false);
    const ids = allChoices(videoChoices(LIBRARY, 'whatsapp')).map((v) => v.id);
    assert.ok(ids.includes('paying_bill'));
    assert.ok(!ids.includes('admin_credit_dod'));
  });

  it('can send now only what the server says can go on WhatsApp; a server that does not say has no WhatsApp send', () => {
    assert.equal(canSendNow(video('a', { whatsappSendable: true }), 'whatsapp'), true);
    assert.equal(canSendNow(video('b', { whatsappSendable: false, sendable: true }), 'whatsapp'), false);
    assert.equal(canSendNow(video('c', { sendable: true }), 'whatsapp'), false);
    // The app chat goes on reading its own flag.
    assert.equal(canSendNow(video('d', { whatsappSendable: true, sendable: false })), false);
  });

  it('starts on the first video WhatsApp can take now', () => {
    const lib = [
      video('getting_started', { whatsappSendable: false }),
      video('app_tour', { whatsappSendable: true }),
    ];
    assert.equal(defaultVideo(videoChoices(lib, 'whatsapp'), 'whatsapp')?.id, 'app_tour');
  });

  it('says it went on WhatsApp, and which chapter its words name', () => {
    const v = video('papers');
    assert.equal(describeVideoSent(v, undefined, 'whatsapp'), 'Sent “Title of papers” on WhatsApp.');
    assert.equal(
      describeVideoSent(v, 14.2, 'whatsapp'),
      'Sent “Title of papers” on WhatsApp, with “Next part” named under it.',
    );
  });
});

describe('the words under a video', () => {
  it('says the length, who it is for, and that it is not uploaded — only when true', () => {
    assert.equal(metaLine(video('papers')), '1:35 · Owners and managers');
    assert.equal(metaLine(video('add_manager', { audience: 'owner', available: false })), '1:35 · Owners · Not uploaded yet');
    assert.equal(metaLine(video('x', { durationMs: 0, audience: 'manager' })), 'Managers');
    assert.equal(audienceWord(video('x')), 'Owners and managers');
  });

  it('writes m:ss', () => {
    assert.equal(clockLabel(0), '0:00');
    assert.equal(clockLabel(14.2), '0:14');
    assert.equal(clockLabel(70), '1:10');
    assert.equal(clockLabel(-5), '0:00');
    assert.equal(lengthLabel(49_800), '0:49');
    assert.equal(lengthLabel(undefined), '');
    assert.equal(lengthLabel(Number.NaN), '');
  });
});

describe('starting at a chapter', () => {
  const v = video('papers');

  it('offers "from the start" and each later chapter with where it begins', () => {
    assert.deepEqual(chapterChoices(v), [
      { startSec: 0, label: 'From the start' },
      { startSec: 14.2, label: '0:14  Next part' },
      { startSec: 70, label: '1:10  Last part' },
    ]);
  });

  it('offers nothing for a video with one chapter', () => {
    assert.deepEqual(chapterChoices(video('x', { chapters: [{ startSec: 0, label: { hi: 'क', en: 'Only' } }] })), []);
  });

  it('sends a start only when it is a chapter of this video, and never the start itself', () => {
    assert.equal(startToSend(v, 14.2), 14.2);
    assert.equal(startToSend(v, 70), 70);
    assert.equal(startToSend(v, 0), undefined);
    assert.equal(startToSend(v, 15), undefined);
    assert.equal(startToSend(v, null), undefined);
    assert.equal(startToSend(v, undefined), undefined);
  });

  it('says in the toast where it started', () => {
    assert.equal(describeVideoSent(v), 'Sent “Title of papers” to this chat.');
    assert.equal(describeVideoSent(v, 14.2), 'Sent “Title of papers” to this chat, from “Next part”.');
    assert.equal(describeVideoSent(v, 15), 'Sent “Title of papers” to this chat.');
  });
});

describe('when a send fails', () => {
  it('says what happened in the admin’s own words', () => {
    assert.equal(sendFailureMessage('VIDEO_NOT_UPLOADED', 'x'), 'That video is not uploaded yet.');
    assert.equal(sendFailureMessage('VIDEO_NOT_FOR_APP', 'x'), 'That video goes on WhatsApp only, not inside the app.');
    assert.equal(sendFailureMessage('SOMETHING', 'The chat is closed'), 'The chat is closed');
    assert.equal(sendFailureMessage(undefined, undefined), 'Could not send the video');
  });
});

describe('the public explainers, search, and what can be sent now', () => {
  const explainer = (id: string, over: Partial<GuideVideoAdminItem> = {}) =>
    video(id, { family: 'explainer', ...over });

  it('puts the public explainers on a shelf of their own, after the guides, by title', () => {
    const lib = [
      explainer('pk_water_dip', { title: { hi: 'पानी', en: 'The water dip' } }),
      explainer('pk_dod_clock', { title: { hi: 'घड़ी', en: 'The three-day clock' } }),
      video('papers'),
      video('svc_dsr', { service: 'dsr-report' }),
    ];
    const c = videoChoices(lib);
    assert.deepEqual(
      c.howTo.map((v) => v.id),
      ['papers'],
    );
    assert.deepEqual(
      c.services.map((v) => v.id),
      ['svc_dsr'],
    );
    assert.deepEqual(
      c.explainers.map((v) => v.id),
      ['pk_dod_clock', 'pk_water_dip'],
    );
    assert.deepEqual(
      allChoices(c).map((v) => v.id),
      ['papers', 'svc_dsr', 'pk_dod_clock', 'pk_water_dip'],
    );
    assert.equal(audienceWord(c.explainers[0]!), 'Public explainer');
  });

  it('can send what the server says it can: an explainer that plays but is not in the bucket cannot be picked', () => {
    assert.equal(
      canSendNow(explainer('pk_water_dip', { available: true, sendable: false })),
      false,
    );
    assert.equal(canSendNow(video('papers', { available: true, sendable: true })), true);
    // An older server says nothing about `sendable`: `available` decides, as before.
    assert.equal(canSendNow(video('papers', { available: false })), false);
    const c = videoChoices([
      explainer('pk_water_dip', { sendable: false }),
      video('papers', { sendable: true }),
    ]);
    assert.equal(defaultVideo(c)?.id, 'papers');
    assert.match(metaLine(explainer('pk_x', { sendable: false })), /Not uploaded yet/);
  });

  it('searches every shelf at once, and names the chapter the words are in', () => {
    const c = videoChoices([
      video('papers', { title: { hi: 'कागज़', en: 'Your papers' }, aliases: ['licence', 'NOC'] }),
      explainer('pk_water_dip', {
        title: { hi: 'पानी का डिप', en: 'The water dip' },
        chapters: [
          { startSec: 0, label: { hi: 'शुरू', en: 'Start' }, text: 'शुरू' },
          { startSec: 9.5, label: { hi: 'पेस्ट', en: 'The paste' }, text: 'पेस्ट' },
        ],
      }),
    ]);
    assert.deepEqual(
      searchChoices(c, 'licence').map((h) => h.item.id),
      ['papers'],
    );
    const [hit] = searchChoices(c, 'paste');
    assert.equal(hit?.item.id, 'pk_water_dip');
    assert.equal(hit?.chapter?.startSec, 9.5);
    assert.equal(searchChoices(c, '').length, 2);
  });
});
