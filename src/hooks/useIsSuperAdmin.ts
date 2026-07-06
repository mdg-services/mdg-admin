import { useMeQuery } from '@/hooks/api/useAuth';
import { useAuthStore } from '@/store/auth';

/**
 * Whether the signed-in admin is a super-admin. Prefers the fresh `/auth/me`
 * result (so a promotion takes effect without a re-login), falling back to the
 * value persisted in the auth store from the last login.
 */
export function useIsSuperAdmin(): boolean {
  const meQ = useMeQuery();
  const admin = useAuthStore((s) => s.admin);
  const user = useAuthStore((s) => s.user);
  return (
    meQ.data?.isSuperAdmin ??
    admin?.isSuperAdmin ??
    user?.isSuperAdmin ??
    false
  );
}
