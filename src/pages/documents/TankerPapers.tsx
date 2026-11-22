import { AlertCircle, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  Card,
  CardContent,
  DataList,
  EmptyState,
  Skeleton,
  type DataColumn,
} from '@/components/ui';
import {
  useExpiringTankerDocumentsQuery,
  useTankerDocumentsQuery,
} from '@/hooks/api/useTankerDocuments';
import { ApiError } from '@/lib/api';
import { dealerCodeLabel, dealerProfileDateLabel, type TankerDocumentView } from '@dk/shared';

import { ValidityLegend, ValidityPill } from './ValidityPill';

/**
 * TANKER PAPERS — the per-vehicle documents MDG reads off IndianOil Partners every morning
 * (ADR 0044), and what the dealer has been told about them (ADR 0054).
 *
 * They are NOT dealership papers and do not live in the papers-on-file register: nobody files
 * them, there is no upload, and a renewal is seen only when the next daily read brings a later
 * date. So they get their own small list, drawn with the SAME verdict pill the register uses so
 * a "Running out" means one thing on every screen.
 *
 * Dates carry the YEAR (`dealerProfileDateLabel`), never a year-less period label — see the
 * note in `DocumentValidityList` for why that mistake compiles and misleads.
 */

export interface TankerPaperRow extends TankerDocumentView {
  /** Set on the estate list, where rows come from many outlets. */
  dealerId?: string;
  dealerCode?: string | null;
}

/** "Told 2× · last 18 Nov" / "Not told yet" / "—" (nothing due, nothing to tell). */
function toldSentence(row: TankerPaperRow): string {
  if (row.remindersSent === 0 && !row.lapsedNoticeSent) {
    return row.state === 'expiring' || row.state === 'expired' ? 'Not told yet' : '—';
  }
  const last = row.lastRemindedAt
    ? new Date(row.lastRemindedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : null;
  const parts = [
    row.remindersSent > 0 ? `Told ${row.remindersSent}×${last ? ` · last ${last}` : ''}` : null,
    row.lapsedNoticeSent ? 'Expired notice sent' : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

export function TankerPapersList({
  rows,
  showDealer,
  onOpen,
  empty,
}: {
  rows: readonly TankerPaperRow[];
  showDealer: boolean;
  onOpen?: (row: TankerPaperRow) => void;
  empty?: React.ReactNode;
}) {
  const columns: DataColumn<TankerPaperRow>[] = [
    ...(showDealer
      ? [
          {
            id: 'dealer',
            header: 'Dealer',
            width: '7rem',
            mobile: 'primary' as const,
            cell: (row: TankerPaperRow) => (
              <span className="font-medium">{dealerCodeLabel(row.dealerCode ?? null)}</span>
            ),
          },
        ]
      : []),
    {
      id: 'vehicle',
      header: 'Tanker',
      width: '9rem',
      mobile: showDealer ? 'secondary' : 'primary',
      cell: (row) => <span className="whitespace-nowrap font-medium">{row.vehicleReg}</span>,
    },
    {
      id: 'paper',
      header: 'Paper',
      mobile: 'kv',
      mobileLabel: 'Paper',
      cell: (row) => <span className="break-words">{row.docLabel}</span>,
    },
    {
      id: 'verdict',
      header: 'Validity',
      mobile: 'primaryRight',
      cell: (row) => <ValidityPill state={row.state} daysToExpiry={row.daysLeft} />,
    },
    {
      id: 'validUntil',
      header: 'Valid until',
      width: '9rem',
      mobile: 'kv',
      mobileLabel: 'Valid until',
      cell: (row) =>
        row.validUntil ? (
          <span className="whitespace-nowrap">{dealerProfileDateLabel(row.validUntil, 'en')}</span>
        ) : (
          <span className="text-text-subtle">Not dated</span>
        ),
    },
    {
      id: 'told',
      header: 'Dealer told',
      mobile: 'kv',
      mobileLabel: 'Dealer told',
      cell: (row) => <span className="break-words">{toldSentence(row)}</span>,
    },
  ];
  return (
    <DataList
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      {...(onOpen ? { onRowClick: onOpen } : {})}
      skeletonRows={4}
      cardVariant="rows"
      {...(empty ? { empty } : {})}
    />
  );
}

function lastReadSentence(iso: string | null): string {
  if (!iso) return 'Not read from IndianOil Partners yet.';
  return `Last read from IndianOil Partners on ${new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}.`;
}

/**
 * One outlet's tanker papers, for the dealer's Documents tab. Draws NOTHING for an outlet that
 * has no tanker documents (no tanker, or none read yet): an empty card on every non-tanker
 * outlet would be noise on the screen most outlets use.
 */
export function DealerTankerPapers({ dealerId }: { dealerId: string }) {
  const q = useTankerDocumentsQuery(dealerId);
  if (q.isLoading) return <Skeleton className="mt-3 h-24 w-full md:mt-4" />;
  if (q.isError) {
    return (
      <Card className="mt-3 md:mt-4">
        <CardContent>
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title="Could not load this outlet's tanker papers"
            description={q.error instanceof ApiError ? q.error.message : 'Please try again.'}
          />
        </CardContent>
      </Card>
    );
  }
  const vehicles = q.data?.vehicles ?? [];
  if (vehicles.length === 0) return null;
  const rows: TankerPaperRow[] = vehicles.flatMap((v) => v.documents);
  return (
    <Card className="mt-3 md:mt-4">
      <CardContent padding="none" className="md:p-4">
        <div className="flex items-start gap-3 p-3 md:px-0 md:pt-0">
          <Truck
            width={18}
            height={18}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-text-muted"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">
              Tanker papers · {vehicles.length} tanker{vehicles.length === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-text-muted">
              {lastReadSentence(q.data?.lastFetchedAt ?? null)} The dealer is reminded 15, 3, 2 and
              1 days before a paper runs out, and once when it has.
            </p>
          </div>
        </div>
        <TankerPapersList rows={rows} showDealer={false} />
        <div className="border-t border-border p-3 md:border-0 md:px-0 md:pb-0 md:pt-4">
          <ValidityLegend />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Every tanker paper across outlets that has run out or is inside the reminder window — the
 * team's list of who needs a nudge. A row opens that outlet's Documents tab. Draws nothing when
 * nothing is running out.
 */
export function EstateTankerPapers() {
  const q = useExpiringTankerDocumentsQuery();
  const navigate = useNavigate();
  if (q.isLoading) return <Skeleton className="mb-3 h-28 w-full md:mb-4" />;
  if (q.isError) return null; // The register below is the page; a failed side list must not replace it.
  const data = q.data;
  const rows: TankerPaperRow[] = data?.rows ?? [];
  // Nothing running out means nothing to draw: a standing empty card above the register would
  // sit there all year saying "all clear" about papers most outlets do not even have.
  if (!data || rows.length === 0) return null;
  return (
    <Card className="mb-3 md:mb-4">
      <CardContent padding="none" className="md:p-4">
        <div className="flex items-start gap-3 p-3 md:px-0 md:pt-0">
          <Truck
            width={18}
            height={18}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-text-muted"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">
              Tanker papers running out · {rows.length}
            </p>
            <p className="text-sm text-text-muted">
              Papers that have run out or will within {data.windowDays} days, across {data.outlets}{' '}
              outlet
              {data.outlets === 1 ? '' : 's'} with a tanker. {lastReadSentence(data.lastFetchedAt)}
            </p>
          </div>
        </div>
        <TankerPapersList
          rows={rows}
          showDealer
          onOpen={(row) => row.dealerId && void navigate(`/dealers/${row.dealerId}?tab=documents`)}
        />
      </CardContent>
    </Card>
  );
}
