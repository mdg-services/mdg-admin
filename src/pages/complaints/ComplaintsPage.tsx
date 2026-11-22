import { CheckCircle2, TriangleAlert, Wrench, X } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  Badge,
  Button,
  EmptyState,
  RefreshTool,
  SegmentedControl,
  Select,
} from '@/components/ui';
import { useComplaintsList, useComplaintsLive, type ComplaintsListView } from '@/hooks/api/useComplaints';
import { ComplaintDrawer } from '@/pages/dealers/vault/complaints/ComplaintDrawer';
import { ComplaintsTable } from '@/pages/dealers/vault/complaints/ComplaintsTable';
import { ROUTE_LABELS, ROUTE_ORDER } from '@/pages/dealers/vault/complaints/format';
import { COMPLAINT_ROUTES, type ComplaintRoute } from '@dk/shared';

const VIEWS: readonly ComplaintsListView[] = ['open', 'needs_ack', 'attention', 'portal', 'all'];

function viewFromParam(v: string | null): ComplaintsListView {
  return VIEWS.find((x) => x === v) ?? 'open';
}
function routeFromParam(v: string | null): ComplaintRoute | undefined {
  return COMPLAINT_ROUTES.find((x) => x === v);
}

const EMPTY_WORDS: Record<ComplaintsListView, { title: string; description: string }> = {
  open: { title: 'No open complaints', description: 'Everything dealers raised is closed or was never filed.' },
  needs_ack: {
    title: 'Nobody to ask',
    description: 'No complaint is waiting for the dealer to say whether it works now.',
  },
  attention: { title: 'Nothing stuck', description: 'No complaint needs a person right now.' },
  portal: {
    title: 'Nothing found on the portals',
    description: 'No complaint was found on the portals that was not raised from the chat.',
  },
  all: { title: 'No complaints yet', description: 'Complaints appear here once a dealer raises one or the robot finds one.' },
};

/**
 * Every outlet's maintenance complaints in one place (ADR 0052). The question this page
 * answers is "what is stuck, and who owes the next step": complaints that need a person,
 * the ones waiting on a dealer's "is it working now?", and the ones the robot found on
 * the portals that nobody raised from the chat (the dealer is never told about those).
 *
 * The view, the portal and an outlet filter live in the URL, so Back and a shared link
 * land on the same list. A row opens the same drawer as the outlet's pane; from there
 * the outlet's own pane is one link away.
 */
export function ComplaintsPage() {
  const [search, setSearch] = useSearchParams();
  const view = viewFromParam(search.get('view'));
  const route = routeFromParam(search.get('route'));
  const dealerId = search.get('dealerId') ?? undefined;
  const q = useComplaintsList(view, route, dealerId);
  useComplaintsLive();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const counts = q.data?.counts;
  const rows = q.data?.rows ?? [];
  const selected = rows.find((r) => r.id === openId) ?? null;
  // A failed request is not an empty list: "Nothing stuck" under an error is the one
  // thing this page cannot say wrongly.
  const failed = q.isError && !q.data;
  const dealerCode = dealerId ? rows[0]?.dealerCode : undefined;

  function setParam(key: string, value: string | null) {
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        if (value === null || (key === 'view' && value === 'open')) params.delete(key);
        else params.set(key, value);
        return params;
      },
      { replace: true },
    );
  }

  const label = (name: string, n: number | undefined) => (n === undefined ? name : `${name} (${n})`);

  return (
    <div>
      <PageHeader
        title="Complaints"
        subtitle="Maintenance complaints filed and followed on IndianOil’s portals for the dealers. Filing and acknowledging happen only on the dealer’s yes in the chat."
        tools={
          <RefreshTool
            label="Refresh the complaints"
            loading={q.isRefetching}
            onRefresh={() => void q.refetch()}
          />
        }
      />

      <SegmentedControl<ComplaintsListView>
        aria-label="Which complaints"
        value={view}
        onChange={(v) => setParam('view', v)}
        className="mb-3"
        options={[
          { value: 'open', label: label('Open', counts?.open) },
          { value: 'needs_ack', label: label('Needs ack', counts?.needsAck) },
          { value: 'attention', label: label('Attention', counts?.attention) },
          { value: 'portal', label: label('Found on portal', counts?.portalOnly) },
          { value: 'all', label: 'All' },
        ]}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64">
          <Select
            aria-label="Which complaint system"
            value={route ?? ''}
            onChange={(e) => setParam('route', e.target.value || null)}
          >
            <option value="">All four systems</option>
            {ROUTE_ORDER.map((r) => (
              <option key={r} value={r}>
                {ROUTE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        {dealerId ? (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<X width={14} height={14} strokeWidth={1.75} />}
            onClick={() => setParam('dealerId', null)}
          >
            Only outlet {dealerCode ?? ''} · show all
          </Button>
        ) : null}
        {q.data && q.data.total > rows.length ? (
          <Badge intent="neutral">
            Showing {rows.length} of {q.data.total}
          </Badge>
        ) : null}
      </div>

      <ComplaintsTable
        rows={rows}
        now={now}
        showOutlet
        loading={q.isPending}
        onOpen={(r) => setOpenId(r.id)}
        empty={
          failed ? (
            <EmptyState
              icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
              title="Could not load the complaints"
              description="This does not mean there are none. Check the connection and try again."
              cta={
                <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={
                view === 'attention' || view === 'needs_ack' ? (
                  <CheckCircle2 width={24} height={24} strokeWidth={1.75} />
                ) : (
                  <Wrench width={24} height={24} strokeWidth={1.75} />
                )
              }
              title={EMPTY_WORDS[view].title}
              description={EMPTY_WORDS[view].description}
            />
          )
        }
      />

      <ComplaintDrawer row={selected} onClose={() => setOpenId(null)} showOutletLink />
    </div>
  );
}
