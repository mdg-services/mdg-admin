import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Database,
  DownloadCloud,
  History,
  PencilLine,
  RefreshCw,
  Undo2,
} from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  Checkbox,
  EmptyState,
  MobileCardList,
  Skeleton,
  StatusChip,
  StickyActionBar,
  useToast,
} from '@/components/ui';
import { useDsrStaleReports, useRegenerateStaleDsr } from '@/hooks/api/useDsr';
import { useCollectIrasData, useStartManualIrasDay } from '@/hooks/api/useIrasData';
import {
  useCommitIrasCorrections,
  useIrasDay,
  useDealerCorrections,
} from '@/hooks/api/useIrasEdits';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatYmd, isYmd } from '@/lib/format';
import { useDsrRunWatcher } from '@/pages/dsr/useDsrRunWatcher';
import {
  IRAS_REPORT_CODES,
  IRAS_REPORT_LABELS,
  dealerCodeLabel,
  recAttributionWindow,
} from '@dk/shared';
import type { IrasDayEditorView, IrasReportCode } from '@dk/shared';

import { reportsAffected } from './describePending';
import { IrasEditGrid } from './IrasEditGrid';
import { ReviewApplyDialog } from './ReviewApplyDialog';
import { toChanges, usePendingChanges, useUnloadGuard } from './usePendingChanges';

/**
 * Receipts first, then stock, then the totalisers.
 *
 * Not the pipeline's collection order — the operator's. The single most frequent
 * reason anybody opens this screen is a tanker that was decanted and never
 * entered at the outlet, which lives in REC; a transposed meter reading is next
 * most common but is one cell, easily found. Putting the common case at the top
 * is worth more than matching the order the portal is scraped in.
 */
const SECTION_ORDER: IrasReportCode[] = ['REC', 'STK', 'TOT'];

/**
 * The shift data editor — correct what the portal got wrong for one dealer-day.
 *
 * A full page rather than a drawer: these reports run to 36 columns, and a 720px
 * drawer turns a spreadsheet into a horizontal-scrolling puzzle.
 *
 * Nothing here writes until "Apply" — see the sticky footer. Applying does NOT
 * regenerate: a rebuild can drive an IndianOil portal session, so it stays a
 * deliberate second click, exactly as it did for the receipts editor this
 * replaces.
 */
export function ShiftDataEditorPage() {
  const params = useParams<{ dealerId: string; businessDate: string }>();
  const dealerId = params.dealerId ?? '';
  const businessDate = params.businessDate ?? '';
  const navigate = useNavigate();
  const toast = useToast();

  const dayQ = useIrasDay(dealerId, businessDate);
  const day = dayQ.data;

  const pending = usePendingChanges(`${dealerId}|${businessDate}`);
  useUnloadGuard(pending.count > 0);

  const [showAll, setShowAll] = React.useState(false);
  const [reviewing, setReviewing] = React.useState(false);
  const [applied, setApplied] = React.useState<{ changes: number; staleDates: string[] } | null>(
    null,
  );

  const commit = useCommitIrasCorrections(dealerId, businessDate);
  const collect = useCollectIrasData();
  const startDay = useStartManualIrasDay();
  // Whether the portal can be asked at all. For an outlet with no IRAS account
  // the attachment is left paused, and offering "Collect" would send the
  // operator down a path that cannot finish.
  const canCollect = day?.dealer.portalCollection === 'ACTIVE';
  const regenerate = useRegenerateStaleDsr(dealerId);
  const run = useDsrRunWatcher(dealerId, 'Reports rebuilt.');
  // Re-read after the rebuild rather than claiming success: the generator repairs
  // a bounded forward chain, and `regenerate-stale` is designed to need a second
  // press in some cases. Saying "nothing is out of date" without checking is how
  // an operator walks away from a half-rebuilt week.
  const staleQ = useDsrStaleReports(dealerId, !!applied || !!day?.dsr.attached);

  // Cmd/Ctrl+Z over the pending set. Never touches the server.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const el = document.activeElement;
      // Let the browser's own undo win inside a field being typed in.
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      pending.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  if (!isYmd(businessDate)) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="That is not a business date"
        description="Open a day from the Data Vault."
        cta={<Button onClick={() => navigate('/data-vault')}>Back to the Vault</Button>}
      />
    );
  }

  if (dayQ.isLoading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (dayQ.isError || !day) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load this day"
        description={
          dayQ.error instanceof ApiError ? dayQ.error.message : 'Please try again.'
        }
        cta={<Button onClick={() => void dayQ.refetch()}>Try again</Button>}
      />
    );
  }

  const readOnly = day.dealer.archived;
  const affected = reportsAffected(day);
  const stale = staleQ.data?.reports ?? [];

  async function onApply(reason: string) {
    try {
      const result = await commit.mutateAsync({
        revision: day!.revision,
        reason,
        ...toChanges(pending.state),
      });
      setReviewing(false);
      pending.discardAll();
      setApplied({ changes: result.changes.length, staleDates: result.staleDates });
      if (result.changes.length === 0) {
        toast.info('Nothing changed — the figures on record already match.');
      } else if (result.staleDates.length === 0) {
        toast.success('Corrections applied. No generated report is affected yet.');
      } else {
        toast.success(
          `Corrections applied. ${result.staleDates.length} report${
            result.staleDates.length === 1 ? '' : 's'
          } now need regenerating.`,
        );
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? `Your changes were not applied. Nothing has changed. ${err.message}`
          : 'Your changes were not applied. Nothing has changed.',
      );
    }
  }

  return (
    // No bottom spacer: the pending bar below is `sticky`, not `fixed`, so it
    // takes its own space at the end of the column and nothing is buried under
    // it. The old `pb-28` was a guess that was already short on a phone, where
    // the bar stacks to three wrapped lines.
    <div>
      <Header day={day} onCollect={() => runCollect()} collecting={collect.isPending} />

      {day.dealer.archived ? (
        <Callout intent="warning" className="mt-3">
          This dealer is archived. Their data is read-only.
        </Callout>
      ) : null}

      <Banners day={day} pending={pending.count} />

      {applied ? (
        <AppliedNotice
          applied={applied}
          stale={stale}
          busy={regenerate.isPending || run.busy}
          onRegenerate={() =>
            regenerate.mutate(undefined, {
              onSuccess: (data) => {
                run.watch(data.runId);
                toast.success(
                  `Rebuilding from ${formatYmd(data.businessDate)} — this updates when it lands.`,
                );
              },
              onError: (err) =>
                toast.error(
                  err instanceof ApiError ? err.message : 'Could not start the rebuild',
                ),
            })
          }
          onDismiss={() => setApplied(null)}
          dealerId={dealerId}
          businessDate={businessDate}
        />
      ) : null}

      {!day.snapshot ? (
        <Card className="mt-3 md:mt-4">
          <CardContent>
            <EmptyState
              icon={<Database width={28} height={28} strokeWidth={1.75} />}
              title={
                canCollect
                  ? 'Nothing has been collected for this day'
                  : 'This outlet’s figures are entered by hand'
              }
              description={
                canCollect
                  ? 'There are no portal rows to correct yet. Collect the day first — it takes about a minute.'
                  : 'This dealer has no portal collection running, so nothing will arrive on its own. Open the day and type the shift in: the meter readings, each tank’s dip and stock, and any tanker that came.'
              }
              cta={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {canCollect ? (
                    <Button
                      variant="secondary"
                      loading={collect.isPending}
                      leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
                      onClick={() => runCollect()}
                    >
                      Collect this day
                    </Button>
                  ) : null}
                  <Button
                    variant={canCollect ? 'ghost' : 'secondary'}
                    loading={startDay.isPending}
                    leftIcon={<PencilLine width={14} height={14} strokeWidth={1.75} />}
                    onClick={() => runStartDay()}
                  >
                    Start this day by hand
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      ) : day.snapshot.status === 'FAILED' ? (
        <Card className="mt-3 md:mt-4">
          <CardContent>
            <div className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm text-danger">
              <AlertTriangle
                width={16}
                height={16}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0"
              />
              <div>
                <p className="font-medium">This collection failed</p>
                {day.snapshot.failureReason ? (
                  <p className="mt-0.5">{day.snapshot.failureReason}</p>
                ) : null}
                <p className="mt-0.5">
                  Correcting figures needs a collected day. Re-collect it, then come back.
                </p>
              </div>
            </div>
            <div className="mt-3">
              <Button
                variant="secondary"
                loading={collect.isPending}
                leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
                onClick={() => runCollect()}
              >
                Re-collect this day
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text-muted">
              Correct what the portal got wrong. Your corrections are what the report uses; the
              portal’s own values are kept and always visible.
            </p>
            <Checkbox
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              label="Show all portal columns"
              labelClassName="shrink-0 text-text-muted"
            />
          </div>

          {day.dsr.attached ? null : (
            <Callout className="mt-3">
              This dealer does not have the Daily Sales Report service attached, so no report is
              built from these figures. Corrections are still recorded.
            </Callout>
          )}
          {day.dsr.configError ? (
            <Callout intent="warning" className="mt-3">
              {day.dsr.configError}
            </Callout>
          ) : null}

          <div className="mt-3 grid gap-3 md:gap-4">
            {SECTION_ORDER.filter((c) => IRAS_REPORT_CODES.includes(c)).map((code) => (
              <Section key={code} code={code} day={day}>
                <IrasEditGrid
                  code={code}
                  dataset={day.snapshot?.datasets[code]}
                  corrections={day.corrections}
                  pending={pending}
                  products={day.dsr.products}
                  previousTotReadings={day.previousTotReadings}
                  showAllColumns={showAll}
                  readOnly={readOnly}
                />
              </Section>
            ))}
          </div>

          <CorrectionHistory dealerId={dealerId} />
        </>
      )}

      {pending.count > 0 ? (
        <PendingBar
          count={pending.count}
          affected={affected}
          canUndo={pending.canUndo}
          onUndo={pending.undo}
          onDiscard={pending.discardAll}
          onReview={() => setReviewing(true)}
        />
      ) : null}

      {reviewing ? (
        <ReviewApplyDialog
          open={reviewing}
          onClose={() => setReviewing(false)}
          day={day}
          pending={pending}
          applying={commit.isPending}
          onApply={(reason) => void onApply(reason)}
        />
      ) : null}
    </div>
  );

  /**
   * Open an empty day so the shift can be typed into it.
   *
   * Nothing is entered here — the grid appears and every figure goes in as a
   * hand-added row, exactly as a correction to a portal day does. That is what
   * keeps the litres marked as a person's rather than the portal's.
   */
  function runStartDay() {
    startDay.mutate(
      { dealerId, businessDate },
      {
        onSuccess: () =>
          toast.success('Day opened. Add a row for each nozzle, each tank, and any tanker that came.'),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Could not open the day'),
      },
    );
  }

  function runCollect() {
    collect.mutate(
      { dealerId, businessDate },
      {
        onSuccess: () =>
          toast.success(
            'Collection queued — the portal takes about a minute. Reload this day when it lands.',
          ),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Could not start the collection'),
      },
    );
  }
}

/* ──────────────────────────────── header ──────────────────────────────── */

function Header({
  day,
  onCollect,
  collecting,
}: {
  day: IrasDayEditorView;
  onCollect: () => void;
  collecting: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const shift = day.snapshot?.shift;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Link
          to={`/dealers/${day.dealer.id}?tab=data-vault`}
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft width={14} height={14} strokeWidth={1.75} />
          Back to the dealer’s Data Vault
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="truncate text-lg font-semibold text-text">
            Shift data · {dealerCodeLabel(day.dealer.code)}
          </h1>
          {day.snapshot ? (
            <StatusChip kind="irasSnapshot" value={day.snapshot.status} />
          ) : (
            <Badge intent="neutral">Not collected</Badge>
          )}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
          <span>{formatYmd(day.businessDate, { weekday: true })}</span>
          {day.dealer.code ? <span className="font-mono">· {day.dealer.code}</span> : null}
          {day.dealer.roCode ? <span>· RO {day.dealer.roCode}</span> : null}
          {day.snapshot ? <span>· collected {formatDateTime(day.snapshot.capturedAt)}</span> : null}
        </p>
        {shift ? (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              // `inline-flex` rather than the block button it was: a bare
              // `text-xs` line is 16px tall, and this is the only route to the
              // note explaining that a day wrong across several rows at once is
              // usually a shift problem, not a figures problem.
              className="mt-1 inline-flex min-h-11 items-center text-left text-xs text-text-subtle underline md:mt-1 md:min-h-0"
            >
              Shift {shift.selectedShiftTime || '—'} · configured{' '}
              {shift.configuredTime.slice(0, 5)}
              {shift.candidateShiftTimes.length > 1
                ? ` · ${shift.candidateShiftTimes.length - 1} other shift${
                    shift.candidateShiftTimes.length === 2 ? '' : 's'
                  } were offered`
                : ''}
            </button>
            {open ? (
              <div className="mt-1 max-w-prose rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-text-muted">
                Every row below belongs to one closing shift. If the day looks wrong across several
                rows at once, the shift is usually the cause — re-collect the day, and check the
                dealer’s configured shift time, before correcting figures by hand.
                <span className="mt-1 block font-mono text-[11px] text-text-subtle">
                  {shift.candidateShiftTimes.join(' · ') || 'no other shift offered'}
                </span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={collecting}
          leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
          onClick={onCollect}
        >
          Re-collect
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────────────────── banners ──────────────────────────────── */

function Banners({ day, pending }: { day: IrasDayEditorView; pending: number }) {
  const corrections = day.corrections.length;
  return (
    <div className="mt-3 grid gap-2">
      {day.duplicateRisk.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle width={16} height={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">
              The portal may now be reporting {day.duplicateRisk.length === 1 ? 'a row' : 'rows'} you
              already added by hand
            </p>
            <ul className="mt-0.5 grid gap-0.5">
              {day.duplicateRisk.map((r) => (
                <li key={r.correction.id}>
                  {r.correction.rowLabel} was added by hand, and the portal now sends{' '}
                  {r.portalRows.length === 1 ? 'a row' : `${r.portalRows.length} rows`} for it. If
                  they are the same delivery it is being counted twice — delete the hand-added row.
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {day.orphaned.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-sm text-warning">
          <AlertTriangle width={16} height={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">
              {day.orphaned.length} correction{day.orphaned.length === 1 ? '' : 's'} no longer match
              this day’s data
            </p>
            <p className="mt-0.5">
              The rows they were made on are not in the latest collection, so they are{' '}
              <strong>not being used</strong>.
            </p>
            {/* One bordered block per orphan below md. Run together as bare
                12px lines they wrap into a single paragraph at 296px, and this
                banner exists precisely to say WHICH corrections are silently
                not being applied. The compact inline list returns at md. */}
            <ul className="mt-1 grid gap-2 text-xs md:gap-0.5">
              {day.orphaned.map((o) => (
                <li
                  key={o.id}
                  className="rounded-md border border-warning/40 px-2 py-1.5 md:border-0 md:px-0 md:py-0"
                >
                  <span className="block font-medium md:inline">
                    {o.code} · {o.rowLabel}
                  </span>
                  <span className="block tabular-nums md:ml-1 md:inline">
                    {o.field === '*' ? 'whole row' : o.field}: {o.portalValue ?? '—'} →{' '}
                    {o.value ?? '—'}
                  </span>
                  <span className="mt-0.5 block break-words md:ml-1 md:mt-0 md:inline">
                    · {o.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {day.portalChanged.length > 0 ? (
        <Callout intent="warning">
          The portal has re-sent this day and now reports different values for{' '}
          {day.portalChanged.length} cell{day.portalChanged.length === 1 ? '' : 's'} you had
          corrected. Your corrections are still being used — check whether they are still needed.
        </Callout>
      ) : null}

      {corrections > 0 && pending === 0 ? (
        <Callout intent="info">
          This day has {corrections} correction{corrections === 1 ? '' : 's'}. Reports are using the
          corrected figures.
        </Callout>
      ) : null}

      {day.snapshot?.lastFailure ? (
        <Callout intent="warning">
          The data below is good — but the latest re-collection attempt failed:{' '}
          {day.snapshot.lastFailure.reason} ({formatDateTime(day.snapshot.lastFailure.at)}).
        </Callout>
      ) : null}
    </div>
  );
}

/* ────────────────────────────── one dataset ───────────────────────────── */

function Section({
  code,
  day,
  children,
}: {
  code: IrasReportCode;
  day: IrasDayEditorView;
  children: React.ReactNode;
}) {
  const dataset = day.snapshot?.datasets[code];
  const mine = day.corrections.filter((c) => c.code === code);
  const attribution = code === 'REC' ? recAttributionWindow(dataset?.window) : null;
  return (
    <Card>
      <CardContent>
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-text">
            {code}
          </span>
          <h2 className="text-sm font-semibold text-text">{IRAS_REPORT_LABELS[code]}</h2>
          <span className="text-xs text-text-subtle">
            {dataset ? `${dataset.rowCount} portal row${dataset.rowCount === 1 ? '' : 's'}` : 'not collected'}
            {mine.length > 0 ? ` · ${mine.length} corrected` : ''}
          </span>
        </div>
        {/*
          Deliveries are the one report whose rows are not all this day's. The
          portal answers on when a delivery was entered, so it sends several
          days' worth; the report counts each on the day it was DECANTED. Saying
          which day that is, here, is what stops someone correcting a row this
          day's report never reads.
        */}
        {code === 'REC' && attribution ? (
          <p className="mb-2 text-xs text-text-subtle">
            This day counts deliveries decanted {fmtWindow(attribution)}. Rows outside it are shown
            so you can see them, and are counted on their own day&rsquo;s report.
          </p>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}

/** `16 Aug 06:30 → 17 Aug 06:30`, in IST, as the portal writes its times. */
function fmtWindow({ from, to }: { from: Date; to: Date }): string {
  const one = (d: Date): string =>
    d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  return `${one(from)} → ${one(to)}`;
}

/* ─────────────────────── applied → regenerate → verify ─────────────────── */

function AppliedNotice({
  applied,
  stale,
  busy,
  onRegenerate,
  onDismiss,
  dealerId,
  businessDate,
}: {
  applied: { changes: number; staleDates: string[] };
  stale: Array<{ businessDate: string }>;
  busy: boolean;
  onRegenerate: () => void;
  onDismiss: () => void;
  dealerId: string;
  businessDate: string;
}) {
  const done = stale.length === 0;
  return (
    <div
      className={cn(
        'mt-3 flex flex-wrap items-start gap-3 rounded-md px-3 py-2.5 text-sm',
        done ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
      )}
    >
      {done ? (
        <CheckCircle2 width={16} height={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      ) : (
        <History width={16} height={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {applied.changes === 0
            ? 'Nothing changed'
            : `${applied.changes} change${applied.changes === 1 ? '' : 's'} applied`}
        </p>
        <p className="mt-0.5">
          {done
            ? 'Every report for this dealer is up to date.'
            : `${stale.length} report${stale.length === 1 ? '' : 's'} still need regenerating (${stale
                .slice(0, 5)
                .map((s) => formatYmd(s.businessDate))
                .join(', ')}${stale.length > 5 ? '…' : ''}).`}
        </p>
        {done ? (
          <Link
            to={`/dsr/dealers/${dealerId}?date=${businessDate}`}
            className="mt-0.5 inline-block font-semibold underline"
          >
            Open the report for {formatYmd(businessDate)}
          </Link>
        ) : null}
      </div>
      {done ? (
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      ) : (
        <Button
          size="sm"
          loading={busy}
          leftIcon={<RefreshCw width={14} height={14} strokeWidth={1.75} />}
          onClick={onRegenerate}
        >
          {busy ? 'Rebuilding…' : 'Regenerate reports'}
        </Button>
      )}
    </div>
  );
}

/* ─────────────────────────── the sticky footer ─────────────────────────── */

/**
 * What is unsaved, and the three ways out of it.
 *
 * `StickyActionBar` in its default `sticky` mode rather than the viewport-fixed
 * bar this was. Fixed at `bottom-0` painted straight over the mobile tab bar and
 * dropped its own buttons into the Android gesture strip, and the page's
 * compensating `pb-28` was already too short for the three lines this wraps to
 * at 360px. Sticky needs neither: the tab bar is an in-flow flex child of the
 * shell, so a sticky element inside `main` already rests above it, and the bar
 * reserves its own height instead of the page guessing at it.
 *
 * `below="wrap"` so that three short labels stay one line on a phone instead of
 * becoming three stacked 44px blocks — 148px of a 640px screen. That used to be
 * a nested `ActionRow` with `md:contents` to dissolve the wrapper at md; the bar
 * takes the layout as a prop now, so there is no wrapper to dissolve.
 */
function PendingBar({
  count,
  affected,
  canUndo,
  onUndo,
  onDiscard,
  onReview,
}: {
  count: number;
  affected: { dates: string[]; sharedDates: string[] };
  canUndo: boolean;
  onUndo: () => void;
  onDiscard: () => void;
  onReview: () => void;
}) {
  return (
    <StickyActionBar
      below="wrap"
      summaryOnMobile
      // `stick-bottom` inside the bar already spans the page gutter downwards,
      // but nothing cancels it sideways: without this the strip stops one gutter
      // short of each edge and the page scrolls past it in both side margins, so
      // its `border-t` reads as a floating line rather than a bar. A negative
      // margin, deliberately — the bar composes its own `px-3`, and a padding
      // override from a call site would land beside it and lose on stylesheet
      // order.
      className="-mx-[var(--app-gutter)] md:mx-0"
      summary={
        <>
          <span className="block font-medium text-text">
            {count} change{count === 1 ? '' : 's'} pending · nothing has been saved
          </span>
          <span className="mt-0.5 block">
            {affected.dates.length === 0
              ? 'No generated report is affected yet.'
              : `${affected.dates.length} report${
                  affected.dates.length === 1 ? '' : 's'
                } will need regenerating, from ${formatYmd(affected.dates[0]!)}.`}
            {affected.sharedDates.length > 0
              ? ` ${affected.sharedDates.length} of them ${
                  affected.sharedDates.length === 1 ? 'has' : 'have'
                } already been shared with the dealer.`
              : ''}
          </span>
        </>
      }
    >
      {canUndo ? (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Undo2 width={14} height={14} strokeWidth={1.75} />}
          onClick={onUndo}
        >
          Undo
        </Button>
      ) : null}
      <Button variant="secondary" size="sm" onClick={onDiscard}>
        Discard all
      </Button>
      <Button size="sm" onClick={onReview}>
        Review &amp; apply
      </Button>
    </StickyActionBar>
  );
}

/* ────────────────────── what we have corrected before ─────────────────── */

/**
 * Every correction on this dealer, across days.
 *
 * The receipts editor had a "entered by hand so far" list, and it was the only
 * place anybody could see what MDG had overridden for a dealer across dates. The
 * audit log is not a substitute — it stores one JSON blob per commit. This is what
 * you open when a dealer disputes a month.
 */
function CorrectionHistory({ dealerId }: { dealerId: string }) {
  const [open, setOpen] = React.useState(false);
  const q = useDealerCorrections(dealerId, open);
  const rows = q.data?.corrections ?? [];

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text md:min-h-0"
      >
        <Copy width={14} height={14} strokeWidth={1.75} />
        {open ? 'Hide' : 'Show'} every correction on this dealer
      </button>
      {open ? (
        q.isLoading ? (
          <Skeleton className="mt-2 h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            Nothing has been corrected by hand for this dealer.
          </p>
        ) : (
          <>
            {/* Below md: one card per correction. As a bare 12px wrap-list at
                296px each entry ran to four or five lines with nothing between
                them, so consecutive corrections read as one ribbon — and this is
                what gets opened when a dealer disputes a month. */}
            <MobileCardList
              className="mt-2"
              cards={rows.map((c) => ({
                key: c.id,
                primary: (
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-text">{formatYmd(c.businessDate)}</span>
                    <span className="font-mono text-xs text-text-muted">{c.code}</span>
                  </span>
                ),
                primaryRight:
                  c.kind === 'FIELD' ? (
                    <span className="text-sm tabular-nums text-text">
                      {c.portalValue ?? '—'} → {c.value ?? '—'}
                    </span>
                  ) : undefined,
                primaryRightWidth: 'clamp' as const,
                secondary: (
                  <span>
                    {c.rowLabel} ·{' '}
                    {c.field === '*'
                      ? c.kind === 'ADDED_ROW'
                        ? 'row added'
                        : 'row left out'
                      : c.field}
                  </span>
                ),
                meta: (
                  <span className="block break-words">
                    {c.reason} · {formatDateTime(c.at)}
                  </span>
                ),
              }))}
            />
            <ul className="mt-2 hidden gap-1 text-xs text-text-muted md:grid">
              {rows.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-text">{formatYmd(c.businessDate)}</span>
                  <span className="font-mono">{c.code}</span>
                  <span>{c.rowLabel}</span>
                  <span>{c.field === '*' ? (c.kind === 'ADDED_ROW' ? 'row added' : 'row left out') : c.field}</span>
                  {c.kind === 'FIELD' ? (
                    <span className="tabular-nums">
                      {c.portalValue ?? '—'} → {c.value ?? '—'}
                    </span>
                  ) : null}
                  <span className="text-text-subtle">· {c.reason}</span>
                  <span className="text-text-subtle">· {formatDateTime(c.at)}</span>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </div>
  );
}
