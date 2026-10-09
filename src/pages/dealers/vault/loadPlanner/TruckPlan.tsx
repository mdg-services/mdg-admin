import { Truck } from 'lucide-react';

import { Card, CardContent, CardHeader, EmptyState } from '@/components/ui';
import type { LoadPlan, LoadPlanTruck } from '@dk/shared';

import { chamberTiles, estimatedCostLine, nextTruckLine, planWindowDays, poolLabelMap, truckDatesLine } from './format';

/**
 * The recommended truck — the reason this plan exists — and a plain sketch of
 * the ones after it.
 *
 * One tile per chamber, not one row: a chamber is a physical compartment of the
 * tanker, and a grid of three boxes reads as "the tanker" in a way a three-row
 * table does not. `min-w-0` on every tile is load-bearing, not decorative — a
 * grid track sized by its content overflows a constrained card at 375px and
 * `main` clips the overflow with no scrollbar to recover it (the same trap the
 * TT Density hero was built to avoid).
 */
export function TruckPlan({ plan }: { plan: LoadPlan }) {
  const labels = poolLabelMap(plan.pools);
  const windowDays = planWindowDays(plan);

  return (
    <div className="grid gap-3">
      <Card>
        <CardHeader>
          <p className="text-base font-semibold text-text">The truck</p>
          {plan.truck ? (
            <p className="text-sm text-text-muted">{truckDatesLine(plan.truck)}</p>
          ) : (
            <p className="text-sm text-text-muted">Nothing recommended in the next {windowDays} days.</p>
          )}
        </CardHeader>
        <CardContent>
          {plan.truck ? (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {chamberTiles(plan.truck.chambers, labels).map((tile) => (
                  <div
                    key={tile.key}
                    className="min-w-0 rounded-md border border-border bg-surface-2 p-3"
                  >
                    <p className="min-w-0 break-words text-sm font-semibold text-text">
                      {tile.fuelLabel}
                    </p>
                    {!tile.empty ? (
                      <>
                        <p className="mt-0.5 text-sm text-text-muted">
                          {tile.litresLabel} · {tile.tankLabel}
                        </p>
                        <p className="mt-1 min-w-0 break-words text-xs text-text-subtle">{tile.why}</p>
                      </>
                    ) : (
                      <p className="mt-1 min-w-0 break-words text-xs text-text-subtle">{tile.why}</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm text-text-muted">
                Estimated cost: <span className="font-medium text-text">{estimatedCostLine(plan.truck.estimatedCost)}</span>
              </p>
            </>
          ) : (
            <EmptyState
              icon={<Truck width={24} height={24} strokeWidth={1.75} />}
              title={`No order needed in the next ${windowDays} days`}
              description={`Every fuel has enough spare to last the next ${windowDays} days at the normal rate.`}
            />
          )}
        </CardContent>
      </Card>

      {plan.nextTrucks.length > 0 ? (
        <Card>
          <CardHeader>
            <p className="text-base font-semibold text-text">Then</p>
            <p className="text-sm text-text-muted">The trucks after this one, over the next {windowDays} days.</p>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 text-sm text-text">
              {plan.nextTrucks.map((t: LoadPlanTruck, i) => (
                <li key={`${t.orderOn}-${i}`} className="min-w-0 break-words">
                  {nextTruckLine(t, labels)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
