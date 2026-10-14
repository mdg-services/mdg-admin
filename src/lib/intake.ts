/**
 * What the Grievances and Registrations pages both print about a person who
 * wrote in from the website: their number as something a thumb can dial, their
 * email as something that opens a mail app, and the time they sent it in India.
 *
 * Pure on purpose. This app has no test runner, so the rules live here where
 * `scripts/intake.check.ts` can run them, not inside a component.
 *
 * The numbers are free text. The website accepts digits, spaces, `+` and `-`
 * between 10 and 15 characters, so "98765 43210", "+91 98765-43210" and
 * "09876543210" are all real submissions, and none of them is a valid `tel:`
 * address as typed.
 */

/** Ten digits starting 6-9 — an Indian mobile — or `null` when it is not one. */
function indianMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  // Ten digits as typed, or the same ten behind "91" or a trunk "0".
  const ten =
    digits.length === 10
      ? digits
      : digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : digits.length === 11 && digits.startsWith('0')
          ? digits.slice(1)
          : null;
  return ten && /^[6-9]/.test(ten) ? ten : null;
}

/**
 * What the phone's dialler opens, or `null` when there is nothing to dial.
 *
 * An Indian mobile always goes out as +91, however it was typed: a dialler
 * given bare "98765 43210" from a phone set to another country code rings the
 * wrong place. Anything else keeps its own `+` if it had one and is otherwise
 * dialled as typed. `null` is for a "number" made of dashes, which the form's
 * pattern lets through.
 */
export function dialHref(raw: string): string | null {
  const mobile = indianMobile(raw);
  if (mobile) return `tel:+91${mobile}`;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return raw.trim().startsWith('+') ? `tel:+${digits}` : `tel:${digits}`;
}

/** "+91 98765 43210" for an Indian mobile; anything else exactly as typed, spaces tidied. */
export function phoneLabel(raw: string): string {
  const mobile = indianMobile(raw);
  if (mobile) return `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * A `mailto:` link, or `null` when the address is not one that is safe to put
 * in a link. The server has already checked the address, but it is a stranger's
 * text, and a `?` or `&` in it would be read as the start of a header, and a
 * comma as the start of a second recipient.
 */
export function mailtoHref(email: string, subject?: string): string | null {
  const address = email.trim();
  if (!/^[^\s@?&#<>"'%,;]+@[^\s@?&#<>"'%,;]+$/.test(address)) return null;
  return subject ? `mailto:${address}?subject=${encodeURIComponent(subject)}` : `mailto:${address}`;
}

/**
 * Hoisted: a formatter built per call is ~40x slower, and this runs once per row.
 *
 * `hourCycle: 'h23'`, not `hour12: false`: for en-IN the latter picks the 1-24
 * clock, so five past midnight prints "24:05". `h23` prints "00:05".
 */
const IST_STAMP = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const IST_STAMP_WITH_YEAR = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const IST_YEAR = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' });

/**
 * "12 Oct, 14:05" in India time, with the year added once it is not this year —
 * a list that keeps everything ever sent cannot leave "3 Mar" to be guessed at.
 * Empty for a missing or unreadable time.
 */
export function istStamp(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = IST_YEAR.format(d) === IST_YEAR.format(now);
  return (sameYear ? IST_STAMP : IST_STAMP_WITH_YEAR).format(d);
}

/**
 * "3h 5m ago", "2 days ago", or "just now" — for how long ago it was sent.
 * `elapsed` is the page's own ticking `ageSince`, passed in so this file stays
 * free of the overview page's formatter and the two can be checked apart.
 */
export function agoLabel(elapsed: string): string {
  return !elapsed || elapsed === '0m' ? 'just now' : `${elapsed} ago`;
}

/**
 * The one-line note above a list the server has cut short, or `null` when the
 * list is whole. The server sends at most 500 rows but counts every one, so
 * `total` is the number on the tab and `shown` is what is on the page.
 */
export function cutShortNote(shown: number, total: number): string | null {
  if (total <= shown) return null;
  return `Showing the newest ${shown.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}.`;
}
