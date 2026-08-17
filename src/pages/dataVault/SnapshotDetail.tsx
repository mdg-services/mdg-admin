import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  CornerDownRight,
  PencilRuler,
  Table2,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Badge,
  Button,
  Card,
  CardContent,
  StatusChip,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDateTime, formatYmd } from '@/lib/format';
import { IRAS_REPORT_CODES, dealerCodeLabel } from '@dk/shared';
import type {
  IrasDataSnapshot,
  IrasDataset,
  IrasReportCode,
  IrasShiftAnchor,
} from '@dk/shared';

import { DatasetTable } from './DatasetTable';


export interface SnapshotDetailProps {
  snapshot: IrasDataSnapshot;
  /** Rendered top-right of the identity header, e.g. a "Collect now" button. */
  actions?: React.ReactNode;
  /**
   * Drop the dealer's name/code line when the parent already shows it (a drawer
   * title, a dealer detail page). The status + capture meta stays either way —
   * it is what makes the panel readable on its own.
   */
  hideDealerName?: boolean;
  className?: string;
}

/** `HH:mm:ss` → `HH:mm`; anything unexpected passes through untouched. */
function hhmm(time: string | null | undefined): string {
  if (!time) return '—';
  return /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : time;
}

/** Local clock time of an ISO instant, e.g. `21:30`. */
function timeOf(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * One dealer's collected IRAS data, digest first.
 *
 * The order is deliberate: what went wrong (if anything) → why this shift was
 * chosen → the numbers themselves, every table folded away until asked for.
 */
export function SnapshotDetail({
  snapshot,
  actions,
  hideDealerName = false,
  className,
}: SnapshotDetailProps) {
  const navigate = useNavigate();
  const filePrefix = `${snapshot.dealerCode || snapshot.dealerId.slice(-6)}_${snapshot.businessDate}`;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {hideDealerName ? (
              <h3 className="text-base font-semibold text-text">
                {formatYmd(snapshot.businessDate)}
              </h3>
            ) : (
              <h3 className="truncate text-base font-semibold text-text">
                {dealerCodeLabel(snapshot.dealerCode)}
              </h3>
            )}
            <StatusChip kind="irasSnapshot" value={snapshot.status} />
          </div>
          {hideDealerName ? null : (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-muted">
              {snapshot.dealerCode ? (
                <span className="font-mono">{snapshot.dealerCode}</span>
              ) : null}
              {snapshot.roCode ? <span>· RO {snapshot.roCode}</span> : null}
              <span>· {formatYmd(snapshot.businessDate)}</span>
            </p>
          )}
          <p className="mt-0.5 text-xs text-text-subtle">
            Collected at {formatDateTime(snapshot.capturedAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* The way into the editor from every Vault surface — the cross-dealer
              drawer, the per-dealer tab and a historic capture all render this
              panel, so one button here covers all three. */}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<PencilRuler width={14} height={14} strokeWidth={1.75} />}
            onClick={(e) => {
              e.stopPropagation();
              navigate(
                `/data-vault/dealers/${snapshot.dealerId}/days/${snapshot.businessDate}`,
              );
            }}
          >
            Correct this day
          </Button>
          {actions}
        </div>
      </div>

      {snapshot.failureReason ? (
        <div className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle
            width={16}
            height={16}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            <p className="font-medium">
              {snapshot.status === 'FAILED'
                ? 'This collection failed'
                : 'This collection came back incomplete'}
            </p>
            <p className="mt-0.5">{snapshot.failureReason}</p>
          </div>
        </div>
      ) : snapshot.lastFailure ? (
        // The day HAS its data; only a later re-collection attempt failed. That
        // is a warning, not a failure — showing it in danger red would suggest
        // the figures below are untrustworthy when they are perfectly good.
        <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-sm text-warning">
          <AlertTriangle
            width={16}
            height={16}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            <p className="font-medium">
              The data below is good — but the latest re-collection attempt failed
            </p>
            <p className="mt-0.5">
              {snapshot.lastFailure.reason} (
              {formatDateTime(snapshot.lastFailure.at)})
            </p>
          </div>
        </div>
      ) : null}

      <ShiftAnchorCard shift={snapshot.shift} />

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Reports
        </p>
        {IRAS_REPORT_CODES.map((code) => (
          <DatasetSection
            key={code}
            code={code}
            dataset={snapshot.datasets[code]}
            filePrefix={filePrefix}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * "Why this shift" — the one explanatory element on the screen.
 *
 * Configured time → search floor → the shift that was actually selected, then
 * the other closing shifts the portal offered. Everything below hangs off this
 * one decision, so it is stated in plain terms rather than dumped as fields.
 */
function ShiftAnchorCard({ shift }: { shift: IrasShiftAnchor }) {
  // Candidates are stored as `dd-MM-yyyy HH:mm:ss` while `selectedShiftTime` is
  // the bare `HH:mm:ss`, so comparing them directly never matches and the chosen
  // shift ends up listed under "other shifts the portal offered" as well.
  // Rebuild the same composite key before filtering.
  const selectedKey = `${shift.selectedShiftDate} ${shift.selectedShiftTime}`;
  const others = shift.candidateShiftTimes.filter(
    (t) => t !== selectedKey && t !== shift.selectedShiftTime,
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Clock
            width={16}
            height={16}
            strokeWidth={1.75}
            className="shrink-0 text-brand"
          />
          <p className="text-sm font-semibold text-text">Why this shift</p>
        </div>
        <p className="mt-1 text-sm text-text-muted">
          Every row below belongs to one closing shift. It was picked from the
          shifts IRAS offered from the search floor onwards.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <AnchorStep
            label="Configured shift"
            value={hhmm(shift.configuredTime)}
            hint={formatDateTime(shift.anchorAt)}
          />
          <AnchorStep
            label="Search floor"
            value={timeOf(shift.searchFrom)}
            hint="Earliest shift considered"
          />
          <AnchorStep
            label="Selected shift"
            // Full seconds, deliberately: 05:59:59 (the closing shift) and
            // 06:00:01 (the next opening one) truncate to the same HH:mm, and
            // the stock rows were matched on this exact second. This is the one
            // value an admin uses to check the pipeline picked the right shift.
            value={shift.selectedShiftTime || '—'}
            hint={shift.selectedShiftDate}
            selected
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          <CornerDownRight
            width={14}
            height={14}
            strokeWidth={1.75}
            className="shrink-0 text-text-subtle"
          />
          <span className="text-xs text-text-muted">
            {others.length > 0
              ? 'Other shifts the portal offered:'
              : 'The portal offered no other closing shift in this window.'}
          </span>
          {others.map((t) => (
            <span
              key={t}
              className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-text-subtle"
            >
              {/* Full precision, for the same reason as the selected shift. */}
              {t}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AnchorStep({
  label,
  value,
  hint,
  selected = false,
}: {
  label: string;
  value: string;
  hint?: string;
  selected?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2',
        selected
          ? 'border-brand bg-brand-soft'
          : 'border-border bg-surface-2',
      )}
    >
      <p
        className={cn(
          'text-[11px] font-medium uppercase tracking-wide',
          selected ? 'text-brand' : 'text-text-subtle',
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 font-mono text-lg font-semibold tabular-nums',
          selected ? 'text-brand' : 'text-text',
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 truncate text-[11px] text-text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * One report, folded shut. The header alone answers "did we get it, and how much
 * of it" — the admin opens the table only when the summary is not enough.
 */
function DatasetSection({
  code,
  dataset,
  filePrefix,
}: {
  code: IrasReportCode;
  dataset: IrasDataset | undefined;
  filePrefix: string;
}) {
  const [open, setOpen] = React.useState(false);

  if (!dataset) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5">
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-text-subtle">
          {code}
        </span>
        <span className="text-sm text-text-subtle">Not collected</span>
      </div>
    );
  }

  const dropped = dataset.rawRowCount - dataset.rowCount;

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-surface-2"
      >
        <span className="mt-0.5 shrink-0 text-text-muted" aria-hidden>
          {open ? (
            <ChevronDown width={16} height={16} strokeWidth={1.75} />
          ) : (
            <ChevronRight width={16} height={16} strokeWidth={1.75} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-text">
              {code}
            </span>
            <span className="truncate text-sm font-medium text-text">
              {dataset.label}
            </span>
            <Badge intent={dataset.rowCount > 0 ? 'neutral' : 'warning'}>
              {dataset.rowCount} row{dataset.rowCount === 1 ? '' : 's'}
            </Badge>
          </span>
          <span className="mt-1 block text-xs text-text-muted">
            {dataset.filterDescription}
          </span>
          {dropped > 0 ? (
            <span className="mt-0.5 block text-[11px] text-text-subtle">
              {dropped} of {dataset.rawRowCount} portal rows fell outside this
              shift.
            </span>
          ) : null}
        </span>
        <Table2
          width={16}
          height={16}
          strokeWidth={1.75}
          className="mt-0.5 hidden shrink-0 text-text-subtle sm:block"
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-border bg-bg p-3">
          <DatasetTable dataset={dataset} filePrefix={filePrefix} />
        </div>
      ) : null}
    </div>
  );
}
