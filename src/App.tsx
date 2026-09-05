import * as React from 'react';
import { Route, Routes , Navigate } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { RequireSuperAdmin } from '@/components/layout/RequireSuperAdmin';
import { Skeleton } from '@/components/ui';
import { retryImport } from '@/lib/retryImport';
import { InboxPage } from '@/pages/InboxPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * Three pages stay in the entry chunk, and every other one is fetched when it
 * is first opened.
 *
 * The three are the ones you cannot navigate *to*: `LoginPage` is where an
 * unauthenticated visit lands, `InboxPage` is where `/` redirects, and
 * `NotFoundPage` catches everything else. Splitting those would only add a
 * round trip to first paint on the slow connections this app is used on —
 * which is the one thing this change must not do.
 *
 * Everything else is behind a tap: the Assist console, the 36-column IRAS edit
 * grid, the DSR viewer, the dealer detail page and its JSON-schema form stack.
 * Previously all of it shipped as one 1.49 MB chunk, so signing in and reading
 * the Inbox paid for every screen in the product.
 *
 * Every factory goes through `retryImport`, which handles a dropped request and
 * a chunk that a redeploy has renamed out from under a live session — both only
 * possible once there are chunks at all. See its comment for the trap.
 */
const ActivityPage = React.lazy(
  retryImport(() =>
    import('@/pages/ActivityPage').then((m) => ({ default: m.ActivityPage })),
  ),
);
const AiAnswersPage = React.lazy(
  retryImport(() =>
    import('@/pages/aiAnswers/AiAnswersPage').then((m) => ({
      default: m.AiAnswersPage,
    })),
  ),
);
const AdminsPage = React.lazy(
  retryImport(() =>
    import('@/pages/AdminsPage').then((m) => ({ default: m.AdminsPage })),
  ),
);
const AllUsersPage = React.lazy(
  retryImport(() =>
    import('@/pages/AllUsersPage').then((m) => ({ default: m.AllUsersPage })),
  ),
);
const AssistPage = React.lazy(
  retryImport(() =>
    import('@/pages/AssistPage').then((m) => ({ default: m.AssistPage })),
  ),
);
const AssuranceQueuePage = React.lazy(
  retryImport(() =>
    import('@/pages/assurance/AssuranceQueuePage').then((m) => ({
      default: m.AssuranceQueuePage,
    })),
  ),
);
const BankHolidaysPage = React.lazy(
  retryImport(() =>
    import('@/pages/BankHolidaysPage').then((m) => ({
      default: m.BankHolidaysPage,
    })),
  ),
);
const DataVaultPage = React.lazy(
  retryImport(() =>
    import('@/pages/DataVaultPage').then((m) => ({ default: m.DataVaultPage })),
  ),
);
const DealerDetailPage = React.lazy(
  retryImport(() =>
    import('@/pages/DealerDetailPage').then((m) => ({
      default: m.DealerDetailPage,
    })),
  ),
);
const DealersPage = React.lazy(
  retryImport(() =>
    import('@/pages/DealersPage').then((m) => ({ default: m.DealersPage })),
  ),
);
const DsrReportView = React.lazy(
  retryImport(() =>
    import('@/pages/dsr/DsrReportView').then((m) => ({
      default: m.DsrReportView,
    })),
  ),
);
const DsrPnlView = React.lazy(
  retryImport(() =>
    import('@/pages/dsr/DsrPnlView').then((m) => ({
      default: m.DsrPnlView,
    })),
  ),
);
const DsrVaultPage = React.lazy(
  retryImport(() =>
    import('@/pages/DsrVaultPage').then((m) => ({ default: m.DsrVaultPage })),
  ),
);
const FestivalPage = React.lazy(
  retryImport(() =>
    import('@/pages/FestivalPage').then((m) => ({ default: m.FestivalPage })),
  ),
);
const KavachDashboardPage = React.lazy(
  retryImport(() =>
    import('@/pages/KavachDashboardPage').then((m) => ({
      default: m.KavachDashboardPage,
    })),
  ),
);
const KavachDefaultsPage = React.lazy(
  retryImport(() =>
    import('@/pages/KavachDefaultsPage').then((m) => ({
      default: m.KavachDefaultsPage,
    })),
  ),
);
const KavachWorkQueuePage = React.lazy(
  retryImport(() =>
    import('@/pages/KavachWorkQueuePage').then((m) => ({
      default: m.KavachWorkQueuePage,
    })),
  ),
);
const LedgerWatchPage = React.lazy(
  retryImport(() =>
    import('@/pages/LedgerWatchPage').then((m) => ({
      default: m.LedgerWatchPage,
    })),
  ),
);
const OverviewPage = React.lazy(
  retryImport(() =>
    import('@/pages/OverviewPage').then((m) => ({ default: m.OverviewPage })),
  ),
);
const RunHistoryPage = React.lazy(
  retryImport(() =>
    import('@/pages/RunHistoryPage').then((m) => ({ default: m.RunHistoryPage })),
  ),
);
const ServiceCatalogPage = React.lazy(
  retryImport(() =>
    import('@/pages/ServiceCatalogPage').then((m) => ({
      default: m.ServiceCatalogPage,
    })),
  ),
);
const ShiftDataEditorPage = React.lazy(
  retryImport(() =>
    import('@/pages/dataVault/dayEditor/ShiftDataEditorPage').then((m) => ({
      default: m.ShiftDataEditorPage,
    })),
  ),
);
const WorkListDefaultsPage = React.lazy(
  retryImport(() =>
    import('@/pages/WorkListDefaultsPage').then((m) => ({
      default: m.WorkListDefaultsPage,
    })),
  ),
);

/**
 * The boundary a lazily-loaded page waits behind.
 *
 * One per route element rather than one around `<Routes>`, and that is the
 * whole point: a boundary above the router would swap out `AppShell` too, so
 * every navigation on a slow connection would blink the sidebar, the header and
 * the mobile tab bar out of existence and back. Wrapped this far in, the
 * chrome never moves and only the page area shows a placeholder — which is what
 * a native app does.
 *
 * Inside `RequireSuperAdmin` where there is one, so a plain admin's chunk is
 * never fetched for a page they will be redirected away from.
 */
function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense
      fallback={
        <div className="grid gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-72 w-full" />
        </div>
      }
    >
      {children}
    </React.Suspense>
  );
}

export default function App() {
  return (
    // The outer boundary: it catches a crash in the shell itself, or in a route
    // that renders outside it (login, 404). Everything under the shell is
    // covered by a SECOND boundary inside `AppShell`, around `<Outlet />`, so a
    // page that throws does not take the navigation chrome with it.
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
          <Route
            path="overview"
            element={
              <LazyPage>
                <OverviewPage />
              </LazyPage>
            }
          />
          {/* Reading the turn log and passing judgement on it is everyday admin
              work — the people who answer the tickets are the people who can
              tell whether an answer was any good — so the ROUTE is not
              super-admin. Only the two switches inside the page are, and they
              are hidden and gated separately. */}
          <Route
            path="ai-answers"
            element={
              <LazyPage>
                <AiAnswersPage />
              </LazyPage>
            }
          />
          <Route
            path="dealers"
            element={
              <LazyPage>
                <DealersPage />
              </LazyPage>
            }
          />
          <Route
            path="dealers/:id"
            element={
              <LazyPage>
                <DealerDetailPage />
              </LazyPage>
            }
          />
          {/* The queue is what an admin opens: everything outstanding across
              every dealer, in one list. The old dashboard keeps a route as the
              per-dealer standing view — including "how long since anyone at MDG
              verified this outlet", which is the only alarm for OUR backlog. */}
          <Route
            path="kavach"
            element={
              <LazyPage>
                <KavachWorkQueuePage />
              </LazyPage>
            }
          />
          <Route
            path="kavach/dashboard"
            element={
              <LazyPage>
                <KavachDashboardPage />
              </LazyPage>
            }
          />
          {/* Editing points here moves every dealer without an override. */}
          <Route
            path="kavach/defaults"
            element={
              <RequireSuperAdmin>
                <LazyPage>
                  <KavachDefaultsPage />
                </LazyPage>
              </RequireSuperAdmin>
            }
          />
          {/* Every movement on every dealer's PAD ledger that is not the
              routine buy-and-pay pair. Deliberately NOT `superAdminOnly`: a fee
              or an interest posting nobody was told about is discovered by
              whoever answers the dealer's call, and gating it would mean the
              findings were read by whoever had the rights rather than by
              whoever had the context. The screen only ever reads and annotates
              — nothing on it can move a due amount or a due date. */}
          <Route
            path="ledger-watch"
            element={
              <LazyPage>
                <LedgerWatchPage />
              </LazyPage>
            }
          />
          {/* Plain admins are the audience here — the Vault is where they read
              every dealer's collected IRAS data, so it is NOT super-admin only. */}
          <Route
            path="data-vault"
            element={
              <LazyPage>
                <DataVaultPage />
              </LazyPage>
            }
          />
          {/* Correcting a day's collected figures. A full page, not a drawer:
              these reports run to 36 columns. Same audience as the Vault it
              hangs off — the audit trail on every correction is the control
              here, not a role gate. */}
          <Route
            path="data-vault/dealers/:dealerId/days/:businessDate"
            element={
              <LazyPage>
                <ShiftDataEditorPage />
              </LazyPage>
            }
          />
          {/* Daily Sales Report — a dealer-facing outcome surface, so like the
              Data Vault it is NOT super-admin only. */}
          <Route
            path="dsr"
            element={
              <LazyPage>
                <DsrVaultPage />
              </LazyPage>
            }
          />
          <Route
            path="dsr/dealers/:dealerId"
            element={
              <LazyPage>
                <DsrReportView />
              </LazyPage>
            }
          />
          {/* What the fuel earned, priced per delivery. Sits under the DSR
              because it is the same ledger read for money instead of litres —
              and, like the report, it never reaches a dealer token. */}
          <Route
            path="dsr/dealers/:dealerId/pnl"
            element={
              <LazyPage>
                <DsrPnlView />
              </LazyPage>
            }
          />
          {/* Everything the pre-send correctness gate is withholding, across
              every dealer, plus the per-dealer standing remarks. NOT
              super-admin: the endpoints behind it are `requireRole('admin')`,
              and a report withheld on an automatic path — the Kavach digest
              sends on its own schedule with no admin involved — is seen here or
              nowhere. */}
          <Route
            path="assurance"
            element={
              <LazyPage>
                <AssuranceQueuePage />
              </LazyPage>
            }
          />
          {/* The landing-page assistant's console (ADR 0009): strangers'
              transcripts, their phone numbers, and the block list. Keep this in
              step with `superAdminOnly` in navItems.ts — the flag only hides
              the link, this is what guards the URL. */}
          <Route
            path="assist"
            element={
              <RequireSuperAdmin>
                <LazyPage>
                  <AssistPage />
                </LazyPage>
              </RequireSuperAdmin>
            }
          />
          {/* The plugin catalog and the raw run log are engineer surfaces —
              plain admins get outcomes on the dealer screens instead. Keep
              these in step with `superAdminOnly` in navItems.ts. */}
          <Route
            path="services"
            element={
              <RequireSuperAdmin>
                <LazyPage>
                  <ServiceCatalogPage />
                </LazyPage>
              </RequireSuperAdmin>
            }
          />
          <Route
            path="runs"
            element={
              <RequireSuperAdmin>
                <LazyPage>
                  <RunHistoryPage />
                </LazyPage>
              </RequireSuperAdmin>
            }
          />
          <Route
            path="activity"
            element={
              <RequireSuperAdmin>
                <LazyPage>
                  <ActivityPage />
                </LazyPage>
              </RequireSuperAdmin>
            }
          />
          <Route
            path="users"
            element={
              <RequireSuperAdmin>
                <LazyPage>
                  <AllUsersPage />
                </LazyPage>
              </RequireSuperAdmin>
            }
          />
          <Route
            path="work-list"
            element={
              <RequireSuperAdmin>
                <LazyPage>
                  <WorkListDefaultsPage />
                </LazyPage>
              </RequireSuperAdmin>
            }
          />
          <Route
            path="bank-holidays"
            element={
              <RequireSuperAdmin>
                <LazyPage>
                  <BankHolidaysPage />
                </LazyPage>
              </RequireSuperAdmin>
            }
          />
          <Route
            path="festival"
            element={
              <RequireSuperAdmin>
                <LazyPage>
                  <FestivalPage />
                </LazyPage>
              </RequireSuperAdmin>
            }
          />
          <Route
            path="settings/team"
            element={
              <RequireSuperAdmin>
                <LazyPage>
                  <AdminsPage />
                </LazyPage>
              </RequireSuperAdmin>
            }
          />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}
