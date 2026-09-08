import { RefreshCw } from 'lucide-react';
import type * as React from 'react';

import { Badge, DataList, type DataColumn } from '@/components/ui';
import { dealerCodeLabel, dealerProfileDateLabel } from '@dk/shared';

import { cadenceSentence, type DocumentValidityRow } from './format';
import { ValidityPill } from './ValidityPill';

/**
 * The papers-on-file table — one definition, three surfaces.
 *
 * The estate register, one dealer's tab and anything that comes next all draw
 * the SAME rows with the same columns, so the definition lives here once. Two
 * copies of it is how the estate view comes to show a "Renewal open" column the
 * dealer's own tab silently drops, which is not a layout difference but a
 * different report.
 *
 * `DataList` rather than a hand-written `Table` + `MobileCardList` pair, because
 * `docs/MOBILE.md` makes it mandatory for a NEW table: the breakpoint is decided
 * once in JS so exactly one tree mounts, and the phone card is DERIVED from the
 * columns, so a column cannot ship without a phone form.
 *
 * WHY "DAYS LEFT" RIDES INSIDE THE PILL RATHER THAN IN A COLUMN OF ITS OWN.
 * `documentValidityLabel` already reads as a whole statement — "8 days left",
 * "Expired 3 days ago" — and it is the exact sentence the dealer's own
 * notification is built from. Splitting the verdict from its count across two
 * columns would put "Running out" 200px away from "1 day left" on a laptop and
 * on two separate card rows on a phone, and a seventh column is past the width
 * this table can hold without a sideways scroller.
 */

export interface DocumentValidityListProps {
  rows: readonly DocumentValidityRow[];
  loading?: boolean;
  onOpen: (row: DocumentValidityRow) => void;
  /** Drawn instead of the list when there are no rows. */
  empty?: React.ReactNode;
  /** Off on a per-dealer surface, where every row is the same outlet. */
  showDealer?: boolean;
  className?: string;
}

export function DocumentValidityList({
  rows,
  loading = false,
  onOpen,
  empty,
  showDealer = true,
  className,
}: DocumentValidityListProps) {
  const columns: DataColumn<DocumentValidityRow>[] = [
    ...(showDealer
      ? [
          {
            id: 'dealer',
            header: 'Dealer',
            width: '7rem',
            mobile: 'primary' as const,
            cell: (row: DocumentValidityRow) => (
              <span className="font-medium">{dealerCodeLabel(row.dealerCode)}</span>
            ),
          },
        ]
      : []),
    {
      id: 'paper',
      header: 'Paper',
      mobile: showDealer ? 'secondary' : 'primary',
      cell: (row) => (
        <span className="block min-w-0">
          <span className="break-words">{row.title}</span>
          {row.isRenewal ? (
            <span className="block text-xs text-text-subtle">
              Replaces an earlier one — last year&rsquo;s is still on the record
            </span>
          ) : null}
          {row.filedByMdg ? (
            // The honesty line. A paper an admin filed is not a paper the dealer
            // sent, and every screen that shows one has to say so or the
            // compliance record quietly claims something nobody did.
            <span className="block text-xs text-text-subtle">
              Filed by MDG{row.filedByName ? ` · ${row.filedByName}` : ''}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'verdict',
      header: 'Validity',
      mobile: 'primaryRight',
      cell: (row) => <ValidityPill state={row.validityState} daysToExpiry={row.daysToExpiry} />,
    },
    {
      id: 'validUntil',
      header: 'Valid until',
      width: '9rem',
      mobile: 'kv',
      mobileLabel: 'Valid until',
      cell: (row) =>
        row.validUntil ? (
          // `dealerProfileDateLabel`, which carries the YEAR. NEVER
          // `documentPeriodLabel`, which omits it deliberately — a licence good
          // until 31 December 2027 printed as "31 Dec" reads as this year to
          // anybody, and one that lapsed on 31 August 2026 printed as "31 Aug"
          // reads as one that has not lapsed yet.
          <span className="whitespace-nowrap">{dealerProfileDateLabel(row.validUntil, 'en')}</span>
        ) : (
          <span className="text-text-subtle">Not dated</span>
        ),
    },
    {
      id: 'cadence',
      header: 'Reminders',
      mobile: 'kv',
      mobileLabel: 'Reminders',
      cell: (row) => (
        <span className="block min-w-0">
          <span className="break-words">{cadenceSentence(row.cadence)}</span>
          {row.cadenceOverridden ? (
            <span className="block text-xs text-text-subtle">Set for this paper only</span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'renewal',
      header: 'Renewal',
      width: '8rem',
      mobile: 'meta',
      cell: (row) =>
        row.renewalOpen ? (
          <Badge intent="info">
            <RefreshCw
              width={12}
              height={12}
              strokeWidth={1.75}
              className="mr-1 shrink-0"
              aria-hidden
            />
            Already asked for
          </Badge>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
  ];

  return (
    <DataList
      rows={rows}
      columns={columns}
      rowKey={(row) => row.askId}
      onRowClick={onOpen}
      loading={loading}
      skeletonRows={6}
      cardVariant="rows"
      {...(empty ? { empty } : {})}
      {...(className ? { className } : {})}
    />
  );
}
