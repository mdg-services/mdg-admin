import { BellOff, CheckCircle2, EyeOff } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  DataList,
  EmptyState,
  RefreshTool,
  SegmentedControl,
  useToast,
} from '@/components/ui';
import {
  useAdminAlertsQuery,
  useDismissAlert,
  useRestoreAlert,
  type AlertView,
} from '@/hooks/api/useAdminAlerts';
import { useBusyIds } from '@/hooks/useBusyIds';
import { ADMIN_ALERT_KIND_INFO, type AdminAlert } from '@dk/shared';

import { alertAge, hiddenBy, hideLabel, howItCleared, isEventAlert, opensSomewhere } from './format';

const VIEWS: readonly AlertView[] = ['open', 'dismissed', 'cleared'];

function viewFromParam(v: string | null): AlertView {
  return (VIEWS as readonly string[]).includes(v ?? '') ? (v as AlertView) : 'open';
}

const EMPTY: Record<AlertView, { title: string; description: string }> = {
  open: {
    title: 'Nothing needs a person',
    description: 'Every alert has cleared. New ones reach every admin’s phone the moment they appear.',
  },
  dismissed: {
    title: 'Nothing is hidden',
    description: 'An alert you hide waits here until its problem is fixed, then moves to Cleared.',
  },
  cleared: {
    title: 'Nothing cleared this week',
    description: 'Alerts that were fixed or marked as seen in the last seven days are listed here.',
  },
};

/**
 * Everything that needs a person, across every outlet — the list behind every
 * alert pushed to an admin's phone.
 *
 * The server decides what is on it and takes things off it: a refused password
 * clears the first time the outlet signs in again, a waiting dealer clears when
 * someone replies. So this page has one job beyond showing the list — hiding
 * what a person already knows about and cannot fix today, so the list stays a
 * list of things to do.
 *
 * The view lives in the URL (`?view=dismissed`), so Back and a shared link
 * land on the same tab.
 */
export function AlertsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const view = viewFromParam(search.get('view'));
  const q = useAdminAlertsQuery(view);
  const dismiss = useDismissAlert();
  const restore = useRestoreAlert();
  const busy = useBusyIds();
  const [now, setNow] = React.useState(() => Date.now());

  // Ages are relative ("12m"); keep them honest on a page left open all morning.
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const counts = q.data?.counts;
  const items = q.data?.items ?? [];

  function setView(next: AlertView) {
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === 'open') params.delete('view');
        else params.set('view', next);
        return params;
      },
      { replace: true },
    );
  }

  function onHide(alert: AdminAlert) {
    void busy.run(alert.id, async () => {
      try {
        await dismiss.mutateAsync(alert.id);
        toast.success(
          isEventAlert(alert) ? 'Marked as seen.' : 'Hidden. It moves to Cleared on its own once it is fixed.',
        );
      } catch (e) {
        toast.error((e as Error).message || 'That did not go through.');
      }
    });
  }

  function onRestore(alert: AdminAlert) {
    void busy.run(alert.id, async () => {
      try {
        await restore.mutateAsync(alert.id);
        toast.success('Back on the list.');
      } catch (e) {
        toast.error((e as Error).message || 'That did not go through.');
      }
    });
  }

  const empty = EMPTY[view];

  return (
    <div>
      <PageHeader
        title="Alerts"
        subtitle="Everything that needs a person, across every outlet. Each alert clears itself once the problem is fixed."
        tools={
          <RefreshTool
            label="Refresh the alerts"
            loading={q.isRefetching}
            onRefresh={() => void q.refetch()}
          />
        }
      />

      <SegmentedControl<AlertView>
        aria-label="Which alerts"
        value={view}
        onChange={setView}
        className="mb-3"
        options={[
          { value: 'open', label: counts ? `To do (${counts.open})` : 'To do' },
          { value: 'dismissed', label: counts ? `Hidden (${counts.dismissed})` : 'Hidden' },
          { value: 'cleared', label: 'Cleared' },
        ]}
      />

      <DataList<AdminAlert>
        rows={items}
        rowKey={(a) => a.id}
        loading={q.isLoading}
        cardVariant="rows"
        onRowClick={(a) => {
          if (opensSomewhere(a)) navigate(a.href);
        }}
        empty={
          <EmptyState
            icon={
              view === 'open' ? (
                <CheckCircle2 width={24} height={24} strokeWidth={1.75} />
              ) : view === 'dismissed' ? (
                <EyeOff width={24} height={24} strokeWidth={1.75} />
              ) : (
                <BellOff width={24} height={24} strokeWidth={1.75} />
              )
            }
            title={empty.title}
            description={q.isError ? 'The alerts could not be loaded. Refresh to try again.' : empty.description}
          />
        }
        columns={[
          {
            id: 'when',
            header: view === 'cleared' ? 'Cleared' : 'Since',
            mobile: 'secondary',
            width: '6.5rem',
            cell: (a) => (
              <Badge intent={view === 'open' ? 'warning' : 'neutral'}>{alertAge(a, now)}</Badge>
            ),
          },
          {
            id: 'what',
            header: 'What needs doing',
            mobile: 'primary',
            cell: (a) => (
              <div className="min-w-0">
                <p className="break-words font-medium text-text">{a.title}</p>
                <p className="mt-0.5 break-words text-sm text-text-muted">{a.body}</p>
                <p className="mt-1 text-xs text-text-subtle">
                  {view === 'dismissed'
                    ? `${hiddenBy(a)} · ${ADMIN_ALERT_KIND_INFO[a.kind].clearsWhen}`
                    : view === 'cleared'
                      ? howItCleared(a)
                      : ADMIN_ALERT_KIND_INFO[a.kind].clearsWhen}
                </p>
              </div>
            ),
          },
        ]}
        // `rowActions`, not `cardActions`: a card with `onRowClick` renders as
        // one button, and only `rowActions` stops the tap reaching the row.
        rowActions={(a) =>
          view === 'open' ? (
            <Button size="sm" variant="secondary" loading={busy.isBusy(a.id)} onClick={() => onHide(a)}>
              {hideLabel(a)}
            </Button>
          ) : view === 'dismissed' ? (
            <Button size="sm" variant="secondary" loading={busy.isBusy(a.id)} onClick={() => onRestore(a)}>
              Show again
            </Button>
          ) : null
        }
      />
    </div>
  );
}
