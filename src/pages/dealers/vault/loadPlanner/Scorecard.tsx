import { Card, CardContent, CardHeader } from '@/components/ui';
import type { LoadPlanScorecard } from '@dk/shared';

import {
  dryMorningLines,
  forecastMissLines,
  scorecardOrdersLine,
  scorecardWindowLabel,
  spareAtArrivalLines,
} from './format';

function PoolLineList({ lines }: { lines: { key: string; label: string; value: string }[] }) {
  if (lines.length === 0) {
    return <p className="text-sm text-text-subtle">No fuel to report on yet.</p>;
  }
  return (
    <ul className="grid gap-1 text-sm">
      {lines.map((l) => (
        <li key={l.key} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 break-words text-text-muted">{l.label}</span>
          <span className="shrink-0 font-medium text-text">{l.value}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The planner's own report card over the last 30 days — how it did, not how the
 * dealer did. Every figure here is about the PLAN's accuracy and whether it was
 * acted on, never about blaming a dry morning on the dealer.
 */
export function Scorecard({ scorecard, poolLabels }: { scorecard: LoadPlanScorecard; poolLabels: Record<string, string> }) {
  const orders = scorecardOrdersLine(scorecard);

  return (
    <Card>
      <CardHeader>
        <p className="text-base font-semibold text-text">How the planner has done</p>
        <p className="text-sm text-text-muted">{scorecardWindowLabel(scorecard)}</p>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-text">Orders on time</p>
          <p className="mt-1 text-sm text-text">{orders.summary}</p>
          {orders.detail ? <p className="text-sm text-text-muted">{orders.detail}</p> : null}
        </div>
        <div>
          <p className="text-sm font-semibold text-text">Mornings at the low-stock line</p>
          <div className="mt-1">
            <PoolLineList lines={dryMorningLines(scorecard, poolLabels)} />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-text">Sale forecast</p>
          <div className="mt-1">
            <PoolLineList lines={forecastMissLines(scorecard, poolLabels)} />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-text">Spare when the tanker landed</p>
          <div className="mt-1">
            <PoolLineList lines={spareAtArrivalLines(scorecard, poolLabels)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
