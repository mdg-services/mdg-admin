import { GUIDE_VIDEO_IDS, type GuideVideoId } from '@dk/shared';

/**
 * The short guide videos an admin can drop into a chat, in the order the picker
 * lists them, with what each is for in plain words. One per step that repeats
 * for every outlet, so a person sends the video rather than typing the same
 * explanation to each dealer.
 */
/**
 * What each video is for. A `Record` over every id, so a video the server learns
 * about and this list does not is a type error, not a picker that silently
 * leaves it out.
 */
const COPY: Readonly<Record<GuideVideoId, { title: string; when: string }>> = {
  getting_started: {
    title: 'Install the app and sign in',
    when: 'A new owner or manager getting the app on their phone.',
  },
  app_tour: {
    title: 'How the app works',
    when: 'The chat, the reports, asking anything, Settings. For a new owner.',
  },
  portal_login: {
    title: 'Why we need the SDMS and IRAS login',
    when: 'Goes with the login box by itself. Send alone for an owner who is unsure.',
  },
  add_manager: { title: 'Add your manager', when: 'Owners only: Settings > Your team > Invite.' },
  papers: {
    title: 'Sending papers and licences',
    when: 'When MDG asks for a licence or paper: photo or PDF, from the request.',
  },
  density_register: {
    title: 'The density register page, every morning',
    when: 'Outlets on TT Density: yesterday’s page, from the morning request.',
  },
  kavach_photos: {
    title: 'Photos for Kavach tasks',
    when: 'When a Kavach task needs a photo, and what MDG does with it.',
  },
};

/** The order the picker lists them: the first days of an outlet first. */
const ORDER: readonly GuideVideoId[] = [
  'getting_started',
  'app_tour',
  'portal_login',
  'add_manager',
  'papers',
  'density_register',
  'kavach_photos',
];

export const GUIDE_VIDEO_CHOICES: ReadonlyArray<{ id: GuideVideoId; title: string; when: string }> = [
  ...ORDER,
  ...GUIDE_VIDEO_IDS.filter((id) => !ORDER.includes(id)),
].map((id) => ({ id, ...COPY[id] }));

/** The toast after a send, naming the video. */
export function describeVideoSent(id: GuideVideoId): string {
  const title = GUIDE_VIDEO_CHOICES.find((c) => c.id === id)?.title ?? 'the video';
  return `Sent “${title}” to this chat.`;
}
