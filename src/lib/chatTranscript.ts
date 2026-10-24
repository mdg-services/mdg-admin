/**
 * The words under a voice note in the thread. Pure, so the decisions read in one
 * place and `scripts/chatTranscript.check.ts` runs them (this app has no test
 * runner). Types only from `@dk/shared`, as `lib/onboarding.ts` does.
 *
 * The server listens to a dealer's voice note, saves what was said on the note
 * (`attachment.transcript`) and tells an open thread with `message:transcript`.
 * A note is drawn with its words under the player when it has them; the admin
 * reads them without playing the audio, and sees at once when the words are wrong.
 */
import type { Attachment, Message } from '@dk/shared';

/** What `message:transcript` carries (`ServerToClientEvents` in `@dk/shared`). */
export interface TranscriptEvent {
  conversationId: string;
  messageId: string;
  /** Which attachment of the message: the voice note's storage key. */
  storageKey: string;
  transcript: string;
}

/** The words to show under a voice note, or `null` when there are none (or it is not a voice note). */
export function transcriptOf(a: Pick<Attachment, 'kind' | 'transcript'>): string | null {
  if (a.kind !== 'audio') return null;
  const words = a.transcript?.trim();
  return words ? words : null;
}

/**
 * The thread's cached pages with the words put on the voice note the event names.
 * Idempotent: the same words again, an unknown message, or an attachment that is
 * not there give back the SAME array, so a repeated event re-renders nothing.
 * Nothing is changed in place.
 */
export function applyTranscript(pages: Message[][], ev: TranscriptEvent): Message[][] {
  const words = ev.transcript.trim();
  if (!words) return pages;
  let changed = false;
  const next = pages.map((page) =>
    page.map((m) => {
      if (m.id !== ev.messageId) return m;
      let hit = false;
      const attachments = m.attachments.map((a) => {
        if (a.storageKey !== ev.storageKey || a.kind !== 'audio' || a.transcript === words) return a;
        hit = true;
        return { ...a, transcript: words };
      });
      if (!hit) return m;
      changed = true;
      return { ...m, attachments };
    }),
  );
  return changed ? next : pages;
}
