/**
 * Which guide videos explain which screen.
 *
 * ── WHY A REGISTRY AND NOT A PROP ──────────────────────────────────────────
 *
 * The portal is about ninety-five distinct surfaces once you count tabs,
 * drawers, dialogs and sheets — the dealer page alone is a shell over thirteen
 * tab bodies, one of which is a rail over nine more. Passing each screen its own
 * video list inline is how the first version of this worked, and it produced a
 * component that hardcoded two videos and got used exactly twice. Everywhere
 * else, the help simply never arrived.
 *
 * So the surfaces declare an IDENTITY (`<HowThisWorks surface="admin-dsr-generate" />`)
 * and this file decides what that identity is worth. Two consequences, both of
 * which are the point:
 *
 *   1. **A button can be placed before its video exists.** An unknown surface,
 *      or one whose entry is an empty list, renders NOTHING — not a disabled
 *      button, not a "coming soon", nothing at all. So the buttons can go in
 *      everywhere in one pass, and each one appears on its own the day its
 *      video ships. Placement and production stop blocking each other.
 *
 *   2. **Shipping a video needs no admin deploy.** The video lives on the guide
 *      site; this file only holds a slug. Adding a row here is the only admin
 *      change a new video ever needs, and re-recording one is no change at all.
 *
 * ── ONE VIDEO, MANY SURFACES ───────────────────────────────────────────────
 *
 * The mapping is deliberately many-to-one. "Generate a DSR", "Generate for a
 * date" and the stale-report banner are three controls a person meets in three
 * places, and they are one thing to understand — so all three point at the same
 * video rather than justifying three thin ones. Roughly a hundred surfaces
 * resolve to a few dozen videos.
 *
 * ── THE SLUG IS A URL ──────────────────────────────────────────────────────
 *
 * `video` is the guide site's own page id: `https://guide.mdgservices.in/<video>`.
 * Nothing validates that at build time, because the two deploy separately and a
 * portal that refused to build because a video was not published yet would be
 * the tail wagging the dog. What protects it instead is that the slugs are
 * generated from the guide's own catalogue — see `npm run guide:catalog` in
 * mdg-demo — so a typo shows up as a missing row rather than a dead link.
 */

/** Where the guide site lives. */
export const GUIDE_BASE: string = (
  (import.meta.env.VITE_GUIDE_BASE_URL as string | undefined) ??
  'https://guide.mdgservices.in'
).replace(/\/$/, '');

export interface GuideVideo {
  /** The guide site's page id. `GUIDE_BASE/<video>` is the watch page. */
  video: string;
  /** Shown as the row's title in the chooser. English — this is the ops team. */
  title: string;
  /** One line on what it covers, so nobody watches four minutes to find out. */
  blurb: string;
  /** Runtime, rounded. Written out rather than measured: the portal does not
   *  fetch the guide's manifest, and a minute either way costs nothing. */
  minutes: string;
  /**
   * Jump straight to a moment, in seconds. The guide's player reads `#t=<n>`.
   * Use it where one surface is a two-minute passage of a longer video rather
   * than its subject — otherwise the viewer pays for the whole thing to reach
   * the part that answers their question.
   */
  at?: number;
}

/**
 * Surface id → the videos that explain it.
 *
 * Ids are kebab-case and stable; they are the contract between a screen and
 * this file, so renaming one means editing both. They match the slugs used by
 * the guide catalogue so a single name identifies a subject everywhere.
 *
 * An entry may be an empty array. That is not the same as a missing entry in
 * intent — a missing one means nobody has thought about this screen, an empty
 * one means somebody decided it needs a video and it is not made yet — but it
 * is the same to the component, which renders nothing either way.
 */
export const GUIDE_VIDEOS: Record<string, GuideVideo[]> = {
  /* ── Credit & DOD ─────────────────────────────────────────────────────── */
  'admin-credit-dod-card': [
    {
      video: 'admin-credit-dod',
      title: 'What Credit & DOD Monitoring does',
      blurb:
        'How the report is built from the dealer’s SDMS account, what each figure means, and how the due date is worked out.',
      minutes: '3 min',
    },
    {
      video: 'admin-credit-dod-portal',
      title: 'Using it in the admin portal',
      blurb:
        'Generate a report, read the checks before you trust it, share it with the dealer, and handle a run that fails.',
      minutes: '3 min',
    },
  ],

  /* ── Shift data ───────────────────────────────────────────────────────── */
  'admin-shift-editor': [
    {
      video: 'admin-manual-shift-data',
      title: 'A DSR for an outlet with no portal',
      blurb:
        'Open the day from the Data Vault, start it by hand, type the readings, review and apply, then generate.',
      minutes: '4 min',
    },
  ],
  'admin-shift-sheet': [
    {
      video: 'admin-manual-shift-data',
      title: 'Typing a day in by hand',
      blurb: 'The shift sheet laid out from the dealer’s own DSR layout.',
      minutes: '4 min',
      at: 96,
    },
  ],

  /* ── DSR ──────────────────────────────────────────────────────────────── */
  'admin-dsr-report': [
    {
      video: 'admin-dsr-receipts',
      title: 'Receipts on a Daily Sales Report',
      blurb:
        'Where a delivery on the report comes from, and which day a tanker actually lands on.',
      minutes: '4 min',
    },
  ],
  'admin-dsr-generate': [
    {
      video: 'admin-dsr-receipts',
      title: 'Generating and re-generating a report',
      blurb: 'What “Generate” does with no date, and what back-filling a date really creates.',
      minutes: '4 min',
    },
  ],
};

/**
 * The videos for a surface, or an empty list.
 *
 * Total by design. An unknown surface is not an error worth showing anybody:
 * the honest response to "I have no video for this screen" is to say nothing,
 * which is exactly what an empty list makes the component do.
 */
export function videosForSurface(surface: string): GuideVideo[] {
  return GUIDE_VIDEOS[surface] ?? [];
}

/** The watch URL for a video, with its optional deep link into a moment. */
export function guideUrl(v: GuideVideo): string {
  return `${GUIDE_BASE}/${v.video}${v.at ? `#t=${v.at}` : ''}`;
}
