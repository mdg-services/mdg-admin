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

/**
 * A ticket's alert is never what closes the ticket. Hiding it only takes the
 * row off this list; the ticket stays open, and the dealer's question stays
 * unanswered, until somebody resolves it with a note. The toast says so, because
 * "Hidden" on its own reads as "dealt with".
 */
export function isTicketAlert(alert: AdminAlert): boolean {
  return alert.kind === 'ticket_open';
}

/**
 * A grievance's or a registration's alert is the same: hiding it only takes the
 * row off this list. The grievance stays open until somebody resolves it with a
 * note, and the registration stays new until somebody has been in touch, so the
 * toast says so.
 *
 * Worded for one row and for the summary alike. Past 50 waiting the server
 * raises ONE alert for the lot ("Grievances · 57 waiting") in place of a row
 * each, and the toast for hiding it must not read as if one grievance were
 * meant. The summary's own key (`:backlog`) never reaches the app, so the
 * wording cannot branch on it and does not need to.
 */
const STILL_STANDING: Partial<Record<AdminAlertKind, string>> = {
  grievance_open: 'Hidden from this list. Grievances stay open until someone resolves them.',
  enrolment_new:
    'Hidden from this list. Registrations stay new until someone marks them as contacted.',
  callback_new: 'Hidden from this list. Call-backs stay new until someone marks them as called.',
  payment_problem:
    'Hidden from this list. The payment stays flagged until someone marks it as checked.',
  // Onboarding. Hiding any of these takes the row off the list; none of them is done by it.
  onboarding_stalled:
    'Hidden from this list. It clears on its own once the outlet moves to its next step or the setup is closed.',
  onboarding_call:
    'Hidden from this list. Log the call on the outlet to clear it for good; it returns if the dealer stays silent.',
  onboarding_mdg_waiting: 'Hidden from this list. It clears once MDG does the step.',
  onboarding_not_me:
    "Hidden from this list. The owner stays locked out until a super-admin clears it on the outlet's Setup card.",
  welcome_not_delivered: 'Hidden from this list. It clears once the owner signs in.',
  no_working_device: "Hidden from this list. It clears once the owner's phone registers for notifications.",
  password_help:
    'Hidden from this list. The request stays open until someone marks it done on the Onboarding page.',
  // ── watch hold ── hiding the alert decides nothing about the messages behind it.
  held_message:
    'Hidden from this list. The messages stay held until someone sends or drops them on the Onboarding page, or they expire.',
  // ── autopay ── hiding the alert does not ring the owner; only a logged call clears it.
  autopay_stopped:
    "Hidden from this list. It clears once somebody rings the owner and marks the call done on the outlet's Autopay section.",
  // ── billing release ── hiding these does not get the owner approved, paid or called.
  autopay_approval_waiting:
    "Hidden from this list. It clears once the owner approves, a pay link is sent instead, or the approval runs out. Both are on the outlet's Autopay section.",
  autopay_approval_expired:
    "Hidden from this list. It clears once the first bill is paid, or a new approval or a pay link goes out from the outlet's Autopay section.",
  autopay_debit_failed:
    'Hidden from this list. It clears once a debit goes through or autopay ends. Razorpay keeps trying by itself.',
  first_month_refund_asked:
    "Hidden from this list. The owner is still waiting: ring them, then a super-admin gives the first month back from the outlet's Autopay section.",
  // ── leads ── hiding the alert does not get anybody in touch; only a logged contact or a close does.
  lead_new: 'Hidden from this list. This lead stays on the Leads page until somebody gets in touch.',
  lead_due: 'Hidden from this list. This lead stays on the Leads page until somebody gets in touch.',
  lead_cold: 'Hidden from this list. This lead stays on the Leads page until somebody gets in touch.',
};

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
  if (isTicketAlert(alert)) {
    return 'Hidden from this list. The ticket is still open until someone resolves it.';
  }
  const standing = STILL_STANDING[alert.kind];
  if (standing) return standing;
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
