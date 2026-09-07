/**
 * Which guide videos explain which screen.
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
 * needs no admin deploy: the video lives on the guide site and this holds a slug.
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
 *   3. The LIBRARY row, which opens the guide. Honest rather than apologetic:
 *      it does not claim to answer the screen, it offers everything we have.
 *
 * A row is never a lie about its own relevance — `LIBRARY` says what it is, and
 * a topic match says the subject rather than the screen. As real walkthroughs
 * for each surface are recorded, they land in tier 1 and displace the rest.
 */

/** Where the guide site lives. */
export const GUIDE_BASE: string = (
  (import.meta.env.VITE_GUIDE_BASE_URL as string | undefined) ??
  'https://guide.mdgservices.in'
).replace(/\/$/, '');

export interface GuideVideo {
  /** The guide site's page id. `GUIDE_BASE/<video>` is the watch page, or '' for the library. */
  video: string;
  title: string;
  blurb: string;
  minutes: string;
  /** Jump to a moment — the guide's player reads `#t=<seconds>`. */
  at?: number;
  /** How closely this answers the screen the button is on. Drives the caption. */
  fit?: 'screen' | 'subject' | 'library';
}

const CREDIT_DOD: readonly GuideVideo[] = [
  {
    video: 'admin-credit-dod',
    title: 'What Credit & DOD Monitoring does',
    blurb:
      'How the report is built from the dealer’s SDMS account, what each figure means, and how the due date is worked out.',
    minutes: '3 min',
    fit: 'screen',
  },
  {
    video: 'admin-credit-dod-portal',
    title: 'Using it in the admin portal',
    blurb:
      'Generate a report, read the checks before you trust it, share it with the dealer, and handle a run that fails.',
    minutes: '3 min',
    fit: 'screen',
  },
];

const DSR: readonly GuideVideo[] = [
  {
    video: 'admin-dsr-receipts',
    title: 'Receipts on a Daily Sales Report',
    blurb:
      'Where a delivery on the report comes from, and which day a tanker actually lands on.',
    minutes: '4 min',
    fit: 'screen',
  },
];

const SHIFT_DATA: readonly GuideVideo[] = [
  {
    video: 'admin-manual-shift-data',
    title: 'A day typed in by hand',
    blurb:
      'Open the day from the Data Vault, start it by hand, type the readings, review and apply, then generate.',
    minutes: '4 min',
    fit: 'screen',
  },
];

const DOD_CLOCK: GuideVideo = {
  video: 'gen-dod-clock-hi',
  title: 'The three-day deposit clock',
  blurb:
    'Why the due date moves: three days from the credit, pushed on by Sundays and the 2nd and 4th Saturdays.',
  minutes: '1 min',
  fit: 'subject',
};

const STAFF: readonly GuideVideo[] = [
  {
    video: 'points-system',
    title: 'How points are worked out',
    blurb: 'What decides a work’s points, and how a day’s total is arrived at.',
    minutes: '3 min',
    fit: 'subject',
  },
  {
    video: 'give-points',
    title: 'What the dealer sees',
    blurb: 'The give-points flow on the dealer’s own phone — useful when answering a question about it.',
    minutes: '3 min',
    fit: 'subject',
  },
];

const STOCK: readonly GuideVideo[] = [
  {
    video: 'stock-variation-sheet',
    title: 'Reading a stock variation sheet',
    blurb: 'The difference, the allowance, and how much is outside the limit.',
    minutes: '4 min',
    fit: 'subject',
  },
];

/** The last resort, and never a lie: it offers the library, not an answer. */
const LIBRARY: GuideVideo = {
  video: '',
  title: 'All guide videos',
  blurb:
    'A walkthrough for this screen has not been recorded yet. The library has the dealer course, the team walkthroughs and the explainers.',
  minutes: '',
  fit: 'library',
};

/** Tier 1: a video that is genuinely about this exact screen. */
const BY_SURFACE: Record<string, readonly GuideVideo[]> = {
  'admin-credit-dod-card': CREDIT_DOD,
  'admin-credit-dod-report-card': CREDIT_DOD,
  'admin-credit-dod-failure': CREDIT_DOD,
  'admin-dealer-vault-credit-dod': CREDIT_DOD,
  'admin-shift-editor': SHIFT_DATA,
  'admin-shift-data-editor': SHIFT_DATA,
  'admin-shift-sheet': [
    { ...(SHIFT_DATA[0] as GuideVideo), title: 'Typing a day in by hand', at: 96 },
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
};

/**
 * Tier 2: subject matches, tried in order, first hit wins.
 *
 * Substring rules rather than a hundred more rows. They are ordered most
 * specific first, because `admin-dealer-vault-credit-dod` contains both `vault`
 * and `credit`.
 */
const BY_TOPIC: { match: string; videos: readonly GuideVideo[] }[] = [
  { match: 'credit-dod', videos: CREDIT_DOD },
  { match: 'dsr', videos: DSR },
  { match: 'shift', videos: SHIFT_DATA },
  { match: 'iras', videos: SHIFT_DATA },
  { match: 'ledger', videos: [DOD_CLOCK, ...CREDIT_DOD] },
  { match: 'pad', videos: [DOD_CLOCK, ...CREDIT_DOD] },
  { match: 'holiday', videos: [DOD_CLOCK] },
  { match: 'staff', videos: STAFF },
  { match: 'points', videos: STAFF },
  { match: 'warrior', videos: STAFF },
  { match: 'work-list', videos: STAFF },
  { match: 'custom-work', videos: STAFF },
  { match: 'stock', videos: STOCK },
  { match: 'variation', videos: STOCK },
  { match: 'vault', videos: [...SHIFT_DATA, ...DSR] },
  { match: 'assurance', videos: DSR },
];

/**
 * The videos for a surface. Never empty.
 *
 * Tier 1, then tier 2, then the library — and the library row is appended to
 * every result, because "there is more where this came from" is true on every
 * screen and costs one line in a dialog somebody opened on purpose.
 */
export function videosForSurface(surface: string): GuideVideo[] {
  const exact = BY_SURFACE[surface];
  if (exact?.length) return [...exact, LIBRARY];

  const topic = BY_TOPIC.find((r) => surface.includes(r.match));
  if (topic) return [...topic.videos, LIBRARY];

  return [LIBRARY];
}

/** Whether this surface has a video genuinely about it, rather than a fallback. */
export function hasDedicatedVideo(surface: string): boolean {
  return Boolean(BY_SURFACE[surface]?.length);
}

/** The watch URL for a row — or the library itself, for the fallback. */
export function guideUrl(v: GuideVideo): string {
  if (!v.video) return `${GUIDE_BASE}/`;
  return `${GUIDE_BASE}/${v.video}${v.at ? `#t=${v.at}` : ''}`;
}
