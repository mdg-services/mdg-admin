import { Route, Routes , Navigate } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AdminsPage } from '@/pages/AdminsPage';
import { DealerDetailPage } from '@/pages/DealerDetailPage';
import { DealersPage } from '@/pages/DealersPage';
import { InboxPage } from '@/pages/InboxPage';
import { KavachDashboardPage } from '@/pages/KavachDashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { RunHistoryPage } from '@/pages/RunHistoryPage';
import { ServiceCatalogPage } from '@/pages/ServiceCatalogPage';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/inbox" replace />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="dealers" element={<DealersPage />} />
          <Route path="dealers/:id" element={<DealerDetailPage />} />
          <Route path="kavach" element={<KavachDashboardPage />} />
          <Route path="services" element={<ServiceCatalogPage />} />
          <Route path="runs" element={<RunHistoryPage />} />
          <Route path="settings/team" element={<AdminsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}
