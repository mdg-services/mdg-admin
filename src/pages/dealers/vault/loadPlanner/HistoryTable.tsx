import { History } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  MobileCardList,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { LoadPlanSummary } from '@dk/shared';

import { historyRow } from './format';

/** The last 30 plans, newest first — what was decided each morning and whether
 *  it held up. A backfilled row is marked rather than hidden: it is real
 *  history (the planner's arithmetic replayed over a day nobody saw at the
 *  time), it just never asked anyone to act on it. */
export function HistoryTable({ history }: { history: LoadPlanSummary[] }) {
  const isMd = useMediaQuery('(min-width: 768px)');

  return (
    <Card>
      <CardHeader>
        <p className="text-base font-semibold text-text">History</p>
        <p className="text-sm text-text-muted">The last {history.length} plans, newest first.</p>
      </CardHeader>
      <CardContent padding={isMd && history.length > 0 ? 'none' : 'default'} className="md:p-4">
        {history.length === 0 ? (
          <EmptyState
            icon={<History width={24} height={24} strokeWidth={1.75} />}
            title="No plans yet"
            description="A plan appears here once the Load Planner has run at least once for this dealer."
          />
        ) : isMd ? (
          <Table minWidth="44rem">
            <THead>
              <TRow>
                <TH>Date</TH>
                <TH>Status</TH>
                <TH>Order?</TH>
                <TH>Truck</TH>
                <TH>Outcome</TH>
              </TRow>
            </THead>
            <TBody>
              {history.map((summary) => {
                const row = historyRow(summary);
                return (
                  <TRow key={row.id}>
                    <TD>
                      {row.date}
                      {row.backfilledLabel ? (
                        <span className="mt-0.5 block text-xs text-text-subtle">{row.backfilledLabel}</span>
                      ) : null}
                    </TD>
                    <TD>
                      <Badge intent={row.statusIntent}>{row.statusLabel}</Badge>
                    </TD>
                    <TD>{row.orderedThatDay}</TD>
                    <TD className="min-w-0 break-words">{row.truckLine}</TD>
                    <TD>
                      <Badge intent={row.outcomeIntent}>{row.outcomeLabel}</Badge>
                    </TD>
                  </TRow>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <MobileCardList
            cards={history.map((summary) => {
              const row = historyRow(summary);
              return {
                key: row.id,
                primary: <span className="font-medium text-text">{row.date}</span>,
                primaryRight: <Badge intent={row.statusIntent}>{row.statusLabel}</Badge>,
                secondary: row.truckLine,
                meta: row.backfilledLabel ?? undefined,
                kv: [
                  { label: 'Order that day', value: row.orderedThatDay },
                  { label: 'Outcome', value: <Badge intent={row.outcomeIntent}>{row.outcomeLabel}</Badge> },
                ],
              };
            })}
          />
        )}
      </CardContent>
    </Card>
  );
}
