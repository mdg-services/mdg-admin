import type { GuideVideoAdminItem } from '@dk/shared';

// By path, not from '@dk/shared': the check script (`tsx --test`) resolves the package to
// its built copy, which a checkout may not have (`src/lib/onboarding.ts` says the same).
import { searchVideos, type VideoSearchHit } from '../../shared/src/lib/videoSearch';

/**
 * The Video library page: every video MDG has, in one place — the team's own
 * walkthroughs, the guides a dealer gets in the app, and the public pump-knowledge
 * explainers from mdgservices.in/videos. It replaced the separate guide website.
 *
 * What this decides, kept apart from the screen so it is checkable alone
 * (`scripts/videoLibrary.check.ts`):
 *  - the SHELVES the list is cut into when nothing is typed, and their order;
 *  - the FILTER chips, and what each keeps;
 *  - the words on a card: who it is for, how long, whether it can be sent yet.
 * The search itself is `searchVideos` in `@dk/shared`: both languages, romanised
 * Hindi, every chapter's voice line.
 */

export const LIBRARY_FILTERS = ['all', 'dealer', 'team', 'explainer'] as const;
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];

export const LIBRARY_FILTER_LABELS: Record<LibraryFilter, string> = {
  all: 'All',
  dealer: 'For dealers',
  team: 'For the team',
  explainer: 'Pump know-how',
};

export function isLibraryFilter(v: string | null | undefined): v is LibraryFilter {
  return (LIBRARY_FILTERS as readonly string[]).includes(v ?? '');
}

/** Is this one of MDG's own dealer guides (not a team video, not a public explainer)? */
export function isDealerGuide(v: Pick<GuideVideoAdminItem, 'family' | 'audience'>): boolean {
  return v.family !== 'explainer' && v.audience !== 'admin';
}

/** The videos a filter chip keeps. */
export function filterLibrary<T extends Pick<GuideVideoAdminItem, 'family' | 'audience'>>(
  items: readonly T[],
  filter: LibraryFilter,
): T[] {
  if (filter === 'team') return items.filter((v) => v.audience === 'admin');
  if (filter === 'explainer') return items.filter((v) => v.family === 'explainer');
  if (filter === 'dealer') return items.filter(isDealerGuide);
  return [...items];
}

export interface LibraryShelf {
  key: 'howTo' | 'services' | 'whatsapp' | 'team' | 'explainer';
  title: string;
  blurb: string;
  items: GuideVideoAdminItem[];
}

/**
 * The library as shelves, when nothing is typed: how to use the app first (what
 * the team sends most), then the services, the WhatsApp-only video, the public
 * explainers, and the team's own walkthroughs last. Each shelf by title. An empty
 * shelf is left out.
 */
export function libraryShelves(items: readonly GuideVideoAdminItem[]): LibraryShelf[] {
  const byTitle = (a: GuideVideoAdminItem, b: GuideVideoAdminItem) =>
    a.title.en.localeCompare(b.title.en);
  const dealer = items.filter(isDealerGuide);
  const shelves: LibraryShelf[] = [
    {
      key: 'howTo',
      title: 'Dealer app: how to use it',
      blurb:
        'Hindi guides a dealer gets in the app chat: signing up, the setup, the team, papers, photos.',
      items: dealer.filter((v) => v.service === null && !v.outsideAppOnly).sort(byTitle),
    },
    {
      key: 'services',
      title: 'What each service is',
      blurb: 'One short Hindi video per service: what arrives in the chat and how to read it.',
      items: dealer.filter((v) => v.service !== null && !v.outsideAppOnly).sort(byTitle),
    },
    {
      key: 'whatsapp',
      title: 'WhatsApp only',
      blurb: 'Never sent inside the app: Google Play does not allow anything there about paying.',
      items: dealer.filter((v) => v.outsideAppOnly).sort(byTitle),
    },
    {
      key: 'explainer',
      title: 'Pump know-how',
      blurb:
        'Public explainers from mdgservices.in/videos, in Hindi and English. Good for anyone who runs a pump.',
      items: items.filter((v) => v.family === 'explainer').sort(byTitle),
    },
    {
      key: 'team',
      title: 'For the team',
      blurb: 'Walkthroughs of the admin portal. Never sent to a dealer.',
      items: items.filter((v) => v.audience === 'admin').sort(byTitle),
    },
  ];
  return shelves.filter((s) => s.items.length > 0);
}

/** The library searched, then cut by the filter chip. */
export function searchLibrary(
  items: readonly GuideVideoAdminItem[],
  query: string,
  filter: LibraryFilter,
): VideoSearchHit<GuideVideoAdminItem>[] {
  return searchVideos(filterLibrary(items, filter), query);
}

/** Who a video is for, as a short tag on its card. */
export function libraryTag(
  v: Pick<GuideVideoAdminItem, 'family' | 'audience' | 'outsideAppOnly'>,
): string {
  if (v.family === 'explainer') return 'Public · anyone';
  if (v.audience === 'admin') return 'Team';
  if (v.outsideAppOnly) return 'WhatsApp only';
  if (v.audience === 'owner') return 'Owners';
  if (v.audience === 'manager') return 'Managers';
  return 'Owners and managers';
}

/** A team walkthrough is landscape; a dealer guide and an explainer are phone-shaped. */
export function videoShape(v: Pick<GuideVideoAdminItem, 'audience'>): 'landscape' | 'portrait' {
  return v.audience === 'admin' ? 'landscape' : 'portrait';
}

/**
 * Can it go into a dealer's app chat, in words, or null when it can. A team video
 * and the WhatsApp-only one never can; anything else waits for its copy in the bucket.
 */
export function sendNote(
  v: Pick<GuideVideoAdminItem, 'audience' | 'outsideAppOnly' | 'sendable'>,
): string | null {
  if (v.audience === 'admin') return 'For the team only: never sent to a dealer.';
  if (v.outsideAppOnly) return 'WhatsApp only: never sent inside the app.';
  if (!v.sendable) return 'Not uploaded to the chat library yet, so it cannot be sent into a chat.';
  return null;
}

/** Where a video is limited, in words: "Only for pumps on Daily Sales Report", "Indian Oil pumps only". */
export function limitWords(
  v: Pick<GuideVideoAdminItem, 'onlyFor' | 'companies'>,
  serviceName: (id: string) => string,
): string[] {
  const out: string[] = [];
  if (v.onlyFor?.service) out.push(`Only for pumps on ${serviceName(v.onlyFor.service)}`);
  if (v.onlyFor?.usesPortalLogin) out.push('Only for pumps that give MDG a portal login');
  if (v.companies && v.companies.length > 0) {
    const names = v.companies.map((c) => (c === 'iocl' ? 'Indian Oil' : c.toUpperCase()));
    out.push(`${names.join(' and ')} pumps only`);
  }
  return out;
}
