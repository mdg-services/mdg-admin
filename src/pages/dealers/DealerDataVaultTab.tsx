import {
  AlertCircle,
  Database,
  DownloadCloud,
  History,
} from 'lucide-react';
import * as React from 'react';

import type {
  Dealer,
  IrasDataSnapshotSummary,
  IrasReportCode,
} from '@dk/shared';

import { SnapshotDetail } from '../dataVault/SnapshotDetail';

import {
  Button,
  Card,
  CardContent,
  Drawer,
  EmptyState,
  MobileCardList,
  Skeleton,
  StatusChip,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TRow,
  useToast,
} from '@/components/ui';
import {
  useCollectIrasData,
  useDealerLatestIrasSnapshot,
  useIrasSnapshotQuery,
  useIrasSnapshotsQuery,
} from '@/hooks/api/useIrasData';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface Props {
  dealer: Dealer;
}

const HISTORY_PAGE_SIZE = 20;

/** `YYYY-MM-DD` → `Thu, 23 Jul 2026`, read as a calendar date, not an instant. */
function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Total rows across every report in a snapshot summary. */
function totalRows(counts: Partial<Record<IrasReportCode, number>>): number {
  return Object.values(counts).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

/**
 * This dealer's slice of the Data Vault: the latest capture in full, a button to
 * collect on demand, and the recent history — each entry opening the same detail
 * panel the cross-dealer Vault uses.
 */
export function DealerDataVaultTab({ dealer }: Props) {
  const toast = useToast();
  const collect = useCollectIrasData();
  const latestQ = useDealerLatestIrasSnapshot(dealer.id);
  const historyQ = useIrasSnapshotsQuery({
    dealerId: dealer.id,
    pageSize: HISTORY_PAGE_SIZE,
  });
  const [openSnapshotId, setOpenSnapshotId] = React.useState<string | null>(
    null,
  );

  // No `businessDate` — the dealer tab always means "collect today's shift".
  function runCollection() {
    collect.mutate(
      { dealerId: dealer.id },
      {
        onSuccess: () =>
          toast.success(
            'Collection queued — the portal takes about a minute. This tab refreshes when it lands.',
          ),
        onError: (err) =>
          toast.error(
            err instanceof ApiError
              ? err.message
              : 'Could not start the collection',
          ),
      },
    );
  }

  const collectButton = (
    <Button
      variant="secondary"
      size="sm"
      loading={collect.isPending}
      leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
      onClick={runCollection}
    >
      Collect now
    </Button>
  );

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="p-4">
          {latestQ.isLoading ? (
            <div className="grid gap-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : latestQ.isError ? (
            <EmptyState
              icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
              title="Could not load the latest capture"
              description={
                latestQ.error instanceof ApiError
                  ? latestQ.error.message
                  : 'Please try again.'
              }
            />
          ) : !latestQ.data ? (
            <EmptyState
              icon={<Database width={28} height={28} strokeWidth={1.75} />}
              title="No IRAS data collected yet"
              description="Once the pipeline runs for this dealer, their shift-anchored reports appear here."
              cta={collectButton}
            />
          ) : (
            <SnapshotDetail
              snapshot={latestQ.data}
              hideDealerName
              actions={collectButton}
            />
          )}
        </CardContent>
      </Card>

      <HistoryCard
        onOpen={setOpenSnapshotId}
        isLoading={historyQ.isLoading}
        isError={historyQ.isError}
        error={historyQ.error}
        items={historyQ.data?.items ?? []}
        total={historyQ.data?.total ?? 0}
      />

      <Drawer
        open={!!openSnapshotId}
        onClose={() => setOpenSnapshotId(null)}
        width="lg"
        title={dealer.name ?? 'Dealer data'}
        description="Captured IRAS shift data"
        footer={
          <Button variant="ghost" onClick={() => setOpenSnapshotId(null)}>
            Close
          </Button>
        }
      >
        {openSnapshotId ? (
          <HistoricSnapshot snapshotId={openSnapshotId} />
        ) : null}
      </Drawer>
    </div>
  );
}

function HistoryCard({
  onOpen,
  isLoading,
  isError,
  error,
  items,
  total,
}: {
  onOpen: (snapshotId: string) => void;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  items: IrasDataSnapshotSummary[];
  total: number;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="text-base font-semibold text-text">Capture history</p>
            <p className="text-sm text-text-muted">
              Recent shift captures for this dealer.
            </p>
          </div>
          {total > 0 ? (
            <span className="shrink-0 text-xs tabular-nums text-text-subtle">
              {items.length} of {total}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
            title="Could not load capture history"
            description={
              error instanceof ApiError ? error.message : 'Please try again.'
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<History width={28} height={28} strokeWidth={1.75} />}
            title="No captures yet"
            description="Every collection run for this dealer will be listed here."
          />
        ) : (
          <>
            {/* Desktop table (≥ md) */}
            <div className="hidden md:block">
              <Table>
                <THead>
                  <TRow>
                    <TH>Business date</TH>
                    <TH>Status</TH>
                    <TH>Shift</TH>
                    <TH className="text-right">Rows</TH>
                    <TH>Captured at</TH>
                  </TRow>
                </THead>
                <TBody>
                  {items.map((s) => (
                    <TRow key={s.id} clickable onClick={() => onOpen(s.id)}>
                      <TD className="whitespace-nowrap font-medium">
                        {dateLabel(s.businessDate)}
                      </TD>
                      <TD>
                        <StatusChip kind="irasSnapshot" value={s.status} />
                        {s.failureReason ? (
                          <p className="mt-1 max-w-[32ch] text-xs text-danger">
                            {s.failureReason}
                          </p>
                        ) : null}
                      </TD>
                      <TD className="whitespace-nowrap font-mono text-text-muted">
                        {s.selectedShiftTime || '—'}
                      </TD>
                      <TD className="text-right tabular-nums text-text-muted">
                        {totalRows(s.rowCounts)}
                      </TD>
                      <TD className="whitespace-nowrap text-text-muted">
                        {formatDateTime(s.capturedAt)}
                      </TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            </div>

            {/* Mobile card-stack (< md) */}
            <MobileCardList
              className="p-3"
              cards={items.map((s) => ({
                key: s.id,
                onClick: () => onOpen(s.id),
                primary: (
                  <span className="block truncate font-medium text-text">
                    {dateLabel(s.businessDate)}
                  </span>
                ),
                primaryRight: (
                  <StatusChip kind="irasSnapshot" value={s.status} />
                ),
                secondary: (
                  <span className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="font-mono">
                      Shift {s.selectedShiftTime || '—'}
                    </span>
                    <span>· {totalRows(s.rowCounts)} rows</span>
                  </span>
                ),
                meta: (
                  <span className="flex flex-col gap-0.5">
                    <span>{formatDateTime(s.capturedAt)}</span>
                    {s.failureReason ? (
                      <span className="text-danger">{s.failureReason}</span>
                    ) : null}
                  </span>
                ),
              }))}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** One historic snapshot, fetched in full only when its drawer opens. */
function HistoricSnapshot({ snapshotId }: { snapshotId: string }) {
  const { data, isLoading, isError, error } = useIrasSnapshotQuery(snapshotId);

  if (isLoading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load this snapshot"
        description={
          error instanceof ApiError ? error.message : 'Please try again.'
        }
      />
    );
  }
  return <SnapshotDetail snapshot={data} hideDealerName />;
}
