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
  SegmentedControl,
  Skeleton,
  Spinner,
  StatusChip,
  StickyActionBar,
  useToast,
} from '@/components/ui';
import {
  useDsrReports,
  useDsrStaleReports,
  useGenerateDsr,
  useRegenerateStaleDsr,
} from '@/hooks/api/useDsr';
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
import { ShiftSheet, shiftSheetAvailable, useShiftSheetModel } from './ShiftSheet';
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

  const [showAll, setShowAll] = React.useState(false);
  const [reviewing, setReviewing] = React.useState(false);
  const [applied, setApplied] = React.useState<{
    changes: number;
    staleDates: string[];
    /** How many hand-typed figures are on record, on a day typed by hand. */
    figures: number | null;
  } | null>(null);
  /** Set once this page has asked for a report to be built, so "not built yet"
   *  and "the build failed" can be told apart rather than reading the same. */
  const [buildAsked, setBuildAsked] = React.useState(false);

  /**
   * Which of the two surfaces is on screen.
   *
   * `null` means "whichever suits this day", resolved on every render rather
   * than settled in an effect — the day arrives asynchronously, and an effect
   * would show the wrong surface for one frame. A portal day never gets the
   * choice at all: see `shiftSheetAvailable`.
   */
  const [mode, setMode] = React.useState<'sheet' | 'grid' | null>(null);
  const sheetAvailable = shiftSheetAvailable(day);
  const activeMode: 'sheet' | 'grid' = sheetAvailable ? (mode ?? 'sheet') : 'grid';

  const commit = useCommitIrasCorrections(dealerId, businessDate);
  const collect = useCollectIrasData();
  const startDay = useStartManualIrasDay();
  /*
   * Two different questions about the portal, deliberately kept apart.
   *
   * `portalCollects` is whether the portal is where this outlet's figures come
   * from. An outlet with no IRAS account keeps the attachment attached but
   * paused, so its day never arrives on its own and an empty day has to lead
   * with typing the shift in rather than with collecting it.
   *
   * `canCollect` is whether asking the portal can finish at all, and that is a
   * question about the route rather than about the status.
   * `POST /iras-data/dealers/:dealerId/collect` refuses two things and only two:
   * a dealer with no IRAS Shift Data attachment at all, and an ARCHIVED dealer,
   * which its own guard turns away with "Dealer not found" before it can open a
   * portal session. A PAUSED attachment is accepted, the run is created and the
   * collection goes ahead.
   *
   * Both halves have cost something. Reading the STATUS here took Re-collect
   * away from a collected dealer whose pipeline was merely paused — routine on
   * the eight — and that button is the only way to fix a bad collection. Reading
   * the attachment ALONE left it live on an archived dealer, directly under the
   * banner saying their data is read-only, where every press came back "Dealer
   * not found" — a button that cannot work, answering with the name of a dealer
   * whose day is on screen.
   */
  const portalCollects = day?.dealer.portalCollection === 'ACTIVE';
  const canCollect = !!day && !day.dealer.archived && day.dealer.portalCollection !== 'NONE';
  const regenerate = useRegenerateStaleDsr(dealerId);
  // The toast a finished run leaves behind, and it deliberately does not say
  // "reports are up to date". This one watcher covers a single date's build AND
  // a regenerate-stale of a whole chain, and nothing here has checked either —
  // the line below is what checks, and the notice names whatever is left.
  const run = useDsrRunWatcher(
    dealerId,
    'That build finished. Anything still out of date is listed on this page.',
  );
  // Re-read after the rebuild rather than claiming success: the generator repairs
  // a bounded forward chain, and `regenerate-stale` is designed to need a second
  // press in some cases. Saying "nothing is out of date" without checking is how
  // an operator walks away from a half-rebuilt week.
  const staleQ = useDsrStaleReports(dealerId, !!applied || !!day?.dsr.attached);
  // Whether a report now exists for this date. Read from the reports list rather
  // than from the day payload because a finished run invalidates the `dsr` cache
  // and not this day's — so this is the query that actually refreshes when the
  // report lands.
  const reportsQ = useDsrReports(dealerId);
  const generate = useGenerateDsr();
  const reportExists = (reportsQ.data?.reports ?? []).some(
    (r) => r.businessDate === businessDate,
  );
  /*
   * Building — and still building until the answer has actually been re-read.
   *
   * `useDsrRunWatcher` invalidates the DSR queries and drops the run id in one
   * effect, so `run.busy` goes false in the same commit in which `reportsQ` is
   * still holding the list it read BEFORE the build. `reportExists` is false
   * for that whole window, and the notice used to spend it telling the operator
   * the report could not be built, beside the toast saying it had been, and
   * offering a Try again that queues a second, redundant run. On a 2G phone the
   * window is seconds. `reportsQ` is the query that answers "is there a report
   * for this date", so the building state lasts until it has answered.
   */
  const building =
    generate.isPending ||
    regenerate.isPending ||
    run.busy ||
    (buildAsked && !reportExists && reportsQ.isFetching);

  const sheet = useShiftSheetModel({
    day,
    pending,
    readOnly: day?.dealer.archived ?? false,
    active: sheetAvailable && activeMode === 'sheet',
  });

  /*
   * Unsaved work, in the operator's terms.
   *
   * On the full grid every pending change is something a person did, so the
   * count is the answer. On the shift sheet the day arrives with eight empty
   * rows the SYSTEM proposed — losing those loses nothing — so the guard asks
   * whether anything has actually been typed. Prompting somebody who opened a
   * day and walked away teaches them to dismiss the prompt that matters.
   *
   * That question is READ off the sheet's model, not asked again here. The model
   * already publishes it, counted in `@dk/shared` over the rows in force, and it
   * is the same answer the sheet's own "Discard all" confirm turns on — so the
   * two guards over one morning's typing cannot disagree.
   *
   * It is `anythingTyped` rather than the figure count beside it, and that is
   * the whole point of the field. `progress.entered` counts the day's PLANNED
   * figures: the six meter readings and the two tanks' stock and product dip. A
   * tanker is not one of them — a morning with no delivery is a complete morning
   * — so an operator whose first act was "A tanker came" and 12,000 litres into
   * the invoiced quantity had typed nothing at all as far as both guards could
   * see. Close the tab, or press Discard, and the delivery went without a prompt
   * or a confirm; type the rest of the morning without it and the previous day's
   * report is 12,000 L of receipts short, which on a permissible band of about
   * 55 L is the suspension advisory.
   */
  useUnloadGuard(pending.count > 0 && (activeMode !== 'sheet' || sheet.progress.anythingTyped));

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
    const typedByHand = sheetAvailable && activeMode === 'sheet';
    // A fresh save starts a fresh answer to "has a report been built for this
    // day": the previous attempt's verdict must not colour this one's.
    setBuildAsked(false);
    const figures = typedByHand ? sheet.progress.entered : null;
    try {
      const result = await commit.mutateAsync({
        revision: day!.revision,
        reason,
        ...toChanges(pending.state),
        // The statement "this pump did not run today", on the commit body only.
        // It is written into the audit entry and never into a correction: the
        // shared field policy would reject a column the portal does not send,
        // and teaching that table a field the engine never reads is exactly what
        // the DSR's own field test exists to prevent.
        //
        // Sent whichever surface pressed Apply. The statement is made on the
        // shift sheet and lives in the pending set, so it survives a switch to
        // the Full grid — but gating it on the surface that happened to be on
        // screen at Apply saved the zero and threw away the only durable record
        // that a person deliberately reported a nozzle as having sold nothing.
        // A portal day cannot reach the sheet, so this stays empty there.
        ...(sheet.acknowledgedUnchangedNozzles.length > 0
          ? { acknowledgedUnchangedNozzles: sheet.acknowledgedUnchangedNozzles }
          : {}),
      });
      setReviewing(false);
      /*
       * Every line from here down runs on a commit the server has accepted, and
       * that is now true whatever the network does next. `useCommitIrasCorrections`
       * holds the save until this day has been re-read — so the figures are back
       * on screen before the pending set is emptied — but it stops holding it
       * after eight seconds, because a phone that loses the signal in that second
       * would otherwise leave a saved morning sitting under "you have unsaved
       * work" with a spinner and no way out. Emptying the set here is what takes
       * the unload guard down, so it must not be behind a wait that can outlast
       * the outage.
       */
      pending.discardAll();
      setApplied({ changes: result.changes.length, staleDates: result.staleDates, figures });
      for (const warning of result.warnings ?? []) toast.info(warning);
      /*
       * Saved figures are not a report, and the button promised one.
       *
       * The primary on a day typed by hand reads "Save the shift and build the
       * report", so the build is chained after EVERY successful save, not only
       * the first-ever one. It used to be chained only when nothing was flagged
       * stale, which meant the promise was kept on the first save of a date and
       * quietly broken on every re-save — exactly the saves where a report
       * already exists and is now wrong.
       *
       * Generating THIS date covers both cases with one call: it builds a
       * report that never existed, it rebuilds one that did, and the generator
       * then walks forward re-closing each consecutive later day that already
       * has a report (`dsr-report/index.ts`, "Heal the forward chain"), which is
       * the same repair `regenerate-stale` would have asked for. Anything it
       * cannot reach stays on the stale list, and the notice below still offers
       * Regenerate for it.
       */
      const willBuild = typedByHand && day!.dsr.attached && result.changes.length > 0;
      if (result.changes.length === 0) {
        toast.info('Nothing changed — the figures on record already match.');
      } else if (result.staleDates.length === 0) {
        toast.success(
          typedByHand
            ? 'Shift saved.'
            : 'Corrections applied. No generated report is affected yet.',
        );
      } else {
        toast.success(
          willBuild
            ? `Shift saved. Rebuilding ${result.staleDates.length} report${
                result.staleDates.length === 1 ? '' : 's'
              } that used these figures.`
            : `Corrections applied. ${result.staleDates.length} report${
                result.staleDates.length === 1 ? '' : 's'
              } now need regenerating.`,
        );
      }
      if (willBuild) buildReport();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? `Your changes were not applied. Nothing has changed. ${err.message}`
          : 'Your changes were not applied. Nothing has changed.',
      );
    }
  }

  /** Build the report for this day, and watch the run to completion in place. */
  function buildReport() {
    setBuildAsked(true);
    generate.mutate(
      { dealerId, businessDate },
      {
        onSuccess: (data) => run.watch(data.runId),
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.message : 'Could not start building the report',
          ),
      },
    );
  }

  return (
    // No bottom spacer: the pending bar below is `sticky`, not `fixed`, so it
    // takes its own space at the end of the column and nothing is buried under
    // it. The old `pb-28` was a guess that was already short on a phone, where
    // the bar stacks to three wrapped lines.
    <div>
      <Header
        day={day}
        onCollect={() => runCollect()}
        collecting={collect.isPending}
        canCollect={canCollect}
      />

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
          staleUnreadable={staleQ.isError}
          busy={building}
          reportExists={reportExists}
          reportsUnreadable={reportsQ.isError}
          buildAsked={buildAsked}
          onBuild={() => buildReport()}
          dsrAttached={day.dsr.attached}
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
                portalCollects
                  ? 'Nothing has been collected for this day'
                  : 'This outlet’s figures are entered by hand'
              }
              description={
                portalCollects
                  ? 'There are no portal rows to correct yet. Collect the day first — it takes about a minute.'
                  : day.dsr.products.length === 0
                    ? 'This outlet has no portal collection, so nothing arrives on its own — and no Daily Sales Report layout either, so we do not yet know which nozzles and tanks it has. Set the layout up on the dealer’s Services tab and the shift sheet will lay itself out.'
                    : `This outlet has no portal collection, so nothing arrives on its own. Opening the day sets out ${layoutSentence(day)}, ready for this morning’s figures.`
              }
              /* Nothing to press on an archived dealer: both routes behind these
                 buttons refuse one outright, and the banner above already says
                 their data is read-only. Offering a dead action under that
                 sentence is how an operator ends up believing the archive is
                 the thing that is broken. */
              cta={
                readOnly ? undefined : (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {portalCollects ? (
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
                      variant={portalCollects ? 'ghost' : 'secondary'}
                      loading={startDay.isPending}
                      leftIcon={<PencilLine width={14} height={14} strokeWidth={1.75} />}
                      onClick={() => runStartDay()}
                    >
                      {/* The shift sheet is promised by name only where there is
                          a layout for it to lay out. Without one the day opens on
                          the full grid, and a button that said "Type the shift
                          for 31 Aug 2026" would have promised a screen the
                          operator is not about to get. */}
                      {portalCollects || day.dsr.products.length === 0
                        ? 'Start this day by hand'
                        : `Type the shift for ${formatYmd(businessDate)}`}
                    </Button>
                  </div>
                )
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
                {/* What to do next, and only what this dealer can actually do.
                    "Re-collect it, then come back" was said to every failed day
                    — including an archived dealer's, where the route answers
                    "Dealer not found", and one whose attachment has since been
                    removed, where it answers 404. An instruction nobody can
                    follow, under a red panel, on the one screen that exists to
                    get a wrong day right. */}
                <p className="mt-0.5">
                  {canCollect
                    ? 'Correcting figures needs a collected day. Re-collect it, then come back.'
                    : readOnly
                      ? 'Correcting figures needs a collected day. This dealer is archived, so nothing can be collected or corrected here.'
                      : 'Correcting figures needs a collected day, and this dealer has no IRAS Shift Data service attached to collect one. Attach it on their Services tab, then re-collect.'}
                </p>
              </div>
            </div>
            {/* The header's Re-collect and this one are the same button under
                the same rule — see `canCollect`. */}
            {canCollect ? (
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
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* The switch is rendered only on a day nobody collected. A portal
              day — including one whose collection FAILED, which keeps
              `source: 'PORTAL'` — never sees it, so a corrector can never be
              shown a row this screen proposed. That is the whole protection for
              the eight collected dealers' correction job. */}
          {sheetAvailable ? (
            <div className="mt-4">
              <SegmentedControl
                aria-label="How to enter this day"
                value={activeMode}
                onChange={setMode}
                options={[
                  { value: 'sheet', label: 'Shift sheet' },
                  { value: 'grid', label: 'Full grid' },
                ]}
              />
            </div>
          ) : null}

          {/* Without a report layout the sheet has no rows to lay out: nothing
              knows which nozzles and tanks this outlet has. Only the hand-typed
              day is asked about — a portal day never wanted the sheet — and only
              a collected one reaches here at all, so the "no snapshot" half of
              this test that used to sit beside it could never be true. The day
              that has no snapshot AND no layout is answered by the empty state
              above, in the same words. */}
          {!sheetAvailable &&
          day.snapshot.source === 'MANUAL' &&
          day.dsr.products.length === 0 ? (
            <Callout intent="warning" className="mt-3">
              This dealer has no Daily Sales Report layout, so we do not know which nozzles and
              tanks it has. Set the layout up on the dealer&rsquo;s Services tab, then come back and
              the shift sheet will lay itself out.
            </Callout>
          ) : null}

          {activeMode === 'grid' ? (
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
          ) : null}

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

          {activeMode === 'sheet' ? (
            <ShiftSheet
              day={day}
              model={sheet}
              pending={pending}
              readOnly={readOnly}
              onSave={() => setReviewing(true)}
            />
          ) : (
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
                    shiftAnchorAt={day.snapshot?.shift.anchorAt}
                    showAllColumns={showAll}
                    readOnly={readOnly}
                  />
                </Section>
              ))}
            </div>
          )}

          <CorrectionHistory dealerId={dealerId} />
        </>
      )}

      {/* The sheet carries its own bar: it counts figures rather than pending
          changes, and it holds the keyboard accessory. */}
      {activeMode !== 'sheet' && pending.count > 0 ? (
        <PendingBar
          count={pending.count}
          affected={affected}
          canUndo={pending.canUndo}
          onUndo={pending.undo}
          onDiscard={pending.discardAll}
          onReview={() => setReviewing(true)}
          // One rule, both surfaces. The sheet lays eight blank rows out the
          // moment a hand day opens, and switching to the Full grid used to take
          // the only gate on them off screen: four taps from opening the day,
          // "Apply 8 changes" was live, the server refused the whole commit
          // because a blank meter row has no reading on it, and the operator
          // read a column name for eight rows they never added. The sheet's
          // findings are computed for the whole day rather than for whichever
          // surface is showing, so the answer already exists here — it was
          // simply never asked for.
          //
          // A portal day is untouched. `shiftSheetAvailable` is false for it, so
          // `blocked` is false, no sentence is added and nothing is disabled —
          // the eight collected dealers' bar is the bar they have always had.
          blocked={sheetAvailable && !sheet.canSave}
          blockReason={sheet.blockReason}
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
          manual={
            activeMode === 'sheet'
              ? {
                  title: `Save the shift of ${formatYmd(day.businessDate, { weekday: true })}`,
                  defaultReason: sheet.defaultReason,
                  lines: sheet.saveSummary.lines,
                  primaryLabel: day.dsr.attached
                    ? 'Save the shift and build the report'
                    : 'Save the shift',
                }
              : undefined
          }
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
        // One press, one day: the shell is created here and the sheet lays the
        // rows out the moment it mounts, so nothing else has to be pressed
        // before the first figure can be typed.
        onSuccess: () => toast.success('Day opened. The rows are laid out — type the figures in.'),
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

/** How many nozzles and tanks this dealer's report layout names. */
function nozzleCount(day: IrasDayEditorView): number {
  return new Set(day.dsr.products.flatMap((p) => p.nozzleNos.map(String))).size;
}

function tankCount(day: IrasDayEditorView): number {
  return new Set(day.dsr.products.flatMap((p) => p.tankNos.map(String))).size;
}

/**
 * "6 nozzles and 2 tanks" — what opening the day will lay out, in words.
 *
 * Worded rather than interpolated because a one-nozzle outlet was being promised
 * "1 nozzles and 1 tanks", which is the same fault `irasDayFiguresSentence` was
 * written in `@dk/shared` to stop the sheet's own readout making. Only ever
 * shown where the layout names something: with no layout at all this would read
 * "0 nozzles and 0 tanks", which tells an operator nothing about what to do
 * next, so that case says what is missing instead.
 */
function layoutSentence(day: IrasDayEditorView): string {
  const nozzles = nozzleCount(day);
  const tanks = tankCount(day);
  return `${nozzles} ${nozzles === 1 ? 'nozzle' : 'nozzles'} and ${tanks} ${
    tanks === 1 ? 'tank' : 'tanks'
  }`;
}

/* ──────────────────────────────── header ──────────────────────────────── */

function Header({
  day,
  onCollect,
  collecting,
  canCollect,
}: {
  day: IrasDayEditorView;
  onCollect: () => void;
  collecting: boolean;
  /** Whether asking the portal can finish — i.e. this dealer has an IRAS Shift
   *  Data attachment for the collect route to run, and is not archived. */
  canCollect: boolean;
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
      {/* Hidden only where the request cannot finish. The collect route refuses
          two cases — a dealer with no IRAS Shift Data attachment, and an
          archived dealer — and in both the button is a guaranteed 404. A PAUSED
          attachment is accepted and the collection runs, so a collected dealer
          keeps this button through a pause, which is how the eight have always
          had it. */}
      {canCollect ? (
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
      ) : null}
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
          {/*
            Nobody corrected a hand-typed day — they typed it. Calling an
            operator's own morning "8 corrections" every time they reopen it puts
            the platform's word for fixing a portal mistake in front of the one
            person who has no portal, and it is the vocabulary the rest of this
            feature goes out of its way to avoid. A collected day keeps the
            original sentence, so the eight portal dealers see no change at all.
          */}
          {day.snapshot === null || day.snapshot.source === 'MANUAL' ? (
            <>This day’s figures are saved. The reports are using them.</>
          ) : (
            <>
              This day has {corrections} correction{corrections === 1 ? '' : 's'}. Reports are using
              the corrected figures.
            </>
          )}
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

/**
 * Saved figures are not a report, and this notice used to say they were.
 *
 * `markReportsStaleFrom` returns an empty list when nothing matches, which is
 * exactly what happens on the first day a dealer's figures were ever typed — and
 * the notice read that as "every report for this dealer is up to date" and
 * offered a link to a report that had never been built. So an empty stale list
 * now asks the honest question instead: has a report for THIS date been built,
 * is one being built right now, or did the build we asked for fail?
 */
function AppliedNotice({
  applied,
  stale,
  staleUnreadable,
  busy,
  reportExists,
  reportsUnreadable,
  buildAsked,
  onBuild,
  dsrAttached,
  onRegenerate,
  onDismiss,
  dealerId,
  businessDate,
}: {
  applied: { changes: number; staleDates: string[]; figures: number | null };
  stale: Array<{ businessDate: string }>;
  /** Whether the stale list could not be read at all, so an empty `stale` means
   *  "we do not know", not "nothing is out of date". */
  staleUnreadable: boolean;
  busy: boolean;
  /** Whether a report now exists for this business date. */
  reportExists: boolean;
  /** Whether that question could not be answered at all — the request for this
   *  dealer's reports failed, so `reportExists` is "we do not know", not "no". */
  reportsUnreadable: boolean;
  /** Whether this page has already asked for one to be built. */
  buildAsked: boolean;
  onBuild: () => void;
  /** Whether this dealer has the Daily Sales Report service at all. */
  dsrAttached: boolean;
  onRegenerate: () => void;
  onDismiss: () => void;
  dealerId: string;
  businessDate: string;
}) {
  const nothingStale = stale.length === 0;
  const dateLabel = formatYmd(businessDate);
  const saved =
    applied.figures !== null
      ? `${applied.figures} figure${applied.figures === 1 ? '' : 's'} ${
          applied.figures === 1 ? 'is' : 'are'
        } on record for ${dateLabel}.`
      : `${applied.changes} change${applied.changes === 1 ? '' : 's'} applied.`;

  let tone: 'success' | 'warning' | 'info' = 'info';
  let title: string;
  let body: React.ReactNode;
  let action: React.ReactNode;

  if (!nothingStale) {
    tone = 'warning';
    title =
      applied.changes === 0
        ? 'Nothing changed'
        : `${applied.changes} change${applied.changes === 1 ? '' : 's'} applied`;
    body = `${stale.length} report${stale.length === 1 ? '' : 's'} still need regenerating (${stale
      .slice(0, 5)
      .map((s) => formatYmd(s.businessDate))
      .join(', ')}${stale.length > 5 ? '…' : ''}).`;
    action = (
      <Button
        size="sm"
        loading={busy}
        leftIcon={<RefreshCw width={14} height={14} strokeWidth={1.75} />}
        onClick={onRegenerate}
      >
        {busy ? 'Rebuilding…' : 'Regenerate reports'}
      </Button>
    );
  } else if (busy) {
    title = applied.figures !== null ? 'Shift saved' : 'Changes applied';
    body = (
      <span className="inline-flex items-center gap-2">
        <Spinner size={14} />
        {saved} Building the report — this updates when it lands.
      </span>
    );
    action = null;
  } else if (reportExists) {
    tone = 'success';
    title =
      applied.figures !== null
        ? `Report built for ${dateLabel}`
        : applied.changes === 0
          ? 'Nothing changed'
          : `${applied.changes} change${applied.changes === 1 ? '' : 's'} applied`;
    // "Every report is up to date" is a claim about the whole dealer, and the
    // only thing that can make it is the stale list. A request that failed comes
    // back as an empty list, which reads identical to "nothing is out of date" —
    // and that is precisely how an operator walks away from a half-rebuilt week.
    // So a list nobody could read says so instead of speaking for the dealer.
    body =
      applied.figures !== null
        ? saved
        : staleUnreadable
          ? 'We could not check whether any other report is now out of date.'
          : 'Every report for this dealer is up to date.';
    action = (
      <Link
        to={`/dsr/dealers/${dealerId}?date=${businessDate}`}
        className="text-sm font-semibold underline"
      >
        {applied.figures !== null ? 'Open the report' : `Open the report for ${dateLabel}`}
      </Link>
    );
  } else if (buildAsked) {
    /*
     * A report list nobody could read is not a build that failed.
     *
     * "Is there a report for this date" is answered by one request — the
     * dealer's report list — and on a forecourt phone that request drops. React
     * Query gives up after one retry, `reportExists` stays false, and this
     * branch used to read that as the build having failed: the operator is told
     * so, and pressed Try again, which queues a second run of a job that may
     * well have finished and that can drive a portal session. It is the same
     * mistake the "still building" window above was added to stop, arriving by
     * the other door. So a list we could not read says exactly that, and points
     * at the screen where the answer actually lives.
     */
    tone = 'warning';
    title = 'The figures are saved';
    body = reportsUnreadable
      ? `${saved} We could not check whether the report was built.`
      : `${saved} The report could not be built.`;
    action = reportsUnreadable ? (
      <Link
        to={`/dsr/dealers/${dealerId}?date=${businessDate}`}
        className="text-sm font-semibold underline"
      >
        Open the report screen
      </Link>
    ) : (
      <Button
        size="sm"
        leftIcon={<RefreshCw width={14} height={14} strokeWidth={1.75} />}
        onClick={onBuild}
      >
        Try again
      </Button>
    );
  } else {
    title = applied.figures !== null ? 'Shift saved' : 'Changes applied';
    // Same rule as the branch above: a report list that could not be read is not
    // a report that does not exist, and this sentence must not say it is. The
    // button is right either way — building a date that already has a report
    // rebuilds it — so only the wording changes.
    body = !dsrAttached
      ? `${saved} This dealer does not have the Daily Sales Report service, so no report is built from them.`
      : reportsUnreadable
        ? `${saved} We could not check whether a report has been built for that day.`
        : `${saved} No report has been built for that day yet.`;
    action = dsrAttached ? (
      <Button size="sm" onClick={onBuild}>
        Build the report
      </Button>
    ) : null;
  }

  return (
    <div
      className={cn(
        'mt-3 flex flex-wrap items-start gap-3 rounded-md px-3 py-2.5 text-sm',
        tone === 'success'
          ? 'bg-success-soft text-success'
          : tone === 'warning'
            ? 'bg-warning-soft text-warning'
            : 'bg-info-soft text-info',
      )}
    >
      {tone === 'success' ? (
        <CheckCircle2 width={16} height={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      ) : (
        <History width={16} height={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5">{body}</p>
      </div>
      {action}
      {/* Dismissable whenever this notice has finished saying what it has to
          say. Tying it to the green state took the button away from a
          correction applied to a date with no generated report — the commonest
          shape of the eight collected dealers' work — and left a notice on
          screen with no way to clear it. While reports are still to be rebuilt,
          Regenerate is the way out; while a build is in flight the notice is
          still live and says so. */}
      {nothingStale && !busy ? (
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      ) : null}
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
  blocked,
  blockReason,
}: {
  count: number;
  affected: { dates: string[]; sharedDates: string[] };
  canUndo: boolean;
  onUndo: () => void;
  onDiscard: () => void;
  onReview: () => void;
  /**
   * Whether something on this day would make the server refuse the whole
   * commit. False on a portal day, which has no such check and never had one.
   */
  blocked: boolean;
  /** The one sentence saying what — the shift sheet's own wording, unchanged. */
  blockReason: string | null;
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
      {/* The reason the button is dead, as visible text beside it — the same
          sentence, in the same place, as the shift sheet's own save bar. Never a
          `title`: it does not fire on touch, so on a phone a disabled primary
          would be silent and the operator would be left tapping it. */}
      {blocked && blockReason ? (
        <p className="w-full text-sm text-text-muted md:w-auto">{blockReason}</p>
      ) : null}
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
      <Button size="sm" disabled={blocked} onClick={onReview}>
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
