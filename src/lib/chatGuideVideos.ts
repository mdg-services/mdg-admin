import type { GuideVideoAdminItem } from '@dk/shared';

// By path, not from '@dk/shared': the check script (`tsx --test`) resolves the package to
// its built copy, which a checkout may not have (`src/lib/onboarding.ts` says the same).
import { searchVideos, type VideoSearchHit } from '../../shared/src/lib/videoSearch';

/**
 * "Send a video": which of MDG's guide videos an admin can drop into a dealer's
 * chat, in what order, and from which chapter.
 *
 * The list is the video library itself (`GET /admin/guide-videos`), not a list
 * kept here — adding a video is a folder and an upload, never an edit in this
 * file. What this decides, kept apart from the screen so it is checkable alone
 * (`scripts/chatGuideVideos.check.ts`):
 *
 *  - WHAT CAN BE SENT. The library holds more than the chat may carry: the team's
 *    own walkthroughs play only in the portal, and the "paying your bill" video
 *    goes on WhatsApp and nowhere else (Google Play forbids anything inside the
 *    app that points at a way to pay). Both are left out of the picker. The server
 *    refuses them too; this keeps the picker honest, so an admin is never offered
 *    a send that cannot happen.
 *  - WHAT CAN BE SENT NOW. A video that is not uploaded yet is shown, greyed and
 *    marked, and cannot be picked: seeing that it exists is useful, sending a
 *    broken player is not. The server says which (`sendable`).
 *  - FROM WHERE. A chapter is offered only for a start the library knows.
 *  - WHICH SHELF. The app's how-tos, then one video per service, then the public
 *    pump-knowledge explainers. A search flattens the shelves into one ranked list
 *    (`searchVideos`: both languages, romanised Hindi, chapters).
 */

/** A video that may go into a dealer's chat at all. */
export function isSendable(v: Pick<GuideVideoAdminItem, 'outsideAppOnly' | 'audience'>): boolean {
  return !v.outsideAppOnly && v.audience !== 'admin';
}

/**
 * Can it be sent right now: its copy is in the bucket. An older server that does
 * not say (`sendable` missing) is read by `available`, as before.
 */
export function canSendNow(v: Pick<GuideVideoAdminItem, 'sendable' | 'available'>): boolean {
  return typeof v.sendable === 'boolean' ? v.sendable : v.available;
}

/**
 * The first days of an outlet come first, in the order a new owner meets them;
 * every other how-to follows by name, then the service videos by name. An id this
 * list does not know sorts after the ones it does, so a new video is never lost.
 */
const FIRST_DAYS: readonly string[] = ['getting_started', 'app_tour', 'portal_login', 'add_manager', 'papers'];

function rank(v: GuideVideoAdminItem): number {
  const i = FIRST_DAYS.indexOf(v.id);
  if (i >= 0) return i;
  return v.service === null ? FIRST_DAYS.length : FIRST_DAYS.length + 1;
}

export interface VideoChoices {
  /** How to use the app and what MDG asks for: the first days, then the rest. */
  howTo: GuideVideoAdminItem[];
  /** One per service: what the service is. */
  services: GuideVideoAdminItem[];
  /** The public pump-knowledge explainers, by title. */
  explainers: GuideVideoAdminItem[];
}

/** The library as the picker lists it: sendable videos only, ordered, split into the three groups. */
export function videoChoices(library: readonly GuideVideoAdminItem[] | undefined): VideoChoices {
  const list = (library ?? [])
    .filter(isSendable)
    .slice()
    .sort((a, b) => rank(a) - rank(b) || a.title.en.localeCompare(b.title.en));
  const guides = list.filter((v) => v.family !== 'explainer');
  return {
    howTo: guides.filter((v) => v.service === null),
    services: guides.filter((v) => v.service !== null),
    explainers: list
      .filter((v) => v.family === 'explainer')
      .sort((a, b) => a.title.en.localeCompare(b.title.en)),
  };
}

/** Every choice, in shelf order. */
export function allChoices(choices: VideoChoices): GuideVideoAdminItem[] {
  return [...choices.howTo, ...choices.services, ...choices.explainers];
}

/** The choices that answer a search, best first, with the chapter the words were found in. */
export function searchChoices(
  choices: VideoChoices,
  query: string,
): VideoSearchHit<GuideVideoAdminItem>[] {
  return searchVideos(allChoices(choices), query);
}

/** The video the picker starts on: the first one that can be sent now. */
export function defaultVideo(choices: VideoChoices): GuideVideoAdminItem | null {
  return allChoices(choices).find(canSendNow) ?? null;
}

/** `m:ss`, for a length or a chapter's start. */
export function clockLabel(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "1:35", or nothing when the length is not known. */
export function lengthLabel(durationMs: number | undefined): string {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) return '';
  return clockLabel(durationMs / 1000);
}

/** Who a video is for, in a word. */
export function audienceWord(
  v: Pick<GuideVideoAdminItem, 'audience'> & Partial<Pick<GuideVideoAdminItem, 'family'>>,
): string {
  if (v.family === 'explainer') return 'Public explainer';
  if (v.audience === 'owner') return 'Owners';
  if (v.audience === 'manager') return 'Managers';
  return 'Owners and managers';
}

/** The one line under a title: length, who it is for, and — when it is true — that it is not uploaded yet. */
export function metaLine(v: GuideVideoAdminItem): string {
  return [lengthLabel(v.durationMs), audienceWord(v), canSendNow(v) ? '' : 'Not uploaded yet']
    .filter(Boolean)
    .join(' · ');
}

export interface ChapterChoice {
  /** `0` for "from the start". */
  startSec: number;
  label: string;
}

/** "From the start", then each chapter with where it begins. Empty for a video with a single chapter. */
export function chapterChoices(v: Pick<GuideVideoAdminItem, 'chapters'>): ChapterChoice[] {
  if (v.chapters.length < 2) return [];
  return [
    { startSec: 0, label: 'From the start' },
    ...v.chapters.slice(1).map((c) => ({ startSec: c.startSec, label: `${clockLabel(c.startSec)}  ${c.label.en}` })),
  ];
}

/** A start to send: only one that is a chapter of this video, and not the start itself. */
export function startToSend(
  v: Pick<GuideVideoAdminItem, 'chapters'>,
  startSec: number | null | undefined,
): number | undefined {
  if (!startSec || startSec <= 0) return undefined;
  return v.chapters.some((c) => c.startSec === startSec) ? startSec : undefined;
}

/** The toast after a send, naming the video and, when one was picked, the chapter. */
export function describeVideoSent(v: Pick<GuideVideoAdminItem, 'title' | 'chapters'>, startSec?: number): string {
  const chapter = startSec ? v.chapters.find((c) => c.startSec === startSec) : undefined;
  return chapter
    ? `Sent “${v.title.en}” to this chat, from “${chapter.label.en}”.`
    : `Sent “${v.title.en}” to this chat.`;
}

/** What the dealer's chat shows is the video itself; what an admin reads on a failed send. */
export function sendFailureMessage(code: string | undefined, message: string | undefined): string {
  if (code === 'VIDEO_NOT_UPLOADED') return 'That video is not uploaded yet.';
  if (code === 'VIDEO_NOT_FOR_APP') return 'That video goes on WhatsApp only, not inside the app.';
  return message || 'Could not send the video';
}
