import { AlertTriangle, ArrowRight } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Dialog,
  FieldError,
  HowThisWorks,
  Label,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { usePreviewIrasCorrections } from '@/hooks/api/useIrasEdits';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatYmd } from '@/lib/format';
import { dealerCodeLabel, irasFieldPolicy } from '@dk/shared';
import type { IrasCorrectionPreview, IrasDayEditorView } from '@dk/shared';

import { describePending, reportsAffected, type PendingDescription } from './describePending';
import { shiftRowGroupName } from './ShiftSheet';
import { toChanges, type PendingApi } from './usePendingChanges';

const REASON_MIN = 3;
const REASON_MAX = 500;
/** Report dates listed in full before collapsing into "+ N more". */
const DATES_SHOWN = 6;

/**
 * What a day typed by hand needs this dialog to say instead.
 *
 * Present only on a day nobody collected. On a portal day every one of these is
 * absent and the dialog renders exactly as it always has — blank reason, one
 * card per row, "Apply N changes" — which is the whole protection for the eight
 * collected dealers' correction job.
 */
export interface ReviewApplyManual {
  title: string;
  /**
   * Pre-written and editable whenever this commit overwrites nothing that is
   * already on record: the sentence is then the same every morning, and making
   * somebody retype it adds thirty keystrokes of noise to the audit trail.
   *
   * **Empty means, and means only, that a figure already on record is really
   * being moved.** That is a different act: the box opens blank and mandatory
   * and the question above it changes to why. This one string is the whole
   * channel — `correcting` below reads nothing else — and the caller sets it
   * from `irasFiguresOverwritten`, which compares VALUES against what the server
   * holds. So retyping a saved reading exactly as it stands, which the server
   * discards as nothing, no longer opens a mandatory "why did you change this?".
   * See `defaultReasonFor` in `ShiftSheet`, which is the one place that can see
   * the change set rather than the day.
   */
  defaultReason: string;
  /** "6 meter readings and 2 stock rows." and the carried / not-run lines. */
  lines: string[];
  primaryLabel: string;
}

/**
 * The warnings carried by the two boxes saying when a tanker finished
 * decanting, read straight off the field policy so they cannot drift from it.
 *
 * On a collected day that stamp decides which day's receipts the litres land in
 * and the warning is exactly right. On a day nobody collected it decides
 * nothing, and these are the warnings the block below strips — see
 * `dayHasDecantWindow`.
 *
 * Matched by their own text rather than by a field name because the description
 * an operator reads carries the warning and not the column it came from. The
 * text is the shared policy's, read at the moment of comparison, so rewording it
 * in `@dk/shared` keeps these two in step by construction.
 */
const DECANT_STAMP_WARNINGS: ReadonlySet<string> = new Set(
  (['DECANT_END_DATE', 'DECANT_END_TIME'] as const)
    .map((field) => irasFieldPolicy('REC', field).identityWarning)
    .filter((warning): warning is string => typeof warning === 'string' && warning !== ''),
);

/** Whether this line is a change to when a tanker finished decanting. */
function isDecantStamp(change: PendingDescription): boolean {
  return (
    change.code === 'REC' &&
    change.identityWarning !== undefined &&
    DECANT_STAMP_WARNINGS.has(change.identityWarning)
  );
}

/** One tap each, and each APPENDS to the note rather than replacing it — the
 *  provenance is the one thing worth recording that the sentence cannot know. */
const PROVENANCE_CHIPS = [
  'From the outlet’s register.',
  'From the dealer’s photo.',
  'Phoned in by the dealer.',
];

export interface ReviewApplyDialogProps {
  open: boolean;
  onClose: () => void;
  day: IrasDayEditorView;
  pending: PendingApi;
  applying: boolean;
  onApply: (reason: string) => void;
  manual?: ReviewApplyManual;
}

/**
 * The last screen before a dealer's figures change.
 *
 * Four questions, in the order an operator asks them: what am I changing, what
 * does it do to the report, what will need rebuilding, and does the dealer
 * already have the old numbers. The recomputed variation is the reason this
 * dialog exists at all — the operator's goal is never "change this number", it is
 * "get the variation back inside the permissible limit", and this is the only
 * place they can see whether it worked before committing.
 */
export function ReviewApplyDialog({
  open,
  onClose,
  day,
  pending,
  applying,
  onApply,
  manual,
}: ReviewApplyDialogProps) {
  const [reason, setReason] = React.useState('');
  /** Only complain about the reason once they have actually typed in it. */
  const [touchedReason, setTouchedReason] = React.useState(false);
  const [showEveryFigure, setShowEveryFigure] = React.useState(false);
  const preview = usePreviewIrasCorrections(day.dealer.id, day.businessDate);

  /*
   * The changes, with one warning dropped on the one kind of day it is not true
   * of.
   *
   * `DECANT_END_DATE` and `DECANT_END_TIME` carry an identity warning saying that
   * moving the stamp moves the litres to another day's receipts. On a collected
   * day that is exactly right and it stays. On a day nobody collected there is no
   * decant window — `createManualSnapshotDay` writes `datasets: []` and
   * `recRowDayVerdict` counts the row on the day being generated whatever stamp
   * it carries — so the warning describes a rule the engine does not apply, and
   * the red acknowledgement it arms asks the operator to confirm they meant to
   * move a row to a different tank, nozzle or product, which a date is not.
   *
   * Branching on whether the day HAS a window rather than on which surface is
   * open: that is the thing the engine reads, and it leaves the eight collected
   * dealers' correction dialog byte for byte as it was.
   */
  const dayHasDecantWindow = Boolean(day.snapshot?.datasets.REC?.window);
  const changes = React.useMemo(() => {
    const described = describePending(day, pending.state);
    if (dayHasDecantWindow) return described;
    return described.map((c) =>
      isDecantStamp(c) ? { ...c, identityWarning: undefined } : c,
    );
  }, [day, pending.state, dayHasDecantWindow]);
  const affected = React.useMemo(() => reportsAffected(day), [day]);

  /**
   * A hand day where a figure already on record is really being moved.
   *
   * The whole-shift wording — a pre-written note and "6 meter readings and 2
   * stock rows" — is true of the commit that types a morning in and false of
   * every commit after it. Correcting one cell on a day that is already saved
   * used to open with a note claiming eight rows had been typed by hand, and
   * that sentence, unedited, was what went into the audit trail. So when the
   * caller has nothing to pre-write, this dialog asks the question the reason
   * exists for and shows the changes themselves rather than a summary of the
   * day.
   *
   * Read off the pre-written reason and nothing else, because that string now
   * carries exactly one meaning — see {@link ReviewApplyManual.defaultReason}.
   * The caller sets it by comparing values against what the server holds, so
   * this is "what is actually being overwritten" and never "which boxes were
   * touched". A second test here would be a second answer to that question.
   */
  const correcting = manual !== undefined && manual.defaultReason.trim() === '';

  const identityChanges = changes.filter((c) => c.identityWarning);
  // A change that only moves the report's layout notes is not "effective" for
  // the rebuild list, but it is not inert either — it still alters what the
  // dealer reads, so the blanket "none of these affect any report" must not fire.
  const effective = changes.filter((c) => c.usedByReport);
  const inertOnly =
    changes.length > 0 && effective.length === 0 && !changes.some((c) => c.affectsReportNotes);

  // Recompute once per opening, against the change set as it stands.
  const requested = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      requested.current = false;
      setReason('');
      setTouchedReason(false);
      setShowEveryFigure(false);
      return;
    }
    if (requested.current) return;
    requested.current = true;
    // Pre-filled but NOT marked as touched, so an untouched default does not
    // make the form look edited or start it off with a validation message.
    setReason(manual?.defaultReason ?? '');
    // A commit that changes figures already on record opens with the figures
    // themselves showing: there is no honest one-line summary of "the operator
    // corrected nozzle 4", and the list beneath is the only thing that says
    // which figure moved and what it moved from.
    setShowEveryFigure(correcting);
    preview.mutate(toChanges(pending.state));
    // `preview` and `pending.state` are deliberately not dependencies: this must
    // fire once when the dialog opens, not on every keystroke in the reason box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reasonOk = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;

  function appendChip(text: string) {
    setTouchedReason(true);
    setReason((prev) => {
      const base = prev.trim();
      if (base.includes(text)) return prev;
      return base ? `${base} ${text}` : text;
    });
  }

  const changesSection = (
    <section>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
        What you are changing
      </h4>
      <ul className="grid gap-1.5">
        {changes.map((c, i) => (
          <li
            key={i}
            className={cn(
              'rounded-md border px-2.5 py-2 text-sm',
              c.identityWarning ? 'border-danger bg-danger-soft' : 'border-border',
            )}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {/*
                On a hand-typed day, the plain name the sheet behind this dialog
                already uses for the group — "Meter reading", "Stock row",
                "Tanker". The raw code is the platform's name for the dataset and
                the operator typing 16E's morning has no way to know what `TOT`
                is; it was being printed at them in monospace on every line of
                the last screen before a dealer's figures change.

                A collected day keeps the badge exactly as it is on `main`. Those
                eight dealers' correctors read the portal's own vocabulary all
                day and match these codes against it, and the one thing that must
                not change is their correction job.
              */}
              <span
                className={cn(
                  'rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text',
                  manual ? null : 'font-mono',
                )}
              >
                {manual ? shiftRowGroupName(c.code) : c.code}
              </span>
              <span className="font-medium text-text">{c.rowLabel}</span>
              <span className="text-text-muted">{c.what}</span>
              {c.usedByReport ? null : (
                <Badge intent="neutral">
                  {c.affectsReportNotes ? 'notes only' : 'changes no figure'}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm tabular-nums">
              <span className="text-text-subtle line-through">{c.from}</span>
              <ArrowRight width={13} height={13} strokeWidth={2} className="text-text-subtle" />
              <span className="font-semibold text-text">{c.to}</span>
            </div>
            {c.identityWarning ? (
              <p className="mt-1 text-[12px] text-danger">{c.identityWarning}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );

  const identityAcknowledgement =
    identityChanges.length > 0 ? (
      <Checkbox
        // Held in the DOM rather than state: it gates nothing on its own —
        // the reason field is the real gate — but an operator who has to tick
        // it has read the sentence above it. The browser-default box was
        // ~13px, a third of the touch floor, on the safety gate in front of
        // the most dangerous change this editor can make.
        onChange={(e) => {
          e.currentTarget.setAttribute('data-ack', String(e.currentTarget.checked));
        }}
        // `align="start"`: the sentence runs to two lines at 360px, and the
        // box belongs beside its first line. It is a prop and not a class
        // because a call-site `items-start` loses to the base
        // `items-center` — Tailwind emits start before center, `cn` is clsx.
        align="start"
        labelClassName="rounded-md border border-danger bg-danger-soft px-3 py-2.5 text-danger"
        label={
          <>
            I meant to move {identityChanges.length === 1 ? 'this row' : 'these rows'} to a
            different tank, nozzle or product.
          </>
        }
      />
    ) : null;

  const previewSection = (
    <section>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
        What it does to the report
      </h4>
      {preview.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : preview.isError ? (
        <Callout>
          The preview could not be calculated
          {preview.error instanceof ApiError ? `: ${preview.error.message}` : '.'} Your changes
          can still be applied — check the report after regenerating.
        </Callout>
      ) : (
        <PreviewTable preview={preview.data} />
      )}
    </section>
  );

  const inertNotice =
    inertOnly ? (
      <Callout intent="warning">
        None of these changes move a figure the report calculates. If you meant to correct a
        figure the report uses, close this and look for the column with a dot beside its name.
      </Callout>
    ) : null;

  const rebuildSection = (
    <section>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
        What will need rebuilding
      </h4>
      {affected.dates.length === 0 ? (
        <p className="text-sm text-text-muted">
          No generated report is affected yet. The correction will be used the next time this
          day is generated.
        </p>
      ) : (
        <p className="text-sm text-text">
          {affected.dates.length} report{affected.dates.length === 1 ? '' : 's'} will need
          regenerating, from {formatYmd(affected.dates[0]!)}
          <span className="text-text-muted">
            {' '}
            (
            {affected.dates
              .slice(0, DATES_SHOWN)
              .map((d) => formatYmd(d))
              .join(', ')}
            {affected.dates.length > DATES_SHOWN
              ? ` + ${affected.dates.length - DATES_SHOWN} more`
              : ''}
            )
          </span>
        </p>
      )}
    </section>
  );

  const sharedWarning =
    affected.sharedDates.length > 0 ? (
      <div className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm text-danger">
        <AlertTriangle width={16} height={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">
            The dealer already has {affected.sharedDates.length === 1 ? 'one' : affected.sharedDates.length} of
            these reports
          </p>
          <p className="mt-0.5">
            {affected.sharedDates.map((d) => formatYmd(d)).join(', ')} — the old figures are on
            their phone. After you regenerate you will need to share the report again and tell
            them what changed.
          </p>
        </div>
      </div>
    ) : null;

  const reasonSection = (
    <div className="min-w-0">
      <Label htmlFor="correction-reason" required>
        {/*
          Two questions, because there are two acts, and the surface is not what
          separates them. Typing a shift in overwrites nothing, so the only thing
          worth recording is where the figures came from — which is what the
          three chips put on the record for one tap. Changing a figure that is
          already on record is the other act, whether it was a machine that
          reported it or a person who typed it yesterday, and there the record of
          WHY is the whole control. So a hand day asks "why" too, as soon as it
          is correcting rather than typing: see `correcting` above.
        */}
        {manual && !correcting ? 'Where did these figures come from?' : 'Why is this being corrected?'}
      </Label>
      {manual ? (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {PROVENANCE_CHIPS.map((chip) => (
            <Button
              key={chip}
              variant="secondary"
              size="sm"
              onClick={() => appendChip(chip)}
            >
              {chip.replace(/\.$/, '')}
            </Button>
          ))}
        </div>
      ) : null}
      <Textarea
        id="correction-reason"
        value={reason}
        rows={2}
        maxLength={REASON_MAX}
        invalid={touchedReason && !reasonOk}
        aria-describedby="correction-reason-hint"
        placeholder={
          correcting
            ? 'e.g. Nozzle 4 was typed as 4,52,592; the outlet’s register reads 4,52,692'
            : manual
              ? // No date in the example. This one carried 30-08-2026 while the
                // note it sits behind is pre-written with the day being typed,
                // so an operator who cleared the box was shown one date for the
                // shift and had just been handed another.
                'e.g. Typed in by hand from the outlet’s register'
              : 'e.g. Tanker decanted on the 14th, invoice 88231 — never entered at the outlet'
        }
        onChange={(e) => {
          setTouchedReason(true);
          setReason(e.target.value);
        }}
      />
      {/* The gate has to name itself. This used to read "One line." while
          silently requiring three characters, so an operator who typed "ok"
          got a dead button, no message, and nothing to guess from — and the
          button sits in the sticky footer, out of sight of this field. Only
          after they have typed, though: leading with an error on an untouched
          form scolds someone who has not done anything wrong yet. */}
      {touchedReason && !reasonOk ? (
        <FieldError message={`Please write at least ${REASON_MIN} characters.`} />
      ) : (
        <p id="correction-reason-hint" className="mt-1 text-xs text-text-subtle">
          {manual && !correcting
            ? 'This is stored with every figure here. Change it if something needs explaining — a meter that was replaced, a tanker entered late.'
            : `One line, ${REASON_MIN} characters or more. It is stored with every change here and is what makes this readable in a month.`}
        </p>
      )}
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-words">
            {manual ? manual.title : `Apply ${pending.count} change${pending.count === 1 ? '' : 's'}`}
          </span>
          <HowThisWorks
            surface="admin-review-apply-corrections"
            label="Applying corrections"
            variant="icon"
          />
        </span>
      }
      description={`${dealerCodeLabel(day.dealer.code)} · ${formatYmd(day.businessDate)}`}
      footer={
        <>
          {/*
            The reason Apply is dead is written on screen, not carried in a
            `title` on a wrapper span. Two things were wrong with the wrapper:
            `title` never fires on touch, so on a phone a disabled primary action
            was silent and unexplained; and the footer stacks its children
            full width below md (`items-stretch`), which stretched the SPAN while
            the `inline-flex` Button inside it kept its natural width — so the
            primary action rendered short and left-aligned beside a full-width
            Cancel.

            It is stated before the operator has typed anything, unlike the
            FieldError beside the box: the box scrolls out of the panel, and this
            line is the only thing next to the button they are pressing.
          */}
          {reasonOk ? null : (
            // `order-last` reads backwards on purpose: the footer is
            // `flex-col-reverse` below md, so the highest order lands at the
            // TOP — above the buttons, where the sentence explains the one
            // underneath it. `md:order-none` puts it back at the head of the
            // right-aligned row at md.
            <p className="order-last w-full text-sm text-text-muted md:order-none md:w-auto">
              Write at least {REASON_MIN} characters above to apply these changes.
            </p>
          )}
          <Button variant="secondary" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button loading={applying} disabled={!reasonOk} onClick={() => onApply(reason.trim())}>
            {manual
              ? manual.primaryLabel
              : `Apply ${pending.count} change${pending.count === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {manual ? (
          <>
            {/*
              A hand-entered day, in the order the operator needs it: the field
              that unblocks the button first, then what the change does to the
              report, then a summary of what is being saved — instead of ten
              cards the operator has to scroll past to reach the note.
            */}
            {reasonSection}
            {previewSection}
            <section className="min-w-0">
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                What you are saving
              </h4>
              {manual.lines.length > 0 ? (
                <div className="grid gap-1 text-sm text-text">
                  {manual.lines.map((line, i) => (
                    <p key={i} className="min-w-0 break-words">
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                padding="none"
                align="start"
                className="mt-1 text-brand"
                onClick={() => setShowEveryFigure((v) => !v)}
              >
                {showEveryFigure ? 'Hide every figure' : 'Show every figure'}
              </Button>
              {showEveryFigure ? <div className="mt-2">{changesSection}</div> : null}
            </section>
            {rebuildSection}
            {identityAcknowledgement}
            {sharedWarning}
          </>
        ) : (
          <>
            {changesSection}
            {identityAcknowledgement}
            {previewSection}
            {inertNotice}
            {rebuildSection}
            {sharedWarning}
            {reasonSection}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** The variation, before and after, per product. */
function PreviewTable({ preview }: { preview: IrasCorrectionPreview | undefined }) {
  if (!preview || preview.products.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        This dealer has no Daily Sales Report, so there is no figure to recompute.
      </p>
    );
  }
  return (
    <div className="grid gap-1.5">
      {preview.products.map((p) => {
        const before = p.before;
        const after = p.after;
        if (!before || !after) {
          return (
            <p key={p.productKey} className="text-sm text-text-muted">
              {p.productLabel}: this day cannot be computed yet.
            </p>
          );
        }
        const changed = Math.abs(before.variation - after.variation) > 0.005;
        return (
          // Below md the product name gets its own line and the before/after
          // pair is one non-wrapping row under it. Inline, a 328px sheet wraps
          // this into three lines and the arrow can land alone on one —
          // separating the two figures the operator opened this dialog to
          // compare. At md it is the single baseline row it has always been.
          <div
            key={p.productKey}
            className="rounded-md border border-border px-2.5 py-2 text-sm md:flex md:flex-wrap md:items-baseline md:gap-x-2 md:gap-y-1"
          >
            <span className="font-medium text-text">{p.productLabel}</span>
            <span className="ml-1 text-text-muted md:ml-0">variation</span>
            <span className="mt-1 flex items-baseline gap-2 md:mt-0 md:contents">
              <Limit value={before.variation} outside={before.variationNotWithinLimit} muted />
              {changed ? (
                <>
                  <ArrowRight
                    width={13}
                    height={13}
                    strokeWidth={2}
                    className="shrink-0 text-text-subtle"
                  />
                  <Limit value={after.variation} outside={after.variationNotWithinLimit} />
                </>
              ) : (
                <span className="text-text-subtle">· unchanged</span>
              )}
            </span>
          </div>
        );
      })}
      {preview.warnings.map((w, i) => (
        <p key={i} className="text-[12px] text-warning">
          {w}
        </p>
      ))}
    </div>
  );
}

function Limit({
  value,
  outside,
  muted = false,
}: {
  value: number;
  outside: number;
  muted?: boolean;
}) {
  const litres = Math.round(value);
  const within = Math.abs(outside) < 0.005;
  return (
    <span
      className={cn(
        'whitespace-nowrap tabular-nums',
        muted ? 'text-text-subtle' : within ? 'font-semibold text-success' : 'font-semibold text-danger',
      )}
    >
      {litres > 0 ? `+${litres.toLocaleString('en-IN')}` : litres.toLocaleString('en-IN')} L
      <span className="ml-1 text-[11px] font-normal">
        {within ? 'within limit' : 'outside limit'}
      </span>
    </span>
  );
}

/** Formatted timestamp, exported so the page's banners read the same way. */
export function when(iso: string): string {
  return formatDateTime(iso);
}
