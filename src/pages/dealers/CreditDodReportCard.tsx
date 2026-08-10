import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileText,
  HelpCircle,
  Share2,
} from 'lucide-react';
import * as React from 'react';

import { Button, Dialog, useToast } from '@/components/ui';
import { useShareCreditDodSnapshot } from '@/hooks/api/useCreditDod';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatDmy, inrFormat } from '@/lib/format';
import type { CreditDodSnapshotRecord } from '@/types/creditDod';
import type { CreditDodRunOutput } from '@/types/serviceRun';

interface Props {
  /** The stored snapshot — the single source of truth for the whole report. */
  snapshot: CreditDodSnapshotRecord;
  /**
   * Signed URL for the rendered card image. Defaults to the snapshot's own
   * `artifacts.cardUrl`; the run-detail view passes the run's copy so an already
   * open dialog keeps working.
   */
  cardImageUrl?: string;
  /** Owning run, so a share also refreshes that run's cached detail. */
  runId?: string;
  /**
   * Hide the Share action, and say why. Set when the snapshot is a stand-in
   * reconstructed from a run's output — that reconstruction cannot know whether
   * the report was already shared, so offering Share would risk a duplicate
   * message. `'loading'` resolves on its own; `'unavailable'` does not, and the
   * admin is pointed at the Credit & DOD tab instead.
   */
  shareDisabled?: 'loading' | 'unavailable';
}

/**
 * The Credit & DOD report, exactly as an admin needs to review it before it goes
 * to a dealer: the rendered card, the figures behind it, the trust signals
 * (reconciliation, estimate warning), the source files, and the share action.
 *
 * Driven entirely by the SNAPSHOT rather than a run, so it renders identically
 * from Report history and from the run-detail dialog.
 */
export function CreditDodReportCard({
  snapshot,
  cardImageUrl,
  runId,
  shareDisabled,
}: Props) {
  const toast = useToast();
  const isSuperAdmin = useIsSuperAdmin();
  const shareMutation = useShareCreditDodSnapshot(snapshot.id, {
    runId,
    dealerId: snapshot.dealerId,
  });

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const alreadyShared = !!snapshot.shared;
  const imageUrl = cardImageUrl ?? snapshot.artifacts.cardUrl;

  // The API refuses both of these for a plain admin (400), so the dialog has to
  // say so before the click rather than let it come back as a failed toast.
  const shareRefusal =
    snapshot.reconciles === false
      ? 'The figures on this card don’t match IndianOil’s own receivable, so the due amount can’t be trusted.'
      : snapshot.droppedRows > 0
        ? 'Part of the portal ledger couldn’t be read for this report, so the figures may be incomplete.'
        : null;
  const shareBlocked = shareRefusal !== null && !isSuperAdmin;

  async function onConfirmShare() {
    try {
      const result = await shareMutation.mutateAsync();
      toast.success(
        result?.alreadyShared
          ? 'This report had already been shared with the dealer.'
          : 'Card shared with the dealer.',
      );
      setConfirmOpen(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to share';
      toast.error(msg);
    }
  }

  return (
    <div className="grid gap-4">
      {/* Above the card image deliberately: a missed deadline changes what the
          admin should do with this report, so it cannot sit below the fold. */}
      <OverdueNotice snapshot={snapshot} />
      {/* Same reasoning, different action. An overdue deposit is chased with the
          dealer; a locked account can only be reopened by IndianOil, so this is
          the one notice on the report that sends an admin outside the app. */}
      <CreditLockNotice snapshot={snapshot} />

      {/* Card image on top, full width (capped), never overlapping. */}
      {imageUrl ? (
        // Only linkable when there is an `attachment` URL to link TO: `download`
        // is ignored cross-origin, so pointing this at the `inline` URL would
        // navigate the tab away and tear down an open run dialog.
        snapshot.artifacts.cardDownloadUrl ? (
          <a
            href={snapshot.artifacts.cardDownloadUrl}
            download
            title="Download the card image"
            className="block"
            style={{ maxWidth: 520 }}
          >
            <img
              src={imageUrl}
              alt="Credit & DOD card"
              className="h-auto w-full rounded-md border border-border bg-surface-2"
            />
          </a>
        ) : (
          <img
            src={imageUrl}
            alt="Credit & DOD card"
            className="h-auto w-full rounded-md border border-border bg-surface-2"
            style={{ maxWidth: 520 }}
          />
        )
      ) : (
        <div
          className="flex h-40 w-full items-center justify-center rounded-md border border-dashed border-border bg-surface-2 px-4 text-center text-xs text-text-muted"
          style={{ maxWidth: 520 }}
        >
          The card image didn&apos;t render for this report. The figures below
          were still captured correctly.
        </div>
      )}

      {/* Values as a single-column, wrap-safe definition list (label left,
          value right). Avoids the 2-up grid that overlapped in the modal. */}
      <dl className="rounded-md border border-border">
        {snapshot.overdue ? (
          <DefRow
            label="Overdue amount"
            value={
              <span className="text-danger">
                {inrFormat(snapshot.overdue.amount)}
              </span>
            }
          />
        ) : null}
        <DefRow label="Due amount" value={inrFormat(snapshot.dueAmount)} />
        <DefRow
          label="Due date"
          value={snapshot.dueDate ? formatDmy(snapshot.dueDate) : '-'}
        />
        <DefRow label="Current limit" value={inrFormat(snapshot.currentLimit)} />
        <DefRow label="Availed limit" value={inrFormat(snapshot.availedLimit)} />
        <DefRow
          label="Available limit"
          value={inrFormat(snapshot.availableLimit)}
        />
        <DefRow
          label="Form of limit"
          value={
            <>
              {snapshot.formOfLimit || '-'}
              {snapshot.creditReview?.lapsed ? (
                // The portal's own answer, with the fact that it cannot
                // currently be used attached to it. Shown here rather than
                // substituted for it: IndianOil never said CASH & CARRY, and a
                // report that claimed it did would not match the risk category
                // two rows below.
                <span className="ml-1.5 font-normal text-danger">
                  (locked)
                </span>
              ) : null}
            </>
          }
        />
        {snapshot.creditReview || snapshot.nextReviewDate ? (
          <DefRow
            label="Next review date"
            value={<NextReviewValue snapshot={snapshot} />}
          />
        ) : null}
      </dl>

      {snapshot.openingCarriedForward ? (
        <Notice tone="warning">
          Due date is an estimate — the look-back didn&apos;t reach a balance
          reset, so the oldest unpaid purchase may be older than the window.
        </Notice>
      ) : null}

      {snapshot.droppedRows > 0 ? (
        <Notice tone="warning">
          {snapshot.droppedRows} ledger row
          {snapshot.droppedRows === 1 ? '' : 's'} in the portal response
          couldn&apos;t be read. Tell the MDG team before sharing — it usually
          means the portal changed its table.
        </Notice>
      ) : null}

      <LatePostingNotices snapshot={snapshot} />

      {snapshot.openLots.length > 0 ? (
        <OpenLots snapshot={snapshot} />
      ) : null}

      {/* Muted metadata block. */}
      <div className="grid gap-1.5 text-xs text-text-muted">
        {snapshot.backdated ? (
          <MetaRow
            label="As of (back-dated)"
            value={snapshot.asOf ? formatDmy(snapshot.asOf) : '-'}
          />
        ) : null}
        <MetaRow label="Risk category" value={snapshot.riskCategory ?? '-'} />
        <MetaRow
          label="Window"
          value={
            <>
              {formatDmy(snapshot.window.fromDate)} &rarr;{' '}
              {formatDmy(snapshot.window.toDate)}
            </>
          }
        />
        {typeof snapshot.transactionCount === 'number' ? (
          <MetaRow
            label="Transactions maintained"
            value={
              <span className="tabular-nums">
                {snapshot.transactionCount.toLocaleString('en-IN')}
              </span>
            }
          />
        ) : null}
        <ReconcileIndicator
          checked={snapshot.reconcileChecked}
          reconciles={snapshot.reconciles}
          receivable={snapshot.totalReceivableReported}
        />
      </div>

      <SourceFiles snapshot={snapshot} isSuperAdmin={isSuperAdmin} />

      <div className="flex flex-wrap items-center gap-2">
        {shareDisabled ? (
          <p className="text-xs text-text-subtle">
            {shareDisabled === 'loading'
              ? "Loading this report's sharing status…"
              : "Open this report from the dealer's Credit & DOD tab to share it."}
          </p>
        ) : alreadyShared ? (
          <>
            <Button
              variant="secondary"
              disabled
              leftIcon={<Check width={14} height={14} strokeWidth={1.75} />}
            >
              Shared
            </Button>
            <span className="text-xs text-text-subtle">
              {formatDateTime(snapshot.shared?.at)}
            </span>
          </>
        ) : (
          <Button
            onClick={() => setConfirmOpen(true)}
            leftIcon={<Share2 width={14} height={14} strokeWidth={1.75} />}
          >
            Share with dealer
          </Button>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Share with dealer"
        description="Share this Credit & DOD card with the dealer's chat? This will message the dealer."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={shareMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirmShare}
              loading={shareMutation.isPending}
              disabled={shareBlocked}
            >
              Share
            </Button>
          </>
        }
      >
        {shareRefusal ? (
          <div className="mb-3">
            <Notice tone="danger">
              {shareRefusal}{' '}
              {isSuperAdmin
                ? 'Only a super-admin can send this. Check the source files against the figures before you do.'
                : 'Sharing is switched off for this report. Generate it again — a fresh run usually clears it — and tell the MDG team if it keeps happening.'}
            </Notice>
          </div>
        ) : null}
        {snapshot.backdated ? (
          <div className="mb-3">
            <Notice tone="info">
              This is a back-dated report as of{' '}
              {snapshot.asOf ? formatDmy(snapshot.asOf) : '—'}, not today&apos;s
              position.
            </Notice>
          </div>
        ) : null}
        <p className="text-sm text-text-muted">
          The rendered card and its values will be posted to the dealer&apos;s
          chat.
        </p>
      </Dialog>
    </div>
  );
}

/**
 * The FIFO lots behind the DUE AMOUNT. This is the answer to the only question
 * a dealer ever asks back — "why this number?" — so an admin should be able to
 * read it out without opening the ledger.
 */
function OpenLots({ snapshot }: { snapshot: CreditDodSnapshotRecord }) {
  const [open, setOpen] = React.useState(false);
  const lots = snapshot.openLots;
  const oldest = lots[0];
  const dueLots = oldest ? lots.filter((l) => l.date === oldest.date) : [];

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2"
      >
        <span className="font-medium text-text">
          Why this amount? {dueLots.length} unpaid purchase
          {dueLots.length === 1 ? '' : 's'} from{' '}
          {oldest ? formatDmy(oldest.date) : '—'}
        </span>
        <span className="shrink-0 text-xs text-text-muted">
          {open ? 'Hide' : `Show all ${lots.length}`}
        </span>
      </button>
      {open ? (
        <ul className="border-t border-border">
          {lots.map((lot, i) => (
            <li
              key={`${lot.date}-${lot.deadline}-${i}`}
              className={
                'flex items-baseline justify-between gap-3 border-b border-border px-3 py-1.5 text-xs last:border-b-0 ' +
                (lot.date === oldest?.date ? 'bg-warning-soft' : '')
              }
            >
              <span className="text-text-muted">
                Availed {formatDmy(lot.date)} &middot; due{' '}
                {formatDmy(lot.deadline)}
              </span>
              <span className="tabular-nums font-medium text-text">
                {inrFormat(lot.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Read the dates out in a sentence, capped at three. A portal that posts a week
 * late hands us a long list, and a notice too long to read is a notice an admin
 * skips.
 */
function listDates(dates: string[]): string {
  const shown = dates.slice(0, 3).map(formatDmy);
  const rest = dates.length - shown.length;
  if (rest > 0) shown.push(`${rest} more day${rest === 1 ? '' : 's'}`);
  const last = shown.pop() ?? '';
  return shown.length === 0 ? last : `${shown.join(', ')} and ${last}`;
}

/**
 * A deposit deadline that has already gone by unpaid.
 *
 * Split into two verdicts on purpose. Within a day or two of the deadline the
 * dealer may have paid on time and IndianOil simply not published it yet, and
 * an admin who chases that as a default burns the relationship over the
 * portal's own lag. Past that window it is a real breach and the admin needs
 * the number that actually clears it — which is not the DUE AMOUNT once more
 * than one deadline has slipped.
 */
function OverdueNotice({ snapshot }: { snapshot: CreditDodSnapshotRecord }) {
  const od = snapshot.overdue;
  if (!od) return null;

  const dayCount = `${od.days} day${od.days === 1 ? '' : 's'}`;
  const since = formatDmy(od.since);

  if (od.withinPortalLag) {
    return (
      <Notice tone="warning">
        The deadline of {since} has passed with {inrFormat(od.amount)} still
        showing unpaid — {dayCount} ago. IndianOil takes a day or two to publish
        a deposit, so this may already have been paid. Check with the dealer
        before treating it as a default.
      </Notice>
    );
  }

  return (
    <Notice tone="danger">
      Deadline missed. {inrFormat(od.amount)} has been past its deposit deadline
      since {since} — {od.estimatedFrom ? 'at least ' : ''}
      {dayCount}
      {od.deadlines > 1 ? <>, across {od.deadlines} separate deadlines</> : null}.
      {od.amount > snapshot.dueAmount ? (
        <>
          {' '}
          The due amount below ({inrFormat(snapshot.dueAmount)}) is only the
          nearest deadline&apos;s share, so paying that alone would not clear
          the default.
        </>
      ) : null}
    </Notice>
  );
}

/**
 * The "Next review date" value, which has three genuinely different readings —
 * and telling them apart matters, because one of them is a bug report.
 *
 * A verdict is missing for two unrelated reasons, and its absence alone cannot
 * distinguish them: the portal published something we could not read (a layout
 * change, worth escalating), or the report is back-dated and no verdict was ever
 * attempted (routine, and correct). Reading the first as the second would send
 * an admin chasing a portal change that never happened on every back-dated
 * report — and then train them to ignore the one that is real. `backdated` is
 * what separates them, exactly as it does in the capture's own drift warning.
 */
function NextReviewValue({ snapshot }: { snapshot: CreditDodSnapshotRecord }) {
  if (snapshot.creditReview) {
    return (
      <span className={snapshot.creditReview.lapsed ? 'text-danger' : undefined}>
        {formatDmy(snapshot.creditReview.on)}
      </span>
    );
  }
  if (snapshot.backdated) {
    return (
      <span title="This is the review date the portal shows today. A back-dated report cannot say whether the limit was live on its own date, so no verdict was reached.">
        {snapshot.nextReviewDate ?? '-'}{' '}
        <span className="text-text-muted">(not judged — back-dated)</span>
      </span>
    );
  }
  // A date the portal published that we could not read. Showing it verbatim is
  // the only honest option — it is the evidence an admin needs in order to
  // report a portal change, and inventing a verdict from it is exactly what the
  // capture refused to do.
  return (
    <span title="The portal published this in a format we could not read — tell the MDG team.">
      {snapshot.nextReviewDate} <span className="text-text-muted">(unreadable)</span>
    </span>
  );
}

/**
 * The dealer's credit line has been locked because its review date went by.
 *
 * Deliberately not worded as a payment problem. No deposit lifts this, and an
 * admin who treats it as one leaves the dealer buying cash and carry for weeks
 * while everyone waits for a transfer to fix it. The only route out runs through
 * IndianOil's own sales officer, so that is what the notice says.
 *
 * Absent when the review is still ahead, when the portal published nothing we
 * could read, and on a back-dated report — none of which is evidence of a live
 * limit, so this stays silent rather than reassuring.
 */
function CreditLockNotice({ snapshot }: { snapshot: CreditDodSnapshotRecord }) {
  const review = snapshot.creditReview;
  if (!review?.lapsed) return null;
  // `daysUntil` is negative once lapsed; floor at 1 so the morning after reads
  // "1 day ago" rather than "0 days ago".
  const days = Math.max(1, -review.daysUntil);

  return (
    <Notice tone="danger">
      Credit locked. The review date of {formatDmy(review.on)} passed {days} day
      {days === 1 ? '' : 's'} before the date these figures describe, so IndianOil
      has stopped the credit line — the dealer must pay upfront (cash and carry)
      until their sales officer has the limit reviewed and the account reopened.
      The limit figures below still show what was granted, not what can be used.
    </Notice>
  );
}

/**
 * What the portal changed under us since the last report: transactions it
 * published after their own date, rows it has withdrawn, and — the one that
 * needs an admin to act — a report already sent to the dealer that those late
 * transactions have made wrong.
 */
function LatePostingNotices({
  snapshot,
}: {
  snapshot: CreditDodSnapshotRecord;
}) {
  const late = snapshot.backdatedRows;
  const restated = snapshot.restatedRows;
  if (late === 0 && restated === 0 && !snapshot.supersededSharedAt) return null;

  return (
    <>
      {late > 0 ? (
        <Notice tone="warning">
          {late === 1 ? 'A transaction' : `${late} transactions`} dated{' '}
          {listDates(snapshot.backdatedDates)} reached the portal only now. Any
          report made earlier for{' '}
          {snapshot.backdatedDates.length === 1 ? 'that day' : 'those days'} was
          worked out without {late === 1 ? 'it' : 'them'} — this one includes{' '}
          {late === 1 ? 'it' : 'them'}.
        </Notice>
      ) : null}

      {snapshot.supersededSharedAt ? (
        <Notice tone="danger">
          A report was already shared with this dealer on{' '}
          {formatDateTime(snapshot.supersededSharedAt)}, and its due amount is
          now out of date. A chat message can&apos;t be edited or taken back, so
          share this newer report to correct it.
        </Notice>
      ) : null}

      {restated > 0 ? (
        <Notice tone="warning">
          {restated === 1
            ? 'A transaction recorded earlier has'
            : `${restated} transactions recorded earlier have`}{' '}
          since been changed or withdrawn by the portal, so{' '}
          {restated === 1 ? 'it is' : 'they are'} no longer counted in the
          figures above.
        </Notice>
      ) : null}

      {snapshot.removalApplied === false ? (
        <Notice tone="warning">
          The portal&apos;s reply for this period was incomplete, so no
          transaction was removed from the records — only new ones were added.
          Nothing is lost, but generate the report again to be sure the figures
          are current.
        </Notice>
      ) : null}
    </>
  );
}

/** The captured source documents this report was derived from. */
function SourceFiles({
  snapshot,
  isSuperAdmin,
}: {
  snapshot: CreditDodSnapshotRecord;
  isSuperAdmin: boolean;
}) {
  const { artifacts } = snapshot;
  const files: { href: string; label: string; hint: string }[] = [];
  if (artifacts.padStatementUrl) {
    files.push({
      href: artifacts.padStatementUrl,
      label: 'PAD statement',
      hint: 'Every transaction in the window, as a readable statement',
    });
  }
  if (artifacts.cardDownloadUrl) {
    files.push({
      href: artifacts.cardDownloadUrl,
      label: 'Card image',
      hint: 'The PNG the dealer receives',
    });
  }
  if (isSuperAdmin && artifacts.rawPadStatementUrl) {
    files.push({
      href: artifacts.rawPadStatementUrl,
      label: 'Raw PAD response',
      hint: 'Untouched portal HTML — for debugging the parser',
    });
  }
  if (isSuperAdmin && artifacts.rawCreditMonitoringUrl) {
    files.push({
      href: artifacts.rawCreditMonitoringUrl,
      label: 'Raw Credit Monitoring page',
      hint: 'Untouched portal HTML — for debugging the parser',
    });
  }
  if (files.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Source files
      </p>
      <ul className="grid gap-2">
        {files.map((f) => (
          <li
            key={f.label}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium text-text">
                <FileText
                  width={14}
                  height={14}
                  strokeWidth={1.75}
                  className="shrink-0 text-text-muted"
                  aria-hidden
                />
                {f.label}
              </p>
              <p className="text-xs text-text-muted">{f.hint}</p>
            </div>
            <a
              href={f.href}
              download
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-semibold text-text hover:bg-surface-2"
            >
              <Download width={14} height={14} strokeWidth={1.75} />
              Download
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: 'warning' | 'info' | 'danger';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'danger'
      ? 'border-danger bg-danger-soft text-danger'
      : tone === 'warning'
        ? 'border-warning bg-warning-soft text-warning'
        : 'border-info bg-info-soft text-info';
  return (
    <div
      className={`flex items-start gap-2 rounded-md border p-2.5 text-xs font-medium ${cls}`}
    >
      <AlertTriangle
        width={14}
        height={14}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0"
        aria-hidden
      />
      <span>{children}</span>
    </div>
  );
}

function DefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border px-3 py-2 text-sm last:border-b-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="break-words text-right font-medium tabular-nums text-text">
        {value}
      </dd>
    </div>
  );
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span>{label}</span>
      <span className="text-right text-text">{value}</span>
    </div>
  );
}

function ReconcileIndicator({
  checked,
  reconciles,
  receivable,
}: {
  checked: boolean;
  reconciles: boolean;
  receivable: number | null;
}) {
  const receivableText =
    receivable === null ? 'not reported' : inrFormat(receivable);
  // Nothing to compare against is not the same as agreement — saying
  // "Reconciles" here would promise a check that never happened.
  if (!checked) {
    return (
      <p className="mt-0.5 flex items-center gap-1.5 font-medium text-warning">
        <HelpCircle width={14} height={14} strokeWidth={1.75} />
        Not cross-checked (SDMS gave no figure to compare against)
      </p>
    );
  }
  return (
    <p
      className={
        reconciles
          ? 'mt-0.5 flex items-center gap-1.5 font-medium text-green-600'
          : 'mt-0.5 flex items-center gap-1.5 font-medium text-danger'
      }
    >
      {reconciles ? (
        <CheckCircle2 width={14} height={14} strokeWidth={1.75} />
      ) : (
        <AlertCircle width={14} height={14} strokeWidth={1.75} />
      )}
      {reconciles ? 'Reconciles' : 'Does not reconcile'} (SDMS receivable{' '}
      {receivableText})
    </p>
  );
}

/**
 * Compatibility bridge for the run-detail dialog: build a snapshot-shaped object
 * out of a run's `output` so the report still renders if the snapshot fetch
 * hasn't landed (or 404s on an old run). Every field the card reads is present
 * in the run output; the artifact URLs come from the run instead.
 *
 * `shared` is the one thing a run's output genuinely cannot tell us, so callers
 * MUST pass `shareDisabled` alongside this. Letting it render a live Share
 * button would offer "Share with dealer" on a report that already went out.
 */
export function snapshotFromRunOutput(
  output: CreditDodRunOutput,
  opts: { dealerId: string },
): CreditDodSnapshotRecord {
  return {
    id: output.snapshotId,
    dealerId: opts.dealerId,
    capturedAt: new Date().toISOString(),
    code: output.card.code,
    window: output.window,
    asOf: output.asOf ?? null,
    backdated: output.backdated === true,
    riskCategory: output.riskCategory,
    currentLimit: output.card.currentLimit,
    totalReceivableReported: output.totalReceivableReported,
    availedLimit: output.card.availedLimit,
    availableLimit: output.card.availableLimit,
    dueAmount: output.card.dueAmount,
    dueDate: output.card.dueDate,
    state: output.state,
    overdue: output.overdue ?? null,
    formOfLimit: output.card.formOfLimit,
    nextReviewDate: output.nextReviewDate ?? null,
    // Taken from the CARD, not the run root: the card is what was rendered and
    // what the dealer receives, so this panel cannot claim a lock the image
    // beside it does not show.
    creditReview: output.card.creditReview ?? null,
    reconciles: output.reconciles,
    // Runs from before the flag existed WERE checked, so defaulting to true
    // keeps their badge honest instead of marking every old report unverified.
    reconcileChecked: output.reconcileChecked ?? true,
    closingBalanceReported: output.closingBalanceReported ?? null,
    openingCarriedForward: output.openingCarriedForward === true,
    transactionCount: output.transactionCount ?? null,
    droppedRows: output.droppedRows ?? 0,
    backdatedRows: output.backdatedRows ?? 0,
    backdatedDates: output.backdatedDates ?? [],
    restatedRows: output.restatedRows ?? 0,
    restoredRows: output.restoredRows ?? 0,
    // Runs from before the flag existed always applied removal.
    removalApplied: output.removalApplied ?? true,
    supersededSharedAt: output.supersededSharedAt ?? null,
    preparedAt: output.card.preparedAt,
    openLots: [],
    artifacts: {},
    shared: null,
  };
}
