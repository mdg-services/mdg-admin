import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { AdminNotificationPrefs } from '@dk/shared';

// The admin is in the key because signing out leaves the query cache alone: a
// second admin on the same tab would otherwise be shown the first one's switch.
export const adminNotificationPrefsKey = (adminId: string | null) =>
  ['admin', 'me', adminId, 'notification-preferences'] as const;

/** Whose settings these are: the signed-in admin, as the other per-admin screens read it. */
function useMyId(): string | null {
  return useAuthStore((s) => s.admin?.id ?? s.user?.id ?? null);
}

/**
 * The signed-in admin's own phone settings: one switch, "Buzz me for every
 * dealer message". Off means no buzz for each message; tickets, late tickets and
 * alerts still buzz. It is this admin's own — a colleague's switch is theirs.
 */
export function useAdminNotificationPrefs() {
  const myId = useMyId();
  return useQuery({
    queryKey: adminNotificationPrefsKey(myId),
    queryFn: () => api.get<AdminNotificationPrefs>('/admin/me/notification-preferences'),
    // A setting changes only when this admin changes it, and it is read from a
    // menu that stays mounted in the header: ask once, not on every focus.
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/**
 * Flip the switch. The new value shows at once and goes back if the save fails,
 * so a toggle on a weak link does not stand for a setting that never saved.
 */
export function useSetAdminNotificationPrefs() {
  const qc = useQueryClient();
  const key = adminNotificationPrefsKey(useMyId());
  return useMutation({
    mutationFn: (prefs: AdminNotificationPrefs) =>
      api.patch<AdminNotificationPrefs>('/admin/me/notification-preferences', prefs),
    onMutate: async (prefs) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AdminNotificationPrefs>(key);
      qc.setQueryData<AdminNotificationPrefs>(key, prefs);
      return { previous };
    },
    onError: (_err, _prefs, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (saved) => {
      if (saved) qc.setQueryData(key, saved);
    },
  });
}
