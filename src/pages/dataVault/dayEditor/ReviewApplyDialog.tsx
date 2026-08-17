import { AlertTriangle, ArrowRight } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Dialog,
  Label,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { usePreviewIrasCorrections } from '@/hooks/api/useIrasEdits';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatYmd } from '@/lib/format';
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
  const preview = usePreviewIrasCorrections(day.dealer.id, day.businessDate);

  const changes = React.useMemo(() => describePending(day, pending.state), [day, pending.state]);
  const affected = React.useMemo(() => reportsAffected(day), [day]);

  const identityChanges = changes.filter((c) => c.identityWarning);
  const effective = changes.filter((c) => c.usedByReport);
  const inertOnly = changes.length > 0 && effective.length === 0;

  // Recompute once per opening, against the change set as it stands.
  const requested = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      requested.current = false;
      setReason('');
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
      description={`${day.dealer.name ?? 'This dealer'} · ${formatYmd(day.businessDate)}`}
      footer={
        <>
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
                  {c.usedByReport ? null : <Badge intent="neutral">changes no figure</Badge>}
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
          <label className="flex items-start gap-2 rounded-md border border-danger bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <input
              type="checkbox"
              className="mt-0.5"
              onChange={(e) => {
                // Held in the DOM rather than state: it gates nothing on its own —
                // the reason field is the real gate — but an operator who has to
                // tick it has read the sentence above it.
                e.currentTarget.setAttribute('data-ack', String(e.currentTarget.checked));
              }}
            />
            <span>
              I meant to move {identityChanges.length === 1 ? 'this row' : 'these rows'} to a
              different tank, nozzle or product.
            </span>
          </label>
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
            None of these changes affect any report — every column you edited is stored but read by
            no calculation. If you meant to correct a figure the report uses, close this and look
            for the column with a dot beside its name.
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
          <Label htmlFor="correction-reason">Why is this being corrected?</Label>
          <Textarea
            id="correction-reason"
            value={reason}
            rows={2}
            maxLength={REASON_MAX}
            placeholder="e.g. Tanker decanted on the 14th, invoice 88231 — never entered at the outlet"
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="mt-1 text-xs text-text-subtle">
            One line. It is stored with every change here and is what makes this readable in a
            month.
          </p>
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
          <div
            key={p.productKey}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border border-border px-2.5 py-2 text-sm"
          >
            <span className="font-medium text-text">{p.productLabel}</span>
            <span className="text-text-muted">variation</span>
            <Limit value={before.variation} outside={before.variationNotWithinLimit} muted />
            {changed ? (
              <>
                <ArrowRight width={13} height={13} strokeWidth={2} className="text-text-subtle" />
                <Limit value={after.variation} outside={after.variationNotWithinLimit} />
              </>
            ) : (
              <span className="text-text-subtle">· unchanged</span>
            )}
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
