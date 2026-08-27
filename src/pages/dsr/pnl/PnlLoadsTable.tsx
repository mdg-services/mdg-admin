import { Badge, DataList, type DataColumn } from '@/components/ui';
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

export function PnlLoadsTable({ product }: { product: PnlProduct }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-text-muted">
        One row per day, not per tanker — two loads of the same grade on one day arrive as a single
        row, because the day book records a day&rsquo;s receipts rather than each decantation. On
        every row, <span className="text-text">Revenue &minus; Cost = Profit</span>.
      </p>
      <DataList
        rows={product.loads}
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
    </div>
  );
}
