import { useOpenAlertCount } from './api/useAdminAlerts';
import { useAiTurnCountsQuery } from './api/useAiTurns';
import { useBankHolidayPendingQuery } from './api/useBankHolidays';
import { useNewCallbackCount } from './api/useCallbacks';
import { useNewEnrolmentCount } from './api/useEnrolments';
import { useOpenGrievanceCount } from './api/useGrievances';
import { useLeadsTodoCount } from './api/useLeads';
import { useNeedsUsCount } from './api/useTickets';
import { useWhatsAppUnreadChats } from './api/useWhatsAppInbox';

/**
 * The count badge each nav destination carries, keyed by its route: tickets that
 * need us (on the Inbox), open alerts, AI answers nobody has judged yet,
 * unconfirmed national holidays, website grievances nobody has resolved,
 * registrations nobody has dealt with yet (on the Onboarding entry), leads due now or never
 * called, and WhatsApp chats with something unread.
 *
 * The Inbox's number is the open tickets that are New, Waiting or Late — the
 * ones a person has to do something about right now — and not a count of unread
 * chats: an unread chat that nobody owes an answer to is not a reason to open
 * the app, and a ticket that is waiting on us is.
 *
 * ONE place, because there were two and they had drifted. The desktop sidebar
 * (`AppShell`) and the phone's tab bar (`MobileTabBar`) each computed their
 * own, the phone's had never learned about bank holidays, and a super-admin
 * with three holidays waiting saw "3" on a desktop and nothing on a phone.
 *
 * The AI count is the only nudge to open the AI answers page, and the feature's
 * safety claim is that a person reads what the machine said — so it has to
 * reach the phone, where `/ai-answers` lives inside the More sheet. Every query
 * here shares its cache entry with the page it counts for, so a second caller
 * costs no second request, and judging a turn on the page takes the number
 * down everywhere at once. The two website counts are the exception: they are
 * their own small requests, because their pages hold up to 500 rows of a
 * stranger's words and the shell must not fetch those to print a number.
 */
export function useNavBadges(): Record<string, number> {
  const aiCountsQ = useAiTurnCountsQuery();
  const pendingHolidaysQ = useBankHolidayPendingQuery();
  const openAlerts = useOpenAlertCount();
  const ticketsNeedingUs = useNeedsUsCount();
  // Grievances are super-admin only, and that hook stays silent for everyone else;
  // registrations are every admin's (any admin approves one). Each asks the server
  // for the counts alone (`limit=0`), not for the list.
  const openGrievances = useOpenGrievanceCount();
  const newRegistrations = useNewEnrolmentCount();
  const newCallbacks = useNewCallbackCount();
  // Leads due now or nobody has called. Every admin: they all chase them.
  const leadsToDo = useLeadsTodoCount();
  // Chats with something unread, from the same small request the page title
  // reads. Super-admin only, and silent — no request at all — for everyone else.
  const whatsappUnread = useWhatsAppUnreadChats();
  return {
    '/inbox': ticketsNeedingUs,
    '/alerts': openAlerts,
    '/ai-answers': aiCountsQ.data?.unreviewed ?? 0,
    '/bank-holidays': pendingHolidaysQ.data?.totalCount ?? 0,
    '/grievances': openGrievances,
    '/onboarding': newRegistrations,
    '/callbacks': newCallbacks,
    '/leads': leadsToDo,
    '/whatsapp': whatsappUnread,
  };
}
