import { AlertCircle, Fuel, Plug } from 'lucide-react';

import { Button, Card, CardContent, EmptyState, Skeleton, useToast } from '@/components/ui';
import { useRunNow } from '@/hooks/api/useDealerServices';
import { useLoadPlannerOverview } from '@/hooks/api/useLoadPlanner';
import { ApiError } from '@/lib/api';
import { istTodayYmd } from '@/lib/format';
import { dealerCodeLabel } from '@dk/shared';

import { CardActions } from './loadPlanner/CardActions';
import { CreditPanel } from './loadPlanner/CreditPanel';
import { poolLabelMap } from './loadPlanner/format';
import { FuelTable } from './loadPlanner/FuelTable';
import { HeadlineBanner } from './loadPlanner/HeadlineBanner';
import { HistoryTable } from './loadPlanner/HistoryTable';
import { ProjectionTable } from './loadPlanner/ProjectionTable';
import { Scorecard } from './loadPlanner/Scorecard';
import { TanksTable } from './loadPlanner/TanksTable';
import { TruckPlan } from './loadPlanner/TruckPlan';
import { useLoadPlannerRunWatcher } from './loadPlanner/useLoadPlannerRunWatcher';
import type { DealerVaultPaneProps } from './types';

/**
 * A dealer's Load Planner: when to order the next tanker, which fuel goes in
 * each chamber, and which tank it is unloaded into.
 *
 * TOP TO BOTTOM IS THE ORDER OF A DECISION, NOT A MENU. An admin opening this
 * pane is usually about to decide whether to send the plan — the headline and
 * the warnings come first because the warnings have to be read BEFORE the
 * Approve button is pressed, not discovered after. Everything from the fuel
 * table down is the evidence for the headline; the card and the actions sit
 * near the bottom because sending is the LAST step, after the figures above it
 * have been read; the scorecard and history close the pane because they are
 * about the planner's own track record, not about today's decision.
 */
export function DealerLoadPlannerPane({ dealer }: DealerVaultPaneProps) {
  const toast = useToast();
  const overviewQ = useLoadPlannerOverview(dealer.id);
  const runNow = useRunNow(dealer.id);
  const runWatch = useLoadPlannerRunWatcher(dealer.id);

  if (overviewQ.isLoading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (overviewQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load the Load Planner"
        description={overviewQ.error instanceof ApiError ? overviewQ.error.message : 'Please try again.'}
        cta={
          <Button variant="secondary" size="sm" onClick={() => void overviewQ.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const overview = overviewQ.data!;

  if (!overview.attached) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Plug width={28} height={28} strokeWidth={1.75} />}
            title={`Load Planner is not set up for ${dealerCodeLabel(dealer.code)}`}
            description="Attach it from the Services tab and this pane fills in."
          />
        </CardContent>
      </Card>
    );
  }

  function onRunNow() {
    if (!overview.dealerServiceId) return;
    runNow.mutate(
      { dsId: overview.dealerServiceId },
      {
        onSuccess: (res) => {
          runWatch.watch(res.runId);
          toast.success('Running — this takes a few seconds. The pane refreshes when it lands.');
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not start the run'),
      },
    );
  }

  if (!overview.latest) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Fuel width={28} height={28} strokeWidth={1.75} />}
            title="No plan has been made yet"
            description={`Run the Load Planner for ${dealerCodeLabel(dealer.code)} and its first recommendation appears here.`}
            cta={
              <Button
                size="sm"
                loading={runNow.isPending || runWatch.busy}
                disabled={!overview.dealerServiceId}
                onClick={onRunNow}
              >
                Run now
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const plan = overview.latest;
  const poolLabels = poolLabelMap(plan.pools);

  return (
    <div className="grid gap-4">
      <HeadlineBanner plan={plan} todayYmd={istTodayYmd()} />
      <TruckPlan plan={plan} />
      <ProjectionTable plan={plan} />
      <FuelTable pools={plan.pools} />
      <TanksTable tanks={plan.pools.flatMap((p) => p.tanks)} />
      <CreditPanel plan={plan} />
      <CardActions dealer={dealer} plan={plan} dealerServiceId={overview.dealerServiceId} />
      <Scorecard scorecard={overview.scorecard} poolLabels={poolLabels} />
      <HistoryTable history={overview.history} />
    </div>
  );
}
