/**
 * The WhatsApp replies page's decisions, kept out of the component so they read
 * as plain rules. This app has no test runner, so the less logic a `.tsx`
 * carries, the less of it can go wrong unseen.
 */
import { ageSince } from '@/pages/overview/format';
import type { WhatsAppReplyMessage, WhatsAppReplyThread } from '@dk/shared';

/** "+91 98000 00001" from 919800000001; anything else is shown as it came. */
export function phoneLabel(phone: string | null): string {
  if (!phone) return 'Number not shared';
  const m = /^91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : `+${phone}`;
}

/**
 * What to call the person: the name on our own send list first — that is who
 * the admin knows them as — then the name they gave WhatsApp, then the number.
 */
export function threadName(t: WhatsAppReplyThread): string {
  return t.listName ?? t.profileName ?? phoneLabel(t.phone);
}

/** What the phone's dialler opens. */
export function dialHref(phone: string): string {
  return `tel:+${phone}`;
}

/** Their own WhatsApp name, shown beside the number when it is not the name we already use. */
export function profileNote(t: WhatsAppReplyThread): string | null {
  return t.listName && t.profileName && t.profileName !== t.listName
    ? `“${t.profileName}” on WhatsApp`
    : null;
}

const KIND_WORDS: Record<string, string> = {
  image: 'a photo',
  video: 'a video',
  audio: 'a voice note',
  document: 'a document',
  sticker: 'a sticker',
  location: 'a location',
  contacts: 'a contact',
  reaction: 'a reaction',
};

/** The message as one line. Media has no words to show, so it is named. */
export function messageText(m: WhatsAppReplyMessage): string {
  if (m.text) return m.text;
  return `Sent ${KIND_WORDS[m.kind ?? ''] ?? 'a message'} (not shown here)`;
}

/**
 * The note beside a message that says stop, or null for an ordinary message.
 * The unrecorded case is the one that needs a person: we could not tell whose
 * number it is, so nothing stops the next promotion reaching them.
 */
export function stopNote(m: WhatsAppReplyMessage): { text: string; urgent: boolean } | null {
  if (!m.stop) return null;
  return m.stopRecorded
    ? { text: 'Asked us to stop. No promotion will go to this number again.', urgent: false }
    : {
        text: 'Asked us to stop, but WhatsApp did not share the number. Find them on the list and leave them off the next send.',
        urgent: true,
      };
}

/** "12m", "3h 5m", "2 days" since their last message. */
export function threadAge(t: WhatsAppReplyThread, now: number): string {
  return ageSince(t.lastAt, now) || 'now';
}

/** "10 Oct, 14:02" in India time. */
export function messageTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
