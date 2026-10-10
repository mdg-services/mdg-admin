/**
 * The Alerts page's decisions, kept out of the component so they read as plain
 * rules. This app has no test runner, so the less logic a `.tsx` carries, the
 * less of it can go wrong unseen.
 */
import { ageSince } from '@/pages/overview/format';
import type { AdminAlert, AdminAlertKind } from '@dk/shared';

/**
 * Kinds about something that HAPPENED rather than something still wrong. There
 * is no problem left standing behind them, so the button says "Mark as seen"
 * and pressing it closes the alert rather than hiding it.
 */
const EVENT_KINDS: ReadonlySet<AdminAlertKind> = new Set(['server_restarted', 'boot_step_failed']);

export function isEventAlert(alert: AdminAlert): boolean {
  return EVENT_KINDS.has(alert.kind);
}

/**
 * A WhatsApp reply is never hidden either. Its alert is about a person, and a
 * hidden one would go on swallowing everything that person wrote afterwards —
 * so the server marks the messages as read and closes the alert, and their
 * next message raises a new one.
 */
export function isReplyAlert(alert: AdminAlert): boolean {
  return alert.kind === 'whatsapp_reply';
}

/** Whether the row's button closes the alert for good rather than hiding it. */
export function closesWhenPressed(alert: AdminAlert): boolean {
  return isEventAlert(alert) || isReplyAlert(alert);
}

/** The label on the row's button for an open alert. */
export function hideLabel(alert: AdminAlert): string {
  if (isReplyAlert(alert)) return 'Mark as read';
  return isEventAlert(alert) ? 'Mark as seen' : 'Hide';
}

/** What the toast says once that button has worked. */
export function hiddenToast(alert: AdminAlert): string {
  if (isReplyAlert(alert)) return 'Marked as read. Their next message will alert you again.';
  return isEventAlert(alert)
    ? 'Marked as seen.'
    : 'Hidden. It moves to Cleared on its own once it is fixed.';
}

/**
 * Whether tapping the row goes anywhere. Server alerts point at this list
 * itself — there is no screen where a crash is "fixed" — so their rows do not
 * pretend to be links.
 */
export function opensSomewhere(alert: AdminAlert): boolean {
  return alert.href !== '/alerts';
}

/** "12m", "3h 5m", "2 days" — since it appeared, or since it cleared on the Cleared tab. */
export function alertAge(alert: AdminAlert, now: number): string {
  const at = alert.state === 'RESOLVED' ? alert.resolvedAt : alert.openedAt;
  return ageSince(at, now) || 'now';
}

/** How an alert left the list, in the words the Cleared tab prints. */
export function howItCleared(alert: AdminAlert): string {
  switch (alert.resolution) {
    case 'cleared':
      return alert.dismissedAt ? 'Fixed (it had been hidden)' : 'Fixed';
    case 'dismissed':
      return alert.dismissedByName ? `Marked as seen by ${alert.dismissedByName}` : 'Marked as seen';
    case 'expired':
      // A server alert after its day, or one the system withdrew.
      return 'Closed automatically';
    default:
      return '';
  }
}

/** The line under a hidden alert: who hid it. */
export function hiddenBy(alert: AdminAlert): string {
  return alert.dismissedByName ? `Hidden by ${alert.dismissedByName}` : 'Hidden';
}
