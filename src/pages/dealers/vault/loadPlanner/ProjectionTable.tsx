import { Card, CardContent, CardHeader, MobileCardList, Table, TBody, TD, TH, THead, TRow } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { LoadPlan } from '@dk/shared';

import { projectionRows } from './format';

/**
 * What to order on each of the next four days — the projection the dealer gives
 * IndianOil, which takes four days and no further. Every day has a row, the
 * days with nothing to order included, and beside it how many days each fuel
 * will have left that morning, so "No order" can be checked at a glance.
 *
 * Absent for a plan made before projections existed: its trucks are still in
 * "The truck" and "Then" above.
 */
export function ProjectionTable({ plan }: { plan: LoadPlan }) {
  const isMd = useMediaQuery('(min-width: 768px)');
  if (!plan.projection || plan.projection.length === 0) return null;
  const rows = projectionRows(plan.projection);
  const n = plan.projection.length;

  return (
    <Card>
      <CardHeader>
        <p className="text-base font-semibold text-text">Next {n} days</p>
        <p className="text-sm text-text-muted">
          What to order each day — the projection IndianOil takes, {n} days ahead and no further.
        </p>
      </CardHeader>
      <CardContent padding={isMd ? 'none' : 'default'} className="md:p-4">
        {isMd ? (
          <Table minWidth="40rem">
            <THead>
              <TRow>
                <TH>Day</TH>
                <TH>Order</TH>
                {plan.pools.map((p) => (
                  <TH key={p.key} className="text-right">
                    {p.label} — days left
                  </TH>
                ))}
              </TRow>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TRow key={r.key} className={r.ordering ? 'bg-warning-soft/40' : ''}>
                  <TD className="font-medium">
                    {r.dayLabel}
                    {r.depotClosed ? <span className="ml-1.5 text-xs font-semibold text-warning">Depot closed</span> : null}
                  </TD>
                  <TD className={r.ordering ? 'font-medium' : 'text-text-muted'}>{r.orderLine}</TD>
                  {plan.pools.map((p) => (
                    <TD key={p.key} className="text-right tabular-nums">
                      {r.daysLeft[p.key] ?? '—'}
                    </TD>
                  ))}
                </TRow>
              ))}
            </TBody>
          </Table>
        ) : (
          <MobileCardList
            cards={rows.map((r) => ({
              key: r.key,
              primary: (
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-text">{r.dayLabel}</span>
                  {r.depotClosed ? (
                    <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                      Depot closed
                    </span>
                  ) : null}
                </span>
              ),
              secondary: r.orderLine,
              kv: plan.pools.map((p) => ({ label: `${p.label} — days left`, value: r.daysLeft[p.key] ?? '—', numeric: true })),
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}
