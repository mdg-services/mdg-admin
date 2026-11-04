import { ChevronRight, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge, Card, CardContent, Skeleton } from '@/components/ui';
import { useAiHolds } from '@/hooks/api/useAiCheck';
import { formatDateTime, formatYmd } from '@/lib/format';
import { dealerCodeLabel, type AiHoldItem } from '@dk/shared';

/** Where a held report is read and ticked. */
function hrefFor(item: AiHoldItem): string {
  return item.kind === 'dsr'
    ? `/dsr/dealers/${item.dealerId}?report=${item.reportId}`
    : `/dealers/${item.dealerId}?tab=credit-dod`;
}

/**
 * Every report the AI check is holding, across outlets (ADR 0031).
 *
 * A held report is one nobody can send until a person has looked, so a list of
 * them is a list of dealers waiting. Each row says what is wrong in the AI's
 * own headline and takes the admin to the report, where the problems are read
 * and ticked. Renders nothing when nothing is held — the page below it already
 * says "nothing is being withheld" in its own words.
 */
export function AiHoldsSection() {
  const q = useAiHolds(100);
  const rows = q.data ?? [];

  if (q.isLoading) return <Skeleton className="mb-4 h-20 w-full" />;
  if (q.isError || rows.length === 0) return null;

  return (
    <Card className="mb-4 border-2 border-danger md:mb-6">
      <div className="flex items-start gap-3 bg-danger-strong px-4 py-3 text-white md:bg-danger">
        <ShieldAlert width={24} height={24} strokeWidth={2} className="shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-base font-bold">
            The AI is holding {rows.length === 1 ? 'one report' : `${rows.length} reports`}
          </p>
          <p className="text-sm text-white/95">
            None of these goes to the dealer until a person opens it and ticks what the AI found.
          </p>
        </div>
      </div>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {rows.map((item) => (
            <li key={`${item.kind}:${item.reportId}`}>
              <Link
                to={hrefFor(item)}
                className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text">
                      {item.outletCode ? dealerCodeLabel(item.outletCode) : 'Outlet'}
                    </span>
                    <span className="text-xs text-text-subtle">
                      {item.kind === 'dsr' ? 'DSR' : 'Credit & DOD'}
                      {item.date ? ` · ${formatYmd(item.date)}` : ''}
                    </span>
                    {item.state === 'COULD_NOT_CHECK' ? (
                      <Badge intent="warning">AI could not check</Badge>
                    ) : (
                      <Badge intent="danger">{item.problems === 1 ? '1 to check' : `${item.problems} to check`}</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-text">{item.headline}</p>
                  {item.finishedAt ? (
                    <p className="text-xs text-text-subtle">Checked {formatDateTime(item.finishedAt)}</p>
                  ) : null}
                </div>
                <ChevronRight width={16} height={16} strokeWidth={1.75} className="shrink-0 text-text-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
