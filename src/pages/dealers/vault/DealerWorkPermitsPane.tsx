import {
  AlertCircle,
  DownloadCloud,
  MessageCircleQuestion,
  Plug,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  useCheckWorkPermitsNow,
  useWorkPermitsDealerView,
  useWorkPermitsLive,
} from '@/hooks/api/useWorkPermits';
import { ApiError } from '@/lib/api';
import { StatTile, StatTileRow, StatTileSkeletons } from '@/pages/dataVault/StatTile';
import { dealerCodeLabel } from '@dk/shared';

import { isDraftStage, isLiveOnSdms } from './workPermits/format';
import { PermitDrawer } from './workPermits/PermitDrawer';
import { PermitsTable } from './workPermits/PermitsTable';
import { LetterheadCard, PeopleCard } from './workPermits/SetupCards';
import { useWorkPermitsRunWatcher } from './workPermits/useWorkPermitsRunWatcher';
import type { DealerVaultPaneProps } from './types';

/**
 * An outlet's work permits (ADR 0053): the Non-Critical permits MDG issues on SDMS
 * from the dealer's chat, where each stands, who signs for the outlet, and how the
 * Letter of Authorization is made. Reads top to bottom: the counts, the people and the
 * letterhead, then the permits, and in a drawer the whole story of one.
 *
 * "Check now" reads SDMS's list and presses nothing. Issuing and closing happen on the
 * dealer's own words in the chat; the buttons here record what a person saw on SDMS
 * or ask the robot to close an open permit.
 */
export function DealerWorkPermitsPane({ dealer }: DealerVaultPaneProps) {
  const toast = useToast();
  const viewQ = useWorkPermitsDealerView(dealer.id);
  useWorkPermitsLive(dealer.id);
  const check = useCheckWorkPermitsNow(dealer.id);
  const watcher = useWorkPermitsRunWatcher(dealer.id);
  const busy = check.isPending || watcher.busy;
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  function runCheck() {
    check.mutate(undefined, {
      onSuccess: (res) => {
        const { outcome, reason, runId } = res.start;
        if (outcome === 'not_started') {
          toast.error(reason || 'The check did not start.');
          return;
        }
        watcher.watch(runId);
        toast.success('Checking. SDMS takes a minute or two; this section refreshes when it is done.');
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Could not start the check'),
    });
  }

  if (viewQ.isLoading) {
    return (
      <div className="grid gap-3 md:gap-4">
        <StatTileSkeletons count={3} />
        <Card>
          <CardContent className="grid gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (viewQ.isError && !viewQ.data) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load the work permits"
        description={viewQ.error instanceof ApiError ? viewQ.error.message : 'Please try again.'}
        cta={
          <Button variant="secondary" size="sm" onClick={() => void viewQ.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const view = viewQ.data!;
  if (!view.attached && view.rows.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Plug width={28} height={28} strokeWidth={1.75} />}
            title={`Work permits are not set up for ${dealerCodeLabel(dealer.code)}`}
            description="Attach Work permits from the Services tab. The outlet’s permits then show here."
          />
        </CardContent>
      </Card>
    );
  }

  const live = view.rows.filter((r) => isLiveOnSdms(r.stage)).length;
  const waiting = view.rows.filter((r) => isDraftStage(r.stage)).length;
  const attention = view.rows.filter((r) => r.attention).length;
  const selected = view.rows.find((r) => r.id === openId) ?? null;

  return (
    <div className="grid gap-3 md:gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text">Work permits</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Outlet {dealerCodeLabel(dealer.code)} ·{' '}
            {view.attached ? (view.serviceActive ? 'Service on' : 'Service attached, not active') : 'Not attached'}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={busy}
          disabled={!view.attached}
          leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
          onClick={runCheck}
        >
          Check now
        </Button>
      </div>

      {viewQ.isError ? (
        <Callout>
          Could not refresh just now. This is the last list that loaded.{' '}
          <button type="button" className="underline" onClick={() => void viewQ.refetch()}>
            Try again
          </button>
        </Callout>
      ) : null}

      {view.attached && !view.serviceActive ? (
        <Callout>
          The Work permits service is not active for this outlet, so no permit is issued for the dealer. Switch
          it on from the Services tab.
        </Callout>
      ) : null}

      <StatTileRow>
        <StatTile
          label="On SDMS now"
          value={live}
          tone="neutral"
          icon={<ShieldCheck width={16} height={16} strokeWidth={1.75} />}
          hint={`of ${view.rows.length} kept`}
        />
        <StatTile
          label="Waiting for the dealer"
          value={waiting}
          tone="warning"
          icon={<MessageCircleQuestion width={16} height={16} strokeWidth={1.75} />}
          hint={waiting > 0 ? 'A question or a yes' : 'Nothing waiting'}
        />
        <StatTile
          label="Needs attention"
          value={attention}
          tone="danger"
          icon={<TriangleAlert width={16} height={16} strokeWidth={1.75} />}
          hint={attention > 0 ? 'A person has to settle these' : 'Nothing stuck'}
        />
      </StatTileRow>

      <PeopleCard view={view} />
      <LetterheadCard dealerId={dealer.id} view={view} />

      <Card>
        <CardContent padding="none" className="md:p-4">
          <CardHeader align="center" padding="comfortable">
            <p className="text-base font-semibold text-text">Permits</p>
            <p className="text-sm text-text-muted">Newest first. Tap one for its whole story.</p>
          </CardHeader>
          <PermitsTable
            rows={view.rows}
            now={now}
            onOpen={(r) => setOpenId(r.id)}
            empty={
              <EmptyState
                icon={<ShieldCheck width={24} height={24} strokeWidth={1.75} />}
                title="No work permits yet"
                description="When the dealer says an engineer has come to work, the permit shows here."
              />
            }
          />
        </CardContent>
      </Card>

      <PermitDrawer row={selected} onClose={() => setOpenId(null)} />
    </div>
  );
}
