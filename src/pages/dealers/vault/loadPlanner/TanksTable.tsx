import { Card, CardContent, CardHeader, MobileCardList, Table, TBody, TD, TH, THead, TRow } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { LoadPlanTank } from '@dk/shared';

import { tankRow } from './format';

/** Per-tank stock, the fill-up-to mark and the room left — the physical facts
 *  a chamber's `why` (in {@link TruckPlan}) is reasoning about. */
export function TanksTable({ tanks }: { tanks: LoadPlanTank[] }) {
  const isMd = useMediaQuery('(min-width: 768px)');

  return (
    <Card>
      <CardHeader>
        <p className="text-base font-semibold text-text">Tanks</p>
        <p className="text-sm text-text-muted">Which tank has room, one chamber at a time.</p>
      </CardHeader>
      <CardContent padding={isMd ? 'none' : 'default'} className="md:p-4">
        {isMd ? (
          <Table>
            <THead>
              <TRow>
                <TH>Tank</TH>
                <TH className="text-right">Stock</TH>
                <TH className="text-right">Fill up to</TH>
                <TH className="text-right">Room</TH>
              </TRow>
            </THead>
            <TBody>
              {tanks.map((tank) => {
                const row = tankRow(tank);
                return (
                  <TRow key={row.key}>
                    <TD className="font-medium">{row.label}</TD>
                    <TD className={row.noReading ? 'text-right text-text-subtle' : 'text-right tabular-nums'}>
                      {row.stock}
                    </TD>
                    <TD className="text-right tabular-nums">{row.fillUpTo}</TD>
                    <TD className="text-right tabular-nums">{row.room}</TD>
                  </TRow>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <MobileCardList
            cards={tanks.map((tank) => {
              const row = tankRow(tank);
              return {
                key: String(row.key),
                primary: <span className="font-medium text-text">{row.label}</span>,
                primaryRight: (
                  <span className={row.noReading ? 'text-sm text-text-subtle' : 'text-sm tabular-nums text-text'}>
                    {row.stock}
                  </span>
                ),
                kv: [
                  { label: 'Fill up to', value: row.fillUpTo, numeric: true },
                  { label: 'Room', value: row.room, numeric: true },
                ],
              };
            })}
          />
        )}
      </CardContent>
    </Card>
  );
}
