import { useOpenAlertCount } from './api/useAdminAlerts';
import { useAiTurnCountsQuery } from './api/useAiTurns';
import { useBankHolidayPendingQuery } from './api/useBankHolidays';
import { useConversations } from './api/useConversations';

/**
 * The count badge each nav destination carries, keyed by its route: unread
 * chats, open alerts, AI answers nobody has judged yet, unconfirmed national
 * holidays.
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
 * down everywhere at once.
 */
export function useNavBadges(): Record<string, number> {
  const mineQ = useConversations('mine');
  const aiCountsQ = useAiTurnCountsQuery();
  const pendingHolidaysQ = useBankHolidayPendingQuery();
  const openAlerts = useOpenAlertCount();
  return {
    '/inbox': (mineQ.data ?? []).filter((c) => c.unreadByAdmin).length,
    '/alerts': openAlerts,
    '/ai-answers': aiCountsQ.data?.unreviewed ?? 0,
    '/bank-holidays': pendingHolidaysQ.data?.totalCount ?? 0,
  };
}
