import { CheckCircle2, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, EmptyState, RefreshTool, SegmentedControl } from '@/components/ui';
import {
  useWorkPermitsList,
  useWorkPermitsLive,
  type WorkPermitsListView,
} from '@/hooks/api/useWorkPermits';
import { PermitDrawer } from '@/pages/dealers/vault/workPermits/PermitDrawer';
import { PermitsTable } from '@/pages/dealers/vault/workPermits/PermitsTable';

const VIEWS: readonly WorkPermitsListView[] = ['active', 'attention', 'all'];

function viewFromParam(v: string | null): WorkPermitsListView {
  return VIEWS.find((x) => x === v) ?? 'active';
}

const EMPTY_WORDS: Record<WorkPermitsListView, { title: string; description: string }> = {
  active: { title: 'No active permits', description: 'No engineer is working under a permit MDG issued right now.' },
  attention: { title: 'Nothing stuck', description: 'No permit needs a person right now.' },
  all: { title: 'No work permits yet', description: 'Permits appear here once a dealer asks for one in the chat.' },
};

/**
 * Every outlet's work permits in one place (ADR 0053). Active shows what is on SDMS or
 * being asked; Needs attention shows what a person has to settle. The tab lives in the
 * URL, so Back and a shared link land on the same list. A row opens the same drawer as
 * the outlet's pane, with a link to that pane.
 */
export function WorkPermitsPage() {
  const [search, setSearch] = useSearchParams();
  const view = viewFromParam(search.get('view'));
  const dealerId = search.get('dealerId') ?? undefined;
  const q = useWorkPermitsList(view, dealerId);
  useWorkPermitsLive();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const counts = q.data?.counts;
  const rows = q.data?.rows ?? [];
  const selected = rows.find((r) => r.id === openId) ?? null;
  const failed = q.isError && !q.data;
  const dealerCode = dealerId ? rows[0]?.dealerCode : undefined;

  function setParam(key: string, value: string | null) {
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        if (value === null || (key === 'view' && value === 'active')) params.delete(key);
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
        title="Work permits"
        subtitle={
          counts
            ? `Non-Critical work permits MDG issues on IndianOil’s SDMS from the dealer’s chat. ${counts.today} today.`
            : 'Non-Critical work permits MDG issues on IndianOil’s SDMS from the dealer’s chat.'
        }
        tools={
          <RefreshTool
            label="Refresh the work permits"
            loading={q.isRefetching}
            onRefresh={() => void q.refetch()}
          />
        }
      />

      <SegmentedControl<WorkPermitsListView>
        aria-label="Which work permits"
        value={view}
        onChange={(v) => setParam('view', v)}
        className="mb-3"
        options={[
          { value: 'active', label: label('Active', counts?.active) },
          { value: 'attention', label: label('Needs attention', counts?.attention) },
          { value: 'all', label: 'All' },
        ]}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
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

      <PermitsTable
        rows={rows}
        now={now}
        showOutlet
        loading={q.isPending}
        onOpen={(r) => setOpenId(r.id)}
        empty={
          failed ? (
            <EmptyState
              icon={<TriangleAlert width={24} height={24} strokeWidth={1.75} />}
              title="Could not load the work permits"
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
                view === 'attention' ? (
                  <CheckCircle2 width={24} height={24} strokeWidth={1.75} />
                ) : (
                  <ShieldCheck width={24} height={24} strokeWidth={1.75} />
                )
              }
              title={EMPTY_WORDS[view].title}
              description={EMPTY_WORDS[view].description}
            />
          )
        }
      />

      <PermitDrawer row={selected} onClose={() => setOpenId(null)} showOutletLink />
    </div>
  );
}
