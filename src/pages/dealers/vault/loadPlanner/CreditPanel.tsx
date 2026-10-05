import { Truck } from 'lucide-react';

import { Card, CardContent, CardHeader, EmptyState, KeyValueList } from '@/components/ui';
import type { LoadPlan } from '@dk/shared';

import { creditBoxLines, inTransitLine, leadTimeSettingLine, measuredLeadTimeLine, poolLabelMap } from './format';

/** What is already on the road, whether credit covers the next truck, and how
 *  long a truck actually takes to unload once ordered — three facts an admin
 *  needs before pressing Approve, none of them decided by this plan's own
 *  arithmetic. */
export function CreditPanel({ plan }: { plan: LoadPlan }) {
  const labels = poolLabelMap(plan.pools);
  const credit = creditBoxLines(plan.credit);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card>
        <CardHeader>
          <p className="text-base font-semibold text-text">On the way</p>
          <p className="text-sm text-text-muted">Invoiced, not yet unloaded.</p>
        </CardHeader>
        <CardContent>
          {plan.inTransit.length === 0 ? (
            <EmptyState
              icon={<Truck width={22} height={22} strokeWidth={1.75} />}
              title="Nothing on the road"
              description="No invoiced tanker is waiting to be unloaded right now."
            />
          ) : (
            <ul className="grid gap-1.5 text-sm text-text">
              {plan.inTransit.map((item, i) => (
                <li key={`${item.invoiceNo}-${i}`} className="min-w-0 break-words">
                  {inTransitLine(item, labels)}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <p className="text-base font-semibold text-text">Credit</p>
          <p className="text-sm text-text-muted">Whether this dealer&apos;s credit covers the recommended truck.</p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <KeyValueList
            items={[
              { key: 'available', label: 'Available', value: credit.available },
              { key: 'due', label: 'Due', value: credit.due },
              { key: 'truckCost', label: 'This truck', value: credit.truckCost },
              { key: 'deposit', label: 'Deposit needed', value: credit.deposit },
            ]}
          />
          <div className="border-t border-border pt-3">
            <p className="text-sm text-text">
              Invoice to unloading: <span className="font-medium">{measuredLeadTimeLine(plan.leadTime)}</span>
            </p>
            <p className="mt-0.5 text-sm text-text-muted">{leadTimeSettingLine(plan.settings.leadTimeDays)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
