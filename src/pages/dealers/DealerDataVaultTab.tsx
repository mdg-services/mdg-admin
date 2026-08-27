import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Database,
  DownloadCloud,
  History,
} from 'lucide-react';
import * as React from 'react';



import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Drawer,
  EmptyState,
  Input,
  MIN_SELECTABLE_YMD,
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
import { useRunDetail } from '@/hooks/api/useRunDetail';
import { ApiError } from '@/lib/api';
import { formatDateTime, istTodayYmd, isYmd } from '@/lib/format';
import { dealerCodeLabel, type Dealer, type IrasDataSnapshotSummary, type IrasReportCode } from '@dk/shared';

import { SnapshotDetail } from '../dataVault/SnapshotDetail';

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
  const qc = useQueryClient();
  const collect = useCollectIrasData();
  const latestQ = useDealerLatestIrasSnapshot(dealer.id);
  const historyQ = useIrasSnapshotsQuery({
    dealerId: dealer.id,
    pageSize: HISTORY_PAGE_SIZE,
  });
  const [openSnapshotId, setOpenSnapshotId] = React.useState<string | null>(
    null,
  );

  // The collect POSTs a 202 and the portal run lands ~1 min later, so watch the
  // returned run to completion (like the DSR generate) and only then refetch +
  // toast — otherwise the "refreshes when it lands" promise never fires.
  const [collectRunId, setCollectRunId] = React.useState<string | null>(null);
  const collectRun = useRunDetail(collectRunId ?? undefined, {
    pollWhileRunning: true,
  });
  React.useEffect(() => {
    const st = collectRun.data?.status;
    if (!collectRunId || (st !== 'SUCCESS' && st !== 'FAILED')) return;
    setCollectRunId(null);
    void qc.invalidateQueries({ queryKey: ['irasData'] });
    if (st === 'SUCCESS') {
      toast.success('Collection landed — this tab is up to date.');
    } else {
      toast.error(
        "The collection didn't complete. Open the dealer's Run history for details.",
      );
    }
  }, [collectRun.data?.status, collectRunId, qc, toast]);

  // The collect target: the latest shift by default, but an admin can pick a past
  // shift date to back-fill it (the portal serves back-dated shifts). `today` is
  // an IST ceiling (matching the backend future-date guard) recomputed each render
  // so it advances past IST midnight. Empty means today; a valid non-today date is
  // sent as `businessDate`; an out-of-range value disables the button so the field
  // and the action agree.
  const today = istTodayYmd();
  const [collectDate, setCollectDate] = React.useState(istTodayYmd);
  const dateValid =
    collectDate === '' ||
    (isYmd(collectDate) && collectDate >= MIN_SELECTABLE_YMD && collectDate <= today);
  const backDate =
    dateValid && collectDate !== '' && collectDate !== today ? collectDate : undefined;
  const collecting = collect.isPending || collectRunId !== null;

  function runCollection() {
    collect.mutate(
      { dealerId: dealer.id, ...(backDate ? { businessDate: backDate } : {}) },
      {
        onSuccess: (data) => {
          setCollectRunId(data.runId);
          toast.success(
            backDate
              ? `Collecting ${backDate} — the portal takes about a minute. This tab refreshes when it lands.`
              : 'Collecting the latest shift — the portal takes about a minute. This tab refreshes when it lands.',
          );
        },
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
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
      <Input
        type="date"
        value={collectDate}
        min={MIN_SELECTABLE_YMD}
        max={today}
        onChange={(e) => setCollectDate(e.target.value)}
        aria-label="Business date to collect"
        // `w-full md:w-40`, not a bare `w-40`: `cn` is clsx, and Tailwind emits
        // `.w-full` AFTER `.w-40`, so the bare override silently lost and the
        // field took the whole row.
        className="w-full md:w-40"
      />
      <Button
        variant="secondary"
        size="sm"
        loading={collecting}
        disabled={!dateValid}
        leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
        onClick={runCollection}
      >
        {backDate ? 'Collect' : 'Collect now'}
      </Button>
    </div>
  );

  return (
    <div className="grid gap-3 md:gap-4">
      <Card>
        <CardContent>
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
        title={dealerCodeLabel(dealer.code)}
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
      {/* `padding="none"`, not `className="p-0"`: `cn` is clsx and Tailwind
          emits `.p-4` after `.p-0`, so the p-0 this card carried never applied
          and the header's own rule stopped 16px short of the card's edges.
          `md:p-4` is a separate declaration, so ≥768px stays exactly as it
          renders today. */}
      <CardContent padding="none" className="md:p-4">
        {/* `CardHeader action`: the count does not shrink, so in a
            `justify-between` row that cannot wrap it took width off the
            description at 296px. */}
        <CardHeader
          align="center"
          padding="comfortable"
          action={
            total > 0 ? (
              <span className="text-xs tabular-nums text-text-subtle">
                {items.length} of {total}
              </span>
            ) : undefined
          }
        >
          <p className="text-base font-semibold text-text">Capture history</p>
          <p className="text-sm text-text-muted">
            Recent shift captures for this dealer.
          </p>
        </CardHeader>

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

            {/* Mobile card-stack (< md). `rows`, not floating cards: the card
                body has no padding below md, so each capture divides from the
                next with a hairline and its date starts 25px from the screen
                edge instead of 54px. */}
            <MobileCardList
              variant="rows"
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
                    {/* From the portal/scraper, so it can carry an unbroken
                        token; without this it runs past the card and `main`'s
                        `overflow-x-hidden` clips it rather than scrolling. */}
                    {s.failureReason ? (
                      <span className="break-words text-danger">{s.failureReason}</span>
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
