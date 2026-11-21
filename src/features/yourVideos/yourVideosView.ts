import type { YourVideosAdminRow, YourVideosAdminView, YourVideosWatcher } from '@dk/shared';

/**
 * What the outlet's "Videos watched" card says, as plain functions so the words are
 * checkable without a screen (`scripts/yourVideosView.check.ts`).
 */

/** The list's rows split into the services the outlet has and the ones it does not, order kept. */
export function rowsByGroup(rows: YourVideosAdminRow[]): { has: YourVideosAdminRow[]; hasNot: YourVideosAdminRow[] } {
  return { has: rows.filter((r) => r.attached), hasNot: rows.filter((r) => !r.attached) };
}

/** "Ramesh (owner) · 21 Nov" — who watched it and when. A name that is not known reads as the role. */
export function watcherLine(w: YourVideosWatcher, day: (iso: string) => string): string {
  const who = w.name?.trim() || (w.role === 'owner' ? 'An owner' : 'The manager');
  return `${who} (${w.role}) · ${day(w.watchedAt)}`;
}

/** The card's subtitle: how many videos anyone has watched, how many people could, and when the list was sent. */
export function summaryWords(view: YourVideosAdminView, day: (iso: string) => string): string {
  const total = view.rows.length;
  const watched = view.rows.filter((r) => r.watchedBy.length > 0).length;
  const people = view.people === 1 ? '1 person on the app' : `${view.people} people on the app`;
  const sent = view.lastSentAt ? `List sent ${day(view.lastSentAt)}` : 'List not sent yet';
  return `${watched} of ${total} videos watched by someone · ${people} · ${sent}`;
}
