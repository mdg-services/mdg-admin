import { ChevronDown } from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  MobileCardList,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
} from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import type { LoadPlanPool } from '@dk/shared';

import { daysSkippedLines, daysSkippedSummary, fuelRow, fuelRowClasses } from './format';

/**
 * One row per fuel (pool), highlighted the moment it is at its low-stock line —
 * the single most important cell on this pane after the headline, because it is
 * the one figure that turns "the planner thinks this is fine" into "the pump is
 * about to go dry".
 *
 * The days-left explanation is a native `<details>`, collapsed by default: it is
 * the audit trail for the daily-sale figure above it (which recent days were
 * left out, and why), useful when a number looks wrong and otherwise just
 * another thing to read past.
 */
export function FuelTable({ pools }: { pools: LoadPlanPool[] }) {
  const isMd = useMediaQuery('(min-width: 768px)');

  return (
    <Card>
      <CardHeader>
        <p className="text-base font-semibold text-text">Fuel</p>
        <p className="text-sm text-text-muted">Where every fuel stands this morning.</p>
      </CardHeader>
      <CardContent padding={isMd ? 'none' : 'default'} className="md:p-4">
        {isMd ? (
          <Table minWidth="48rem">
            <THead>
              <TRow>
                <TH>Fuel</TH>
                <TH className="text-right">In stock</TH>
                <TH className="text-right">Low-stock line</TH>
                <TH className="text-right">Spare</TH>
                <TH className="text-right">Sells / day</TH>
                <TH className="text-right">Days left</TH>
                <TH className="text-right">Runs out</TH>
                <TH className="text-right">On the way</TH>
              </TRow>
            </THead>
            <TBody>
              {pools.map((pool) => {
                const row = fuelRow(pool);
                return (
                  <TRow key={row.key} className={fuelRowClasses(row)}>
                    <TD className="font-medium">{row.label}</TD>
                    <TD className="text-right tabular-nums">{row.stock}</TD>
                    <TD className="text-right tabular-nums">{row.lowStockLine}</TD>
                    <TD
                      className={cn(
                        'text-right tabular-nums',
                        row.spareNegative ? 'font-semibold text-danger' : undefined,
                      )}
                    >
                      {row.spare}
                    </TD>
                    <TD className="text-right tabular-nums">{row.sellsPerDay}</TD>
                    <TD className="text-right tabular-nums">{row.daysLeft}</TD>
                    <TD className="text-right tabular-nums">{row.runsOut}</TD>
                    <TD className="text-right tabular-nums">{row.onTheWay}</TD>
                  </TRow>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <MobileCardList
            cards={pools.map((pool) => {
              const row = fuelRow(pool);
              return {
                key: row.key,
                primary: (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-text">{row.label}</span>
                    {/* The table's row highlight has no equivalent on a card
                        list — `MobileCardList` draws every card on the same
                        surface — so the same fact is said in words instead. */}
                    {row.atLine ? (
                      <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger">
                        At the line
                      </span>
                    ) : null}
                  </span>
                ),
                primaryRight: (
                  <span className={cn('text-sm tabular-nums', row.spareNegative ? 'font-semibold text-danger' : 'text-text')}>
                    {row.spare}
                  </span>
                ),
                secondary: `${row.stock} in stock · line ${row.lowStockLine}`,
                kv: [
                  { label: 'Sells / day', value: row.sellsPerDay },
                  { label: 'Days left', value: row.daysLeft, numeric: true },
                  { label: 'Runs out', value: row.runsOut },
                  { label: 'On the way', value: row.onTheWay, numeric: true },
                ],
              };
            })}
          />
        )}

        <div className="mt-3 grid gap-2">
          {pools.map((pool) => (
            <details key={pool.key} className="group rounded-md border border-border px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm text-text-muted">
                <span className="min-w-0 break-words">
                  {pool.label} — {daysSkippedSummary(pool)}
                </span>
                <ChevronDown
                  width={14}
                  height={14}
                  strokeWidth={1.75}
                  className="shrink-0 text-text-subtle transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              {daysSkippedLines(pool).length > 0 ? (
                <ul className="mt-2 grid gap-1 text-xs text-text-subtle">
                  {daysSkippedLines(pool).map((d, i) => (
                    <li key={i}>
                      {d.date} — {d.why}
                    </li>
                  ))}
                </ul>
              ) : null}
            </details>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
