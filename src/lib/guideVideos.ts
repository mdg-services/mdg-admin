/**
 * Which guide videos explain which screen — and how a row finds its video.
 *
 * ── THE VIDEOS PLAY IN THE PORTAL ──────────────────────────────────────────
 *
 * This used to link out to a separate video website. That site is retired. The
 * team's videos are in MDG's own library now (`marketing/explainers/_admin/`),
 * and "How this works" plays them in a dialog from `GET /admin/guide-videos/:id`.
 * A row here names a library video by its ID (`admin_credit_dod`) and, for a
 * deep link, the second it starts at. Its title, one-line summary and length come
 * from the library itself (`GuideVideoAdminItem`), so there is one place to
 * correct them: the video's `library.json`.
 *
 * Two kinds of row are not a library video:
 *   - a PUBLIC EXPLAINER (the three-day deposit clock, stock variation) lives on
 *     mdgservices.in/videos/<slug> now, so its row opens that page in a new tab;
 *   - the LIBRARY row opens the whole list, inside the same dialog.
 *
 * ── WHY A REGISTRY AND NOT A PROP ──────────────────────────────────────────
 *
 * The portal is about a hundred distinct surfaces once you count tabs, drawers,
 * dialogs and sheets. Passing each screen its own video list inline is how the
 * first version worked, and it produced a component that hardcoded two videos
 * and got used exactly twice; everywhere else the help simply never arrived.
 *
 * So a surface declares an IDENTITY — `<HowThisWorks surface="admin-dsr-generate" />`
 * — and this file decides what that identity is worth. Shipping a new video then
 * needs no admin deploy for the video itself: it joins the library and the list
 * below picks it up. Only pointing a SCREEN at it is an edit here.
 *
 * ── EVERY SURFACE RESOLVES TO SOMETHING ────────────────────────────────────
 *
 * The first version of this returned an empty list for a surface with no video
 * and the button rendered nothing at all, so that buttons could be placed across
 * the portal before the videos existed. That was the wrong trade, and the
 * founder found it immediately: "the How this works are not visible on the admin
 * portal". Ninety-odd invisible buttons is indistinguishable from no buttons.
 *
 * Now the lookup always returns at least one row, in three tiers:
 *
 *   1. An EXACT entry in `BY_SURFACE`, where a video really is about that
 *      screen. Most precise, and always listed first.
 *   2. A TOPIC rule, where a video covers the subject even though it was not
 *      recorded on that exact screen — the three-day clock explains what the
 *      bank-holiday calendar is FOR, and knowing that is most of what an admin
 *      editing it needs.
 *   3. The LIBRARY row, which opens the whole list. Honest rather than
 *      apologetic: it does not claim to answer the screen, it offers everything
 *      we have.
 *
 * A row is never a lie about its own relevance — `LIBRARY` says what it is, and
 * a topic match says the subject rather than the screen.
 */
import type { GuideVideoAdminItem } from '@dk/shared';

/** How closely a row answers the screen the button is on. Drives the caption. */
export type GuideFit = 'screen' | 'subject' | 'library';

/** Where the public explainers live now. */
export const PUBLIC_VIDEOS_BASE = 'https://mdgservices.in/videos';

/** What a screen points at. Resolved to a {@link GuideRow} against the library. */
export type GuideRef =
  | {
      kind: 'video';
      /** The library id: `admin_credit_dod`. */
      id: string;
      /** The video's title as a fallback while the library loads, or the name of the PART a deep link opens. */
      title: string;
      /** Start here, in seconds. Must be one of the video's chapter starts. */
      at?: number;
      /** True when `title` names a part, so it wins over the video's own title. */
      titleIsPart?: boolean;
      fit?: GuideFit;
    }
  | {
      kind: 'videos';
      /** Every library video whose id starts with this (the staff-points set). */
      prefix: string;
      fit?: GuideFit;
    }
  | {
      kind: 'web';
      href: string;
      title: string;
      blurb: string;
      minutes: string;
      fit?: GuideFit;
    }
  | { kind: 'library'; fit?: GuideFit };

/** One line of the dialog, ready to draw. */
export interface GuideRow {
  key: string;
  kind: 'video' | 'web' | 'library';
  /** The library id, for a video. */
  id?: string;
  /** The page, for a web row. */
  href?: string;
  title: string;
  blurb: string;
  /** "3 min", or '' when not known. */
  minutes: string;
  /** Start second, for a deep link. */
  at?: number;
  fit: GuideFit;
  /** False for a video the library knows but has not got the file for yet. */
  available: boolean;
  /** Who it is for ("Team", "WhatsApp only"), shown in the full list. */
  tag?: string;
}

const video = (
  id: string,
  title: string,
  extra: { at?: number; titleIsPart?: boolean } = {},
): GuideRef => ({
  kind: 'video',
  id,
  title,
  ...extra,
});

const CREDIT_DOD: readonly GuideRef[] = [
  video('admin_credit_dod', 'What Credit & DOD Monitoring does'),
  video('admin_credit_dod_portal', 'Using it in the admin portal'),
];

// One video covers both kinds of hand entry (31 Oct 2026; it replaced the two older
// walkthroughs). A report screen opens it at the tanker-receipt part.
const DSR: readonly GuideRef[] = [
  video('admin_hand_entry', 'Adding or correcting a tanker receipt', {
    at: 113.29,
    titleIsPart: true,
  }),
  video('admin_hand_entry', 'Typing figures in by hand'),
];

const SHIFT_DATA: readonly GuideRef[] = [video('admin_hand_entry', 'Typing figures in by hand')];

/** Running an onboarding, from a registration to a live outlet (the team's walkthrough). */
const ONBOARDING: readonly GuideRef[] = [video('admin_onboarding', 'Running an onboarding')];

/** The three-day clock is a public explainer: it lives on the website now. */
const DOD_CLOCK: GuideRef = {
  kind: 'web',
  href: `${PUBLIC_VIDEOS_BASE}/dod-clock`,
  title: 'The three-day deposit clock',
  blurb:
    'Why the due date moves: three days from the credit, pushed on by Sundays and the 2nd and 4th Saturdays.',
  minutes: '1 min',
};

/** Same for the stock-variation explainer, which replaced the old stock-sheet walkthrough. */
const STOCK_VARIATION: GuideRef = {
  kind: 'web',
  href: `${PUBLIC_VIDEOS_BASE}/stock-variation`,
  title: 'What a stock variation is made of',
  blurb: 'The difference, the two allowances, and how much is outside the limit.',
  minutes: '1 min',
};

/** The staff-points videos, from the dealer library (`points_*`): what the dealer sees. */
const STAFF: readonly GuideRef[] = [{ kind: 'videos', prefix: 'points_' }];

/** The last resort, and never a lie: it offers the library, not an answer. */
const LIBRARY: GuideRef = { kind: 'library', fit: 'library' };

/** Tier 1: a video that is genuinely about this exact screen. */
const BY_SURFACE: Record<string, readonly GuideRef[]> = {
  'admin-credit-dod-card': CREDIT_DOD,
  'admin-credit-dod-report-card': CREDIT_DOD,
  'admin-credit-dod-failure': CREDIT_DOD,
  'admin-dealer-vault-credit-dod': CREDIT_DOD,
  'admin-shift-editor': SHIFT_DATA,
  'admin-shift-data-editor': SHIFT_DATA,
  // The sheet where the readings are typed: "The sheet arrives laid out" is where
  // the video reaches it. (A chapter start, so the deep link lands on a scene cut.)
  'admin-shift-sheet': [
    video('admin_hand_entry', 'Typing a day into the Shift sheet', {
      at: 39.33,
      titleIsPart: true,
    }),
  ],
  'admin-iras-edit-grid': SHIFT_DATA,
  'admin-dsr-report': DSR,
  'admin-dsr-report-view': DSR,
  'admin-dsr-generate': DSR,
  'admin-dsr-vault': DSR,
  'admin-dealer-vault-dsr': DSR,
  // The calendar an admin edits here is the input to the due-date engine, so the
  // explainer about that clock is the most useful thing we have for it.
  'admin-bank-holidays': [DOD_CLOCK, ...CREDIT_DOD],
  'admin-onboarding': ONBOARDING,
  // The Setup card on a dealer page: the walkthrough from "Ready to start?" on,
  // and the card's own "Do it for the dealer" buttons.
  'admin-dealer-setup': [
    video('admin_onboarding', 'Starting the services and the watch', {
      at: 342.05,
      titleIsPart: true,
    }),
    video('admin_onboarding', 'Doing a step for the dealer', { at: 269.75, titleIsPart: true }),
    ...ONBOARDING,
  ],
};

/**
 * Tier 2: subject matches, tried in order, first hit wins.
 *
 * Substring rules rather than a hundred more rows. They are ordered most
 * specific first, because `admin-dealer-vault-credit-dod` contains both `vault`
 * and `credit`.
 */
const BY_TOPIC: { match: string; refs: readonly GuideRef[] }[] = [
  { match: 'onboarding', refs: ONBOARDING },
  { match: 'registration', refs: ONBOARDING },
  { match: 'credit-dod', refs: CREDIT_DOD },
  { match: 'dsr', refs: DSR },
  { match: 'shift', refs: SHIFT_DATA },
  { match: 'iras', refs: SHIFT_DATA },
  { match: 'ledger', refs: [DOD_CLOCK, ...CREDIT_DOD] },
  { match: 'pad', refs: [DOD_CLOCK, ...CREDIT_DOD] },
  { match: 'holiday', refs: [DOD_CLOCK] },
  { match: 'staff', refs: STAFF },
  { match: 'points', refs: STAFF },
  { match: 'warrior', refs: STAFF },
  { match: 'work-list', refs: STAFF },
  { match: 'custom-work', refs: STAFF },
  { match: 'stock', refs: [STOCK_VARIATION] },
  { match: 'variation', refs: [STOCK_VARIATION] },
  { match: 'vault', refs: [...SHIFT_DATA, ...DSR] },
  { match: 'assurance', refs: DSR },
];

/** The two tiers, for the checks that walk every entry (`scripts/guideVideos.check.ts`). */
export function guideRegistry(): {
  bySurface: Readonly<Record<string, readonly GuideRef[]>>;
  byTopic: readonly { match: string; refs: readonly GuideRef[] }[];
} {
  return { bySurface: BY_SURFACE, byTopic: BY_TOPIC };
}

/**
 * What a surface points at. Never empty.
 *
 * Tier 1, then tier 2, then the library — and the library row is appended to
 * every result, because "there is more where this came from" is true on every
 * screen and costs one line in a dialog somebody opened on purpose.
 */
export function refsForSurface(surface: string): GuideRef[] {
  const exact = BY_SURFACE[surface];
  if (exact?.length) return [...exact.map((r) => withFit(r, 'screen')), LIBRARY];

  // A topic match is about the SUBJECT, whatever the video was recorded for:
  // the Credit & DOD walkthrough is a 'screen' video on the Credit & DOD card
  // and only a subject video on the PAD ledger that matched 'ledger'. The row
  // caption and the dialog's own sentence both read `fit`, so it is restated.
  const topic = BY_TOPIC.find((r) => surface.includes(r.match));
  if (topic) return [...topic.refs.map((r) => withFit(r, 'subject')), LIBRARY];

  return [LIBRARY];
}

function withFit(ref: GuideRef, fit: GuideFit): GuideRef {
  // The public explainers are about a subject by nature: they never claim to
  // show the screen, even on a surface that lists them first.
  if (ref.kind === 'web') return { ...ref, fit: 'subject' };
  return { ...ref, fit };
}

/** The sentence under the dialog's heading, by the best fit in the list. */
export function guideDescription(refs: readonly GuideRef[]): string {
  if (refs.some((r) => r.kind !== 'library' && r.fit === 'screen')) {
    return 'Short walkthroughs for admins, in Hindi, showing this exact screen.';
  }
  if (refs.some((r) => r.kind !== 'library' && r.fit === 'subject')) {
    return 'Short Hindi walkthroughs on this subject — not of this exact screen.';
  }
  return 'No walkthrough for this screen yet. The library has the rest.';
}

/** Whether this surface has a video genuinely about it, rather than a fallback. */
export function hasDedicatedVideo(surface: string): boolean {
  return Boolean(BY_SURFACE[surface]?.length);
}

/** "3 min" — never "0 min": a clip under a minute is "1 min". Empty when the length is unknown. */
export function minutesLabel(durationMs: number | undefined): string {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) return '';
  return `${Math.max(1, Math.round(durationMs / 60_000))} min`;
}

/** `m:ss` for a chapter start or a position in a video. */
export function clock(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The list can arrive as an array or wrapped in `items`; either is accepted. */
export function catalogFrom(raw: unknown): GuideVideoAdminItem[] {
  if (Array.isArray(raw)) return raw as GuideVideoAdminItem[];
  const items = (raw as { items?: unknown } | null | undefined)?.items;
  return Array.isArray(items) ? (items as GuideVideoAdminItem[]) : [];
}

/**
 * Join what a screen points at with what the library knows.
 *
 * `catalog` is undefined while the list is loading (or when it failed): the rows
 * then show the registry's own titles and stay tappable, and a tap says plainly
 * if the video cannot be played. A video the library has been asked about and
 * does NOT list is shown as unavailable rather than dropped, since an admin
 * video that has gone missing from the library is something to see, not hide.
 * A `videos` prefix can only expand once the library is there.
 */
export function resolveRows(
  refs: readonly GuideRef[],
  catalog: readonly GuideVideoAdminItem[] | undefined,
): GuideRow[] {
  const rows: GuideRow[] = [];
  for (const ref of refs) {
    const fit: GuideFit = ref.fit ?? 'subject';
    if (ref.kind === 'library') {
      rows.push({
        key: 'library',
        kind: 'library',
        title: 'All guide videos',
        blurb:
          'A walkthrough for this screen has not been recorded yet. The library has the team walkthroughs and the dealer videos.',
        minutes: '',
        fit: 'library',
        available: true,
      });
    } else if (ref.kind === 'web') {
      rows.push({
        key: `web:${ref.href}`,
        kind: 'web',
        href: ref.href,
        title: ref.title,
        blurb: ref.blurb,
        minutes: ref.minutes,
        fit,
        available: true,
      });
    } else if (ref.kind === 'video') {
      const item = catalog?.find((v) => v.id === ref.id);
      rows.push({
        key: `video:${ref.id}:${ref.at ?? 0}`,
        kind: 'video',
        id: ref.id,
        title: ref.titleIsPart ? ref.title : (item?.title.en ?? ref.title),
        blurb: item?.summary.en ?? '',
        minutes: item ? minutesLabel(item.durationMs) : '',
        ...(ref.at !== undefined ? { at: ref.at } : {}),
        fit,
        available: catalog ? Boolean(item?.available) : true,
      });
    } else {
      for (const item of catalog ?? []) {
        if (!item.id.startsWith(ref.prefix)) continue;
        rows.push(rowFor(item, fit));
      }
    }
  }
  return rows;
}

/** A row for one library entry, as the "all videos" list shows it. */
export function rowFor(item: GuideVideoAdminItem, fit: GuideFit = 'subject'): GuideRow {
  return {
    key: `video:${item.id}:0`,
    kind: 'video',
    id: item.id,
    title: item.title.en,
    blurb: item.summary.en,
    minutes: minutesLabel(item.durationMs),
    fit,
    available: item.available,
  };
}

/**
 * The whole library for the "all videos" view: the team's own videos first, then
 * the dealer ones, each group by title. Nothing is left out — an admin sends the
 * WhatsApp-only video too, and the list is how they find it.
 */
export function libraryRows(catalog: readonly GuideVideoAdminItem[] | undefined): GuideRow[] {
  const items = [...(catalog ?? [])].sort((a, b) => {
    const team = Number(b.audience === 'admin') - Number(a.audience === 'admin');
    return team !== 0 ? team : a.title.en.localeCompare(b.title.en);
  });
  return items.map((item) => ({ ...rowFor(item, 'library'), tag: audienceTag(item) }));
}

/** Who a library video is for, as a short tag in the list. */
export function audienceTag(
  item: Pick<GuideVideoAdminItem, 'audience' | 'outsideAppOnly'>,
): string {
  if (item.outsideAppOnly) return 'WhatsApp only';
  if (item.audience === 'admin') return 'Team';
  if (item.audience === 'owner') return 'For owners';
  if (item.audience === 'manager') return 'For managers';
  return 'For dealers';
}

/**
 * The chapter a position falls in: the last one that starts at or before it.
 * Chapters come in start order; -1 for no chapters.
 */
export function chapterAt(starts: readonly number[], positionSec: number): number {
  let found = -1;
  for (let i = 0; i < starts.length; i += 1) {
    if ((starts[i] ?? 0) <= positionSec + 0.25) found = i;
    else break;
  }
  return found;
}
