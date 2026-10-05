import { AlertTriangle } from 'lucide-react';

import { Badge, Card, CardContent } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { LoadPlan } from '@dk/shared';

import {
  headlineStyle,
  headlineTone,
  planAgeNote,
  statusChipIntent,
  statusChipLabel,
  stockAsOfLine,
  warningsHeading,
} from './format';

/**
 * The top of the pane: the one line an admin opened it to read, coloured by how
 * much it matters, with the status chip and the warnings an admin must read
 * BEFORE the Approve button — see the pane's own header for why warnings sit
 * here and not lower.
 */
export function HeadlineBanner({ plan, todayYmd }: { plan: LoadPlan; todayYmd: string }) {
  const style = headlineStyle(headlineTone(plan));
  const age = planAgeNote(plan.businessDate, todayYmd);

  return (
    <div className="grid gap-3">
      <Card className={cn(style.borderClass, style.bgClass)}>
        <CardContent className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge intent={statusChipIntent(plan.status)}>{statusChipLabel(plan.status)}</Badge>
            <span className="text-sm text-text-muted">{stockAsOfLine(plan.businessDate)}</span>
          </div>
          <div>
            <p className={cn('text-lg font-semibold', style.textClass)}>{plan.headline.en}</p>
            <p className="mt-0.5 text-sm text-text-muted" lang="hi">
              {plan.headline.hi}
            </p>
          </div>
          {age ? <p className="text-sm text-text-muted">{age}</p> : null}
        </CardContent>
      </Card>

      {plan.warnings.length > 0 ? (
        <Card className="border-warning/40 bg-warning-soft/40">
          <CardContent className="grid gap-1.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-warning-strong md:text-warning">
              <AlertTriangle width={15} height={15} strokeWidth={1.75} className="shrink-0" aria-hidden />
              {warningsHeading(plan.warnings.length)}
            </p>
            <ul className="grid list-disc gap-1 pl-5 text-sm text-text">
              {plan.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
