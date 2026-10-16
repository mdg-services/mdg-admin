import { describeShareRecipients, type ShareOutcome } from '@dk/shared';

/**
 * What an admin is told after a send, as plain functions. Pure on purpose: this
 * app has no test runner, and the rule here — a send that did not reach everyone
 * it was asked to reach is never a green success — is the one a screen keeps
 * getting wrong when it is written inline.
 */

/** A share's answer, with one plain sentence per thing asked for and not sent. */
export type ShareResult = ShareOutcome & { notReached?: string[] };

/**
 * How long a toast that reports a shortfall stays up. A shortfall is the one
 * thing in a send's toast the admin has to act on (send again, add the person),
 * and the 4 seconds a toast gets by default is less than it takes to read it.
 */
export const NOT_REACHED_TOAST_MS = 12_000;

/**
 * The toast after a share: who it actually reached. A "Both" on an outlet with
 * no manager on the app says "Sent to 2 owners." rather than claiming more.
 *
 * The sentences for what did NOT go out are appended HERE, once. A caller must
 * not add `notReached` again: the title would print them twice.
 */
export function shareResultMessage(result: ShareResult | undefined, fallback: string): string {
  if (!result) return fallback;
  // What the send was asked to do and did not — nobody of a side on the app, a
  // copy that failed. Said in the same toast, so a partial send never reads as
  // a complete one.
  const missed = result.notReached?.length ? ` ${result.notReached.join(' ')}` : '';
  if (result.alreadyShared) {
    const earlier = result.recipients
      ? `Already sent earlier. ${describeShareRecipients(result.recipients).replace('Sent', 'It went')}`
      : 'This had already been sent.';
    return `${earlier}${missed}`;
  }
  const sent = result.recipients ? describeShareRecipients(result.recipients) : fallback;
  return `${sent}${missed}`;
}

/** The toast to raise: green when everything went out, a warning that stays when not. */
export interface ShareToastSpec {
  intent: 'success' | 'warning';
  title: string;
  /** Set only for a warning; absent means the toast's own default. */
  duration?: number;
}

/**
 * Turns a ready message into the toast for it. `message` is the text the screen
 * wants (it may add the outlet's code in front, or word an already-sent card its
 * own way); `result` decides the tone. Whenever `notReached` is non-empty the
 * toast is a warning that stays about 12 seconds, never a green success.
 */
export function shareToastSpec(
  message: string,
  result: Pick<ShareResult, 'notReached'> | undefined,
): ShareToastSpec {
  const short = (result?.notReached?.length ?? 0) > 0;
  return short
    ? { intent: 'warning', title: message, duration: NOT_REACHED_TOAST_MS }
    : { intent: 'success', title: message };
}
