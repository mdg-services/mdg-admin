import * as React from 'react';

import { Badge, Button, DataList, type DataColumn } from '@/components/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatInrWhole, formatLitres, formatYmd } from '@/lib/format';
import type { PnlLoad, PnlProduct } from '@/lib/fuelPnl';

/**
 * One grade's deliveries, each priced on its own.
 *
 * "What did I make on that tanker" is the question a dealer actually asks, and
 * it is not answerable from a monthly total. Each row is one delivery: what it
 * cost, what the litres in it fetched, what leaked away, and what was left.
 *
 * The columns are ordered so an admin can check the arithmetic without a
 * calculator: **Revenue − Cost = Profit**, on every row, whichever way the loss
 * is being valued. That identity is load-bearing — a table whose own columns do
 * not subtract to its own answer teaches people to distrust the answer, and an
 * earlier draft of this screen had exactly that fault. It is also why `Litres
 * sold` sits beside `Litres bought` rather than being left implied: the gap
 * between them IS the fuel that vanished.
 *
 * Built on `DataList` rather than a hand-written `Table` so the phone card is
 * derived from these same column definitions and cannot silently drop one.
 */

/**
 * Red for fuel gone, no colour for anything else.
 *
 * Deliberately no green for a surplus: this page's own warning says an excess is
 * almost always a delivery missing from the records rather than free fuel, so
 * the success colour would tell an admin the opposite of what the page says.
 */
function lossClass(litres: number, value: number | null): string {
  return value !== null && litres < 0 ? 'text-danger' : '';
}

const COLUMNS: DataColumn<PnlLoad>[] = [
  {
    id: 'date',
    header: 'Delivered',
    mobile: 'primary',
    cell: (l) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="whitespace-nowrap">{formatYmd(l.businessDate)}</span>
        {l.source !== 'iras' ? (
          <Badge intent={l.source === 'manual' ? 'info' : 'warning'}>
            {l.source === 'manual' ? 'Entered by hand' : 'Read from the dip'}
          </Badge>
        ) : null}
      </span>
    ),
  },
  {
    id: 'profit',
    header: 'Profit',
    mobile: 'primaryRight',
    mobileLabel: 'Profit',
    numeric: true,
    cell: (l) => (
      <span className={l.profit !== null && l.profit < 0 ? 'text-danger' : undefined}>
        <span className="font-semibold">{formatInrWhole(l.profit)}</span>
        {l.returnPct === null ? null : (
          <span className="block text-xs font-normal text-text-muted">
            {l.returnPct.toFixed(2)}% return
          </span>
        )}
      </span>
    ),
  },
  {
    id: 'litres',
    header: 'Litres bought',
    mobileLabel: 'Litres bought',
    numeric: true,
    cell: (l) => (
      <>
        {formatLitres(l.litres)}
        {/* The 500 L round-up, shown wherever it moved the figure. On a delivery
            that came in OVER its invoice these are litres the dealer never paid
            for, and this is the only place that shows at all. */}
        {l.roundedUpBy !== null && Math.abs(l.roundedUpBy) >= 0.5 ? (
          <span className="block text-xs font-normal text-text-muted">
            rounded up {formatLitres(l.roundedUpBy)}
          </span>
        ) : null}
      </>
    ),
  },
  {
    id: 'cost',
    header: 'Cost',
    mobileLabel: 'Cost',
    numeric: true,
    cell: (l) => formatInrWhole(l.cost),
  },
  {
    id: 'sold',
    header: 'Litres sold',
    mobileLabel: 'Litres sold',
    numeric: true,
    cell: (l) => formatLitres(l.sellableLitres),
  },
  {
    id: 'revenue',
    header: 'Revenue',
    mobileLabel: 'Revenue',
    numeric: true,
    cell: (l) => formatInrWhole(l.revenue),
  },
  {
    id: 'lost',
    header: 'Fuel lost',
    mobileLabel: 'Fuel lost',
    numeric: true,
    cell: (l) => (
      <span className={lossClass(l.lostLitres, l.lostValue)}>
        {formatLitres(l.lostLitres, { sign: true })}
        <span className="block text-xs font-normal">{formatInrWhole(l.lostValue)}</span>
      </span>
    ),
  },
];

/**
 * How many deliveries a phone shows before "Show all".
 *
 * Every delivery is a full card on a phone, ~218px each. A month with 24 + 21 +
 * 3 loads made the page 16,271px long at 360px, and the second grade's summary
 * — the answer the page is for — sat two dozen cards below the first. The
 * loads arrive oldest first, so the cap keeps the newest.
 */
const PHONE_LOADS = 5;

export function PnlLoadsTable({ product }: { product: PnlProduct }) {
  // In JS, not CSS: a `md:hidden` cap would still mount every card. Desktop
  // takes every row exactly as before.
  const isMd = useMediaQuery('(min-width: 768px)');
  const [showAll, setShowAll] = React.useState(false);
  const total = product.loads.length;
  const capped = !isMd && !showAll && total > PHONE_LOADS;
  const rows = capped ? product.loads.slice(-PHONE_LOADS) : product.loads;

  return (
    <div className="space-y-2">
      <p className="text-sm text-text-muted">
        One row per day, not per tanker — two loads of the same grade on one day arrive as a single
        row, because the day book records a day&rsquo;s receipts rather than each decantation. On
        every row, <span className="text-text">Revenue &minus; Cost = Profit</span>.
      </p>
      <DataList
        rows={rows}
        rowKey={(l) => `${l.businessDate}-${l.litres}`}
        columns={COLUMNS}
        minWidth="58rem"
        freezeFirstColumn
        empty={
          // Not `.toLowerCase()`: it turned "XtraPremium 95 Petrol" into
          // "xtrapremium 95 petrol", which is a brand name spelt wrong.
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
            No {product.labelEn} was delivered in this period.
          </p>
        }
      />
      {capped ? (
        <div className="grid gap-2">
          <p className="text-xs text-text-subtle">
            The {PHONE_LOADS} most recent of {total} deliveries.
          </p>
          <Button variant="secondary" onClick={() => setShowAll(true)}>
            Show all {total} deliveries
          </Button>
        </div>
      ) : null}
    </div>
  );
}
