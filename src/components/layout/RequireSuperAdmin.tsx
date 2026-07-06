import * as React from 'react';
import { Navigate } from 'react-router-dom';

import { useMeQuery } from '@/hooks/api/useAuth';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';

/**
 * Route guard for super-admin-only pages (Activity, Team). Non-super-admins are
 * redirected to the inbox. Backs the API gate — the endpoints are also
 * super-admin-only, this just avoids showing a broken page.
 */
export function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const meQ = useMeQuery();
  const isSuperAdmin = useIsSuperAdmin();
  if (isSuperAdmin) return <>{children}</>;
  // Still determining from /auth/me and no cached answer yet — hold.
  if (meQ.isLoading) return null;
  return <Navigate to="/inbox" replace />;
}
