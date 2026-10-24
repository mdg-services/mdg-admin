import { useOpenAlertCount } from './api/useAdminAlerts';
import { useAiTurnCountsQuery } from './api/useAiTurns';
import { useBankHolidayPendingQuery } from './api/useBankHolidays';
import { useNewCallbackCount } from './api/useCallbacks';
import { useConversations } from './api/useConversations';
import { useNewEnrolmentCount } from './api/useEnrolments';
import { useOpenGrievanceCount } from './api/useGrievances';
import { useOpenTicketCount } from './api/useTickets';
import { useWhatsAppUnreadChats } from './api/useWhatsAppInbox';

/**
 * The count badge each nav destination carries, keyed by its route: unread
 * chats, open tickets, open alerts, AI answers nobody has judged yet,
 * unconfirmed national holidays, website grievances nobody has resolved,
 * registrations nobody has dealt with yet (on the Onboarding entry) and WhatsApp chats with
 * something unread.
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
  const mineQ = useConversations('mine');
  const aiCountsQ = useAiTurnCountsQuery();
  const pendingHolidaysQ = useBankHolidayPendingQuery();
  const openAlerts = useOpenAlertCount();
  const openTickets = useOpenTicketCount();
  // Grievances are super-admin only, and that hook stays silent for everyone else;
  // registrations are every admin's (any admin approves one). Each asks the server
  // for the counts alone (`limit=0`), not for the list.
  const openGrievances = useOpenGrievanceCount();
  const newRegistrations = useNewEnrolmentCount();
  const newCallbacks = useNewCallbackCount();
  // Chats with something unread, from the same small request the page title
  // reads. Super-admin only, and silent — no request at all — for everyone else.
  const whatsappUnread = useWhatsAppUnreadChats();
  return {
    '/inbox': (mineQ.data ?? []).filter((c) => c.unreadByAdmin).length,
    '/tickets': openTickets,
    '/alerts': openAlerts,
    '/ai-answers': aiCountsQ.data?.unreviewed ?? 0,
    '/bank-holidays': pendingHolidaysQ.data?.totalCount ?? 0,
    '/grievances': openGrievances,
    '/onboarding': newRegistrations,
    '/callbacks': newCallbacks,
    '/whatsapp': whatsappUnread,
  };
}
