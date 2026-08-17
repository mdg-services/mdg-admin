import { Route, Routes , Navigate } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { RequireSuperAdmin } from '@/components/layout/RequireSuperAdmin';
import { ActivityPage } from '@/pages/ActivityPage';
import { AdminsPage } from '@/pages/AdminsPage';
import { AllUsersPage } from '@/pages/AllUsersPage';
import { BankHolidaysPage } from '@/pages/BankHolidaysPage';
import { ShiftDataEditorPage } from '@/pages/dataVault/dayEditor/ShiftDataEditorPage';
import { DataVaultPage } from '@/pages/DataVaultPage';
import { DealerDetailPage } from '@/pages/DealerDetailPage';
import { DealersPage } from '@/pages/DealersPage';
import { DsrReportView } from '@/pages/dsr/DsrReportView';
import { DsrVaultPage } from '@/pages/DsrVaultPage';
import { FestivalPage } from '@/pages/FestivalPage';
import { InboxPage } from '@/pages/InboxPage';
import { KavachDashboardPage } from '@/pages/KavachDashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { RunHistoryPage } from '@/pages/RunHistoryPage';
import { ServiceCatalogPage } from '@/pages/ServiceCatalogPage';
import { WorkListDefaultsPage } from '@/pages/WorkListDefaultsPage';

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
          {/* Plain admins are the audience here — the Vault is where they read
              every dealer's collected IRAS data, so it is NOT super-admin only. */}
          <Route path="data-vault" element={<DataVaultPage />} />
          {/* Correcting a day's collected figures. A full page, not a drawer:
              these reports run to 36 columns. Same audience as the Vault it
              hangs off — the audit trail on every correction is the control
              here, not a role gate. */}
          <Route
            path="data-vault/dealers/:dealerId/days/:businessDate"
            element={<ShiftDataEditorPage />}
          />
          {/* Daily Sales Report — a dealer-facing outcome surface, so like the
              Data Vault it is NOT super-admin only. */}
          <Route path="dsr" element={<DsrVaultPage />} />
          <Route path="dsr/dealers/:dealerId" element={<DsrReportView />} />
          {/* The plugin catalog and the raw run log are engineer surfaces —
              plain admins get outcomes on the dealer screens instead. Keep
              these in step with `superAdminOnly` in navItems.ts. */}
          <Route
            path="services"
            element={
              <RequireSuperAdmin>
                <ServiceCatalogPage />
              </RequireSuperAdmin>
            }
          />
          <Route
            path="runs"
            element={
              <RequireSuperAdmin>
                <RunHistoryPage />
              </RequireSuperAdmin>
            }
          />
          <Route
            path="activity"
            element={
              <RequireSuperAdmin>
                <ActivityPage />
              </RequireSuperAdmin>
            }
          />
          <Route
            path="users"
            element={
              <RequireSuperAdmin>
                <AllUsersPage />
              </RequireSuperAdmin>
            }
          />
          <Route
            path="work-list"
            element={
              <RequireSuperAdmin>
                <WorkListDefaultsPage />
              </RequireSuperAdmin>
            }
          />
          <Route
            path="bank-holidays"
            element={
              <RequireSuperAdmin>
                <BankHolidaysPage />
              </RequireSuperAdmin>
            }
          />
          <Route
            path="festival"
            element={
              <RequireSuperAdmin>
                <FestivalPage />
              </RequireSuperAdmin>
            }
          />
          <Route
            path="settings/team"
            element={
              <RequireSuperAdmin>
                <AdminsPage />
              </RequireSuperAdmin>
            }
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}
