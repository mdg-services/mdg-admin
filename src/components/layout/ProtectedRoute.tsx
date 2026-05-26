import * as React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuthStore } from '@/store/auth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
