import { AlertTriangle, ArrowRight } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Dialog,
  FieldError,
  Label,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { usePreviewIrasCorrections } from '@/hooks/api/useIrasEdits';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatYmd } from '@/lib/format';
import { dealerCodeLabel } from '@dk/shared';
import type { IrasCorrectionPreview, IrasDayEditorView } from '@dk/shared';

import { describePending, reportsAffected } from './describePending';
import { toChanges, type PendingApi } from './usePendingChanges';

const REASON_MIN = 3;
const REASON_MAX = 500;
/** Report dates listed in full before collapsing into "+ N more". */
const DATES_SHOWN = 6;

export interface ReviewApplyDialogProps {
  open: boolean;
  onClose: () => void;
  day: IrasDayEditorView;
  pending: PendingApi;
  applying: boolean;
  onApply: (reason: string) => void;
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
}: ReviewApplyDialogProps) {
  const [reason, setReason] = React.useState('');
  /** Only complain about the reason once they have actually typed in it. */
  const [touchedReason, setTouchedReason] = React.useState(false);
  const preview = usePreviewIrasCorrections(day.dealer.id, day.businessDate);

  const changes = React.useMemo(() => describePending(day, pending.state), [day, pending.state]);
  const affected = React.useMemo(() => reportsAffected(day), [day]);

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
      return;
    }
    if (requested.current) return;
    requested.current = true;
    preview.mutate(toChanges(pending.state));
    // `preview` and `pending.state` are deliberately not dependencies: this must
    // fire once when the dialog opens, not on every keystroke in the reason box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reasonOk = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`Apply ${pending.count} change${pending.count === 1 ? '' : 's'}`}
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
            Apply {pending.count} change{pending.count === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
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
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-text">
                    {c.code}
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

        {identityChanges.length > 0 ? (
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
        ) : null}

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

        {inertOnly ? (
          <Callout intent="warning">
            None of these changes move a figure the report calculates. If you meant to correct a
            figure the report uses, close this and look for the column with a dot beside its name.
          </Callout>
        ) : null}

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

        {affected.sharedDates.length > 0 ? (
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
        ) : null}

        <div>
          <Label htmlFor="correction-reason" required>
            Why is this being corrected?
          </Label>
          <Textarea
            id="correction-reason"
            value={reason}
            rows={2}
            maxLength={REASON_MAX}
            invalid={touchedReason && !reasonOk}
            aria-describedby="correction-reason-hint"
            placeholder="e.g. Tanker decanted on the 14th, invoice 88231 — never entered at the outlet"
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
              One line, {REASON_MIN} characters or more. It is stored with every change here and is
              what makes this readable in a month.
            </p>
          )}
        </div>
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
