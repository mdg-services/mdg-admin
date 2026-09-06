import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Database,
  DownloadCloud,
  History,
  PencilLine,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';



import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  Drawer,
  EmptyState,
  HowThisWorks,
  Input,
  Label,
  MIN_SELECTABLE_YMD,
  MobileCardList,
  SegmentedControl,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TRow,
  useToast,
} from '@/components/ui';
import { useDealerServicesQuery } from '@/hooks/api/useDealerServices';
import {
  useCollectIrasData,
  useDealerLatestIrasSnapshot,
  useIrasDayStatesQuery,
  useIrasSnapshotQuery,
  useUnverifyIrasDay,
  useVerifyIrasDay,
} from '@/hooks/api/useIrasData';
import { useRunDetail } from '@/hooks/api/useRunDetail';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatLitres, istTodayYmd, isYmd } from '@/lib/format';
import { statusIntent } from '@/lib/statusIntent';
import {
  IRAS_DAY_STATE_HINT,
  IRAS_DAY_STATE_LABEL,
  dealerCodeLabel,
  irasDayNeedsAttention,
  type Dealer,
  type IrasDayStateRow,
} from '@dk/shared';

import { SnapshotDetail } from '../dataVault/SnapshotDetail';

interface Props {
  dealer: Dealer;
}

/**
 * How far back the capture history looks, in days.
 *
 * A window rather than a page count, because the list is a calendar: "the last
 * 30 days" is the question an admin asks about a dealer's data, and "page 2 of
 * captures" is not. 30 covers the month a report is judged on; the longer
 * windows are for chasing a gap somebody noticed late.
 */
// Strings because `SegmentedControl` keys its options by string; the query
// takes the number.
const DAY_WINDOWS = ['30', '60', '90'] as const;
type DayWindow = (typeof DAY_WINDOWS)[number];

/** The plugin whose attachment decides whether the portal can be asked at all. */
const PIPELINE_SERVICE_ID = 'iras-shift-data';

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

/**
 * This dealer's slice of the Data Vault: the latest capture in full, a date to
 * collect or open, and the recent history — each entry opening the same detail
 * panel the cross-dealer Vault uses.
 */
export function DealerDataVaultTab({ dealer }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const collect = useCollectIrasData();
  const latestQ = useDealerLatestIrasSnapshot(dealer.id);
  const [historyDays, setHistoryDays] = React.useState<DayWindow>('30');
  const historyQ = useIrasDayStatesQuery(dealer.id, {
    days: Number(historyDays),
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

  // The target date, shared by both actions on this row: collect it from the
  // portal, or open it in the day editor. The latest shift by default, but an
  // admin can pick a past shift date to back-fill it (the portal serves
  // back-dated shifts). `today` is an IST ceiling (matching the backend
  // future-date guard) recomputed each render so it advances past IST midnight.
  // Empty means today; a valid non-today date is sent as `businessDate`; an
  // out-of-range value disables both buttons so the field and the actions agree.
  const today = istTodayYmd();
  const [collectDate, setCollectDate] = React.useState(istTodayYmd);
  const dateValid =
    collectDate === '' ||
    (isYmd(collectDate) && collectDate >= MIN_SELECTABLE_YMD && collectDate <= today);
  const backDate =
    dateValid && collectDate !== '' && collectDate !== today ? collectDate : undefined;
  const openDate = collectDate === '' ? today : collectDate;
  const collecting = collect.isPending || collectRunId !== null;

  // Whether asking the portal is a real option. An outlet with no IRAS account
  // keeps the pipeline attached but PAUSED, and offering "Collect now" there
  // sends the operator down a path that cannot finish — it launches a browser
  // against an account that does not exist, and can leave a FAILED shell on the
  // date that then blocks both the report and the editor.
  //
  // Fails OPEN on purpose: hidden only once the answer is actually IN. "We could
  // not ask" is not "not attached", and the shared query is already in flight for
  // the tab strip, so this costs no extra request.
  const servicesQ = useDealerServicesQuery(dealer.id);
  const canCollect =
    !servicesQ.isSuccess ||
    servicesQ.data.some(
      (s) => s.serviceId === PIPELINE_SERVICE_ID && s.status === 'ACTIVE',
    );

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

  const dayActions = (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
      <Input
        type="date"
        value={collectDate}
        min={MIN_SELECTABLE_YMD}
        max={today}
        onChange={(e) => setCollectDate(e.target.value)}
        aria-label="Business date to open or collect"
        // `w-full md:w-40`, not a bare `w-40`: `cn` is clsx, and Tailwind emits
        // `.w-full` AFTER `.w-40`, so the bare override silently lost and the
        // field took the whole row.
        //
        // `flex-1` below md so it SHARES that row with the actions instead of
        // pushing them onto a line of their own. Stacked lines of chrome is
        // 52px of the ~670px a dealer's Data Vault spent before its first
        // figure. `md:flex-initial` is `flex: 0 1 auto` — the value a flex item
        // has when nobody sets one — so from md up the field is the 10rem box
        // it has always been.
        //
        // `min-w-[8.5rem]`, not `min-w-0`: with two actions beside it a `flex: 1
        // 1 0%` field has no floor and a native date input crushes to unreadable
        // on a 360px phone. The floor makes it wrap the last button to a second
        // row instead — legible beats one-line.
        className="min-w-[8.5rem] flex-1 md:w-40 md:flex-initial"
      />
      {/* The only way into a day that does not exist yet. Without it the tab can
          reach exactly the days it already holds: "Correct this day" carries the
          shown snapshot's own date, and the history rows are days too — so a
          hand-entered outlet could never reach a day it had not collected, and
          the editor's "Start this day by hand" — the only control that mints
          one — was unreachable from the whole app. */}
      <Button
        variant={canCollect ? 'ghost' : 'secondary'}
        size="sm"
        disabled={!dateValid}
        leftIcon={<PencilLine width={14} height={14} strokeWidth={1.75} />}
        onClick={() =>
          navigate(`/data-vault/dealers/${dealer.id}/days/${openDate}`)
        }
      >
        {/* Named for what it does at THIS outlet. Where the portal collects,
            opening a day is a look at figures that arrive on their own; where it
            does not, this is the only route to typing the shift in, and the
            control that says so is worth two clicks a morning. */}
        {canCollect ? 'Open day' : 'Type the shift'}
      </Button>
      {canCollect ? (
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
      ) : null}
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
              title={
                canCollect
                  ? 'No IRAS data collected yet'
                  : "This outlet's figures are entered by hand"
              }
              // Promising that data "appears here once the pipeline runs" is a
              // lie to an outlet with no portal account — nothing will ever run,
              // and that copy is what left day one with no visible next step.
              description={
                canCollect
                  ? 'Once the pipeline runs for this dealer, their shift-anchored reports appear here.'
                  : 'This dealer has no portal collection running, so nothing will arrive on its own. Pick a date and open the day to type the shift in.'
              }
              cta={dayActions}
            />
          ) : (
            <SnapshotDetail
              snapshot={latestQ.data}
              hideDealerName
              actions={dayActions}
            />
          )}
        </CardContent>
      </Card>

      <HistoryCard
        dealerId={dealer.id}
        onOpen={setOpenSnapshotId}
        days={historyDays}
        onDaysChange={setHistoryDays}
        isLoading={historyQ.isLoading}
        isError={historyQ.isError}
        error={historyQ.error}
        rows={historyQ.data?.days ?? []}
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

/**
 * The dealer's data, day by calendar day.
 *
 * The old card listed CAPTURES, which meant the days that most needed attention
 * — the ones nothing was ever collected for — appeared as a silent jump between
 * two rows. 16E read as ten green COMPLETE lines with 21 and 23–26 August simply
 * not there. The calendar is the spine now: every date in the window gets a row,
 * and the state of its data is the thing the row is about.
 */
function HistoryCard({
  dealerId,
  onOpen,
  days,
  onDaysChange,
  isLoading,
  isError,
  error,
  rows,
}: {
  dealerId: string;
  onOpen: (snapshotId: string) => void;
  days: DayWindow;
  onDaysChange: (v: DayWindow) => void;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  rows: IrasDayStateRow[];
}) {
  const [verifying, setVerifying] = React.useState<IrasDayStateRow | null>(null);
  const needsAttention = rows.filter((r) => irasDayNeedsAttention(r.state)).length;

  return (
    <Card>
      <CardContent padding="none" className="md:p-4">
        <CardHeader
          align="center"
          padding="comfortable"
          action={
            <div className="flex items-center gap-2">
              <SegmentedControl
                value={days}
                onChange={onDaysChange}
                fullWidthOnMobile={false}
                aria-label="How far back to show"
                options={DAY_WINDOWS.map((d) => ({ value: d, label: `${d}d` }))}
              />
              <HowThisWorks
                surface="admin-dealer-vault-iras"
                label="IRAS shift data"
                variant="icon"
              />
            </div>
          }
        >
          <p className="text-base font-semibold text-text">Capture history</p>
          <p className="text-sm text-text-muted">
            {isLoading
              ? 'Every day for this dealer.'
              : rows.length === 0
                ? 'Every day for this dealer.'
                : needsAttention === 0
                  ? `All ${rows.length} days accounted for.`
                  : `${needsAttention} of ${rows.length} days need attention.`}
          </p>
        </CardHeader>

        {isLoading ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
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
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<History width={28} height={28} strokeWidth={1.75} />}
            title="No days yet"
            description="Once this dealer has its first day — collected or typed in — every day from then on is listed here."
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
                    <TH>Data</TH>
                    <TH>Shift</TH>
                    <TH className="text-right">Rows</TH>
                    <TH>Captured at</TH>
                    <TH />
                  </TRow>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <TRow
                      key={r.businessDate}
                      // A day with no snapshot has nothing to open, so it is not
                      // clickable — a row that looks pressable and does nothing
                      // reads as a broken screen rather than an empty day.
                      clickable={!!r.snapshotId}
                      onClick={
                        r.snapshotId ? () => onOpen(r.snapshotId!) : undefined
                      }
                    >
                      <TD className="whitespace-nowrap font-medium">
                        {dateLabel(r.businessDate)}
                      </TD>
                      <TD>
                        <DayStateChip row={r} />
                      </TD>
                      <TD>
                        <DayTags row={r} />
                      </TD>
                      <TD className="whitespace-nowrap font-mono text-text-muted">
                        {r.selectedShiftTime || '—'}
                      </TD>
                      <TD className="text-right tabular-nums text-text-muted">
                        {r.snapshotId ? r.rowCount : '—'}
                      </TD>
                      <TD className="whitespace-nowrap text-text-muted">
                        {r.capturedAt ? formatDateTime(r.capturedAt) : '—'}
                      </TD>
                      <TD className="text-right">
                        <VerifyAction row={r} onVerify={setVerifying} />
                      </TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            </div>

            {/* Mobile card-stack (< md). */}
            <MobileCardList
              variant="rows"
              cards={rows.map((r) => ({
                key: r.businessDate,
                onClick: r.snapshotId ? () => onOpen(r.snapshotId!) : undefined,
                primary: (
                  <span className="block truncate font-medium text-text">
                    {dateLabel(r.businessDate)}
                  </span>
                ),
                primaryRight: <DayStateChip row={r} />,
                secondary: (
                  <span className="grid min-w-0 gap-1 text-xs">
                    {/* The sentence, not just the chip: "Not closed yet" reads
                        as a fault to anyone who does not already know a day
                        closes on tomorrow's readings. */}
                    <span className="min-w-0 text-text-muted">
                      {IRAS_DAY_STATE_HINT[r.state]}
                    </span>
                    <GapLines row={r} />
                    <DayTags row={r} />
                  </span>
                ),
                meta: (
                  <span className="flex flex-col items-end gap-1">
                    <span>
                      {r.capturedAt ? formatDateTime(r.capturedAt) : '—'}
                    </span>
                    <VerifyAction row={r} onVerify={setVerifying} />
                  </span>
                ),
              }))}
            />
          </>
        )}
      </CardContent>

      <VerifyDayDialog
        dealerId={dealerId}
        row={verifying}
        onClose={() => setVerifying(null)}
      />
    </Card>
  );
}

/** The day's headline state, with its explanation on hover. */
function DayStateChip({ row }: { row: IrasDayStateRow }) {
  return (
    <span
      className="inline-flex flex-col items-start gap-1"
      title={IRAS_DAY_STATE_HINT[row.state]}
    >
      <Badge intent={statusIntent('irasDayState', row.state)}>
        {IRAS_DAY_STATE_LABEL[row.state]}
      </Badge>
      <GapLines row={row} />
    </span>
  );
}

/**
 * The litres behind a mismatch, per grade.
 *
 * A chip saying "Does not add up" is an alarm with no number in it, and the
 * number is the whole reason to look: 1,100 L over is a dip taken early, 12,000 L
 * over is a tanker nobody entered. Shown for the accepted case too — an accepted
 * gap is still a gap, and hiding it once signed is how it stops being reviewed.
 */
function GapLines({ row }: { row: IrasDayStateRow }) {
  const loud = (row.gaps ?? []).filter((g) => g.loud);
  if (loud.length === 0) return null;
  return (
    <span className="grid gap-0.5">
      {loud.map((g) => (
        <span key={g.productKey} className="text-xs tabular-nums text-text-muted">
          {g.productLabel}: {formatLitres(Math.abs(g.unexplainedLitres))}{' '}
          {g.unexplainedLitres > 0 ? 'over' : 'short'}
        </span>
      ))}
    </span>
  );
}

/**
 * What is in the day and who put it there — the second dimension.
 *
 * Kept apart from the state chip because they answer different questions. A
 * hand-typed day can add up or not, and squashing "typed in" into the same chip
 * as "does not add up" would force one of the two facts off the screen.
 */
function DayTags({ row }: { row: IrasDayStateRow }) {
  if (!row.snapshotId) return <span className="text-xs text-text-subtle">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {row.source === 'MANUAL' ? (
        <Badge intent="info">Typed in</Badge>
      ) : (
        <Badge intent="neutral">From portal</Badge>
      )}
      {row.correctionCount > 0 ? (
        <Badge intent="neutral">
          {row.correctionCount} correction{row.correctionCount === 1 ? '' : 's'}
        </Badge>
      ) : null}
      {/* A failed retry never deletes the figures already collected, so it rides
          beside the day's own state rather than replacing it. */}
      {row.retryFailed ? <Badge intent="warning">Last retry failed</Badge> : null}
    </span>
  );
}

/** Accept a gap, or show who already did. */
function VerifyAction({
  row,
  onVerify,
}: {
  row: IrasDayStateRow;
  onVerify: (row: IrasDayStateRow) => void;
}) {
  if (row.state !== 'MISMATCH' && row.state !== 'MISMATCH_OK') return null;

  // An accepted day opens the SAME dialog. It is the only place the reason is
  // readable in full and the only way to withdraw the acceptance — leaving it as
  // plain text made a signature permanent, which is not what anybody agreed to.
  const label =
    row.state === 'MISMATCH_OK' && row.verification
      ? `Accepted by ${row.verification.byName || 'an admin'}`
      : // A stale acceptance is not "accept from scratch" — the figures moved
        // under a signature somebody already gave, and the wording has to say so
        // or it reads as if the first person's work was ignored.
        row.verification?.stale
        ? 'Re-check'
        : 'Accept';

  return (
    <Button
      size="sm"
      variant="ghost"
      className="max-w-full truncate"
      title={row.verification?.note}
      onClick={(e) => {
        // The row opens the snapshot drawer; this button does something else.
        e.stopPropagation();
        onVerify(row);
      }}
    >
      {label}
    </Button>
  );
}

/**
 * Sign for a day's gap.
 *
 * The reason is mandatory, at the field and again at the API. A verification
 * with no reason is a click, and six weeks later "why was a 3,000 L shortfall
 * signed off?" has to have an answer that is not "somebody pressed a button".
 */
function VerifyDayDialog({
  dealerId,
  row,
  onClose,
}: {
  dealerId: string;
  row: IrasDayStateRow | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const verify = useVerifyIrasDay();
  const unverify = useUnverifyIrasDay();
  const [note, setNote] = React.useState('');

  // Reset per day, so a reason typed for one date cannot be submitted against
  // another after the dialog is reopened.
  React.useEffect(() => {
    setNote(row?.verification?.note ?? '');
  }, [row?.businessDate, row?.verification?.note]);

  if (!row) return null;
  const loud = (row.gaps ?? []).filter((g) => g.loud);
  const trimmed = note.trim();

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={`${row.state === 'MISMATCH_OK' ? 'Accepted' : 'Accept'} — ${dateLabel(row.businessDate)}`}
      description="This day's figures do not add up. Say why that is expected, and your name goes on it."
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {row.verification ? (
            <Button
              variant="ghost"
              disabled={unverify.isPending}
              onClick={() => {
                unverify.mutate(
                  { dealerId, businessDate: row.businessDate },
                  {
                    onSuccess: () => {
                      toast.success('Acceptance withdrawn.');
                      onClose();
                    },
                    onError: (e) =>
                      toast.error(
                        e instanceof ApiError ? e.message : 'Could not withdraw it.',
                      ),
                  },
                );
              }}
            >
              Withdraw acceptance
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              trimmed.length === 0 ||
              verify.isPending ||
              // Nothing to submit: the day is already signed with this exact
              // reason and the figures have not moved under it.
              (row.state === 'MISMATCH_OK' && trimmed === row.verification?.note)
            }
            onClick={() => {
              verify.mutate(
                { dealerId, businessDate: row.businessDate, note: trimmed },
                {
                  onSuccess: () => {
                    toast.success('Day accepted.');
                    onClose();
                  },
                  onError: (e) =>
                    toast.error(
                      e instanceof ApiError ? e.message : 'Could not accept it.',
                    ),
                },
              );
            }}
          >
            {row.state === 'MISMATCH_OK' ? 'Update reason' : 'Accept this day'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-1 rounded-sm bg-neutral-soft p-3">
          {loud.map((g) => (
            <p key={g.productKey} className="text-sm tabular-nums text-text">
              <span className="font-medium">{g.productLabel}</span> is{' '}
              {formatLitres(Math.abs(g.unexplainedLitres))}{' '}
              {g.unexplainedLitres > 0 ? 'over' : 'short'} — more than the{' '}
              {formatLitres(g.threshold)} this grade is allowed to differ by.
            </p>
          ))}
        </div>

        {row.verification?.stale ? (
          <Callout intent="warning">
            {row.verification.byName || 'An admin'} accepted this day on{' '}
            {formatDateTime(row.verification.at)}, but the figures have changed
            since. Accepting again signs for the numbers above.
          </Callout>
        ) : null}

        <div className="grid gap-1">
          <Label htmlFor="verify-note">Why is this expected?</Label>
          <Textarea
            id="verify-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Tanker 4,500 L decanted after the shift closed; entered on the next day."
          />
          <p className="text-xs text-text-subtle">
            Stored with your name and shown on this row. Required.
          </p>
        </div>
      </div>
    </Dialog>
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
