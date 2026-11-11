import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ListChecks,
  Scale,
} from 'lucide-react';

import { Badge, Callout, Card, CardContent, Skeleton } from '@/components/ui';
import { useBpclCrossCheck } from '@/hooks/api/useBpclData';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatLitres, formatYmd } from '@/lib/format';
import type {
  IrasDataSnapshot,
  ProviderCrossCheckLine,
  SnapshotCheck,
} from '@dk/shared';

import {
  crossCheckDateFor,
  crossCheckItemLabel,
  crossCheckVerdict,
  dayNotes,
  daySourceStrip,
  groupCrossCheckLines,
  lineStatus,
} from './dayData';

/**
 * Where a day's figures came from, and whether anything on the day wants a
 * person's eye — one slim line above the day, so it is read before the figures.
 *
 * It shows for a BPCL day, a day typed in by hand and any day carrying checks.
 * An ordinary Indian Oil portal day with no checks gets nothing, so those outlets
 * see exactly what they saw before this strip existed (`daySourceStrip` decides).
 *
 * The warning count is here and not only in the list below because the list sits
 * under the report tables: a day with a gauge still moving after the close should
 * say so before anyone scrolls.
 */
export function DaySourceStrip({ snapshot }: { snapshot: IrasDataSnapshot }) {
  const strip = daySourceStrip(snapshot);
  if (!strip) return null;
  const { warnings } = strip;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-text-subtle">
        Source
      </span>
      <Badge intent={strip.intent}>{strip.label}</Badge>
      {warnings > 0 ? (
        <Badge intent="warning">
          {warnings} {warnings === 1 ? 'check' : 'checks'} to look at
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * What goes under a day's reports: the checks the collector raised and, for a
 * BPCL day, our report set beside BPCL's own page.
 *
 * Renders nothing for an IRAS day with no checks — IRAS days never carry either,
 * and an empty card on every Indian Oil outlet's day would be noise. A failed
 * BPCL day gets neither the green "no checks flagged" line nor the comparison:
 * nothing was collected, so nothing ran. Checks that are present are still listed.
 */
export function DayProviderNotes({ snapshot }: { snapshot: IrasDataSnapshot }) {
  const notes = dayNotes(snapshot);
  if (!notes) return null;
  return (
    <>
      {notes.checks.length > 0 || notes.allClear ? (
        <DayChecks checks={notes.checks} />
      ) : null}
      {notes.crossCheck ? (
        <ProviderCrossCheckPanel
          dealerId={snapshot.dealerId}
          snapshotDate={snapshot.businessDate}
        />
      ) : null}
    </>
  );
}

/** The day's checks as short sentences, warnings first. */
function DayChecks({ checks }: { checks: SnapshotCheck[] }) {
  if (checks.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-text-muted">
        <CheckCircle2
          width={16}
          height={16}
          strokeWidth={1.75}
          className="shrink-0 text-success"
          aria-hidden
        />
        No checks flagged on this day.
      </div>
    );
  }
  const warnings = checks.filter((c) => c.severity === 'WARN').length;
  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <ListChecks
            width={16}
            height={16}
            strokeWidth={1.75}
            className="shrink-0 text-brand"
            aria-hidden
          />
          <p className="text-sm font-semibold text-text">Checks on this day</p>
          {warnings > 0 ? (
            <Badge intent="warning">{warnings} to look at</Badge>
          ) : (
            <Badge intent="neutral">For the record</Badge>
          )}
        </div>
        <ul className="mt-2 grid gap-1.5">
          {checks.map((c, i) => {
            const warn = c.severity === 'WARN';
            return (
              <li key={`${c.code}-${i}`} className="flex items-start gap-2">
                {warn ? (
                  <AlertTriangle
                    width={14}
                    height={14}
                    strokeWidth={1.75}
                    className="mt-1 shrink-0 text-warning"
                    aria-label="Look at this"
                  />
                ) : (
                  <Info
                    width={14}
                    height={14}
                    strokeWidth={1.75}
                    className="mt-1 shrink-0 text-info"
                    aria-label="For the record"
                  />
                )}
                <span
                  className={cn(
                    'min-w-0 break-words text-sm',
                    warn ? 'text-text' : 'text-text-muted',
                  )}
                >
                  {c.message}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Litres, or a dash where the page printed nothing. */
function litres(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : formatLitres(n);
}

/**
 * Our report for the day before this one, against what BPCL's own page shows
 * for the same hours. Every line says what we have, what BPCL has, and whether
 * they agree — a disagreement is a reason to look before the report goes out,
 * never a change to a figure.
 */
export function ProviderCrossCheckPanel({
  dealerId,
  snapshotDate,
}: {
  dealerId: string;
  snapshotDate: string;
}) {
  const reportDate = crossCheckDateFor(snapshotDate);
  const q = useBpclCrossCheck(dealerId, reportDate);
  const check = q.data;
  const verdict = check ? crossCheckVerdict(check) : null;
  const groups = check && verdict && verdict.kind !== 'unavailable'
    ? groupCrossCheckLines(check.lines)
    : [];

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <Scale
            width={16}
            height={16}
            strokeWidth={1.75}
            className="shrink-0 text-brand"
            aria-hidden
          />
          <p className="text-sm font-semibold text-text">
            Compared with BPCL&rsquo;s page
          </p>
          {verdict?.kind === 'agrees' ? (
            <Badge intent="success">All agree</Badge>
          ) : verdict?.kind === 'differs' ? (
            <Badge intent="warning">
              {verdict.differing > 0
                ? `${verdict.differing} of ${verdict.total} differ`
                : 'Differs'}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-text-muted">
          Our report for {formatYmd(check?.businessDate ?? reportDate)}, set
          against the totals BPCL&rsquo;s own page shows for the same hours.
        </p>

        {q.isLoading ? (
          <div className="mt-3 grid gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : q.isError ? (
          <Callout
            intent="warning"
            className="mt-3"
            onRetry={() => void q.refetch()}
          >
            Could not load the comparison.{' '}
            {q.error instanceof ApiError ? q.error.message : 'Please try again.'}
          </Callout>
        ) : verdict?.kind === 'unavailable' ? (
          <Callout intent="info" className="mt-3">
            {verdict.reason}
          </Callout>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {groups.map((g) => (
              <div
                key={g.productKey}
                className="overflow-hidden rounded-md border border-border bg-surface"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-1.5">
                  <span className="font-mono text-[11px] font-semibold text-text">
                    {g.productKey}
                  </span>
                  <span
                    className={cn(
                      'text-xs',
                      g.agrees
                        ? 'text-text-subtle'
                        : 'font-medium text-warning-strong md:text-warning',
                    )}
                  >
                    {g.agrees ? 'All agree' : 'Differs'}
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {g.lines.map((line, i) => (
                    <CrossCheckLineRow
                      key={`${line.item}-${i}`}
                      line={line}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** One line of the comparison: the item, both figures, the gap and the note. */
function CrossCheckLineRow({ line }: { line: ProviderCrossCheckLine }) {
  // A line the server left uncompared on purpose (measured receipts, rule-based
  // testing, a figure BPCL did not give) has no gap and "agrees" only in the
  // sense that it raises nothing; a green "Agrees" would claim a check that was
  // never made.
  const status = lineStatus(line);
  return (
    <li className="grid gap-1 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-medium text-text">
          {crossCheckItemLabel(line.item)}
        </span>
        <Badge intent={status.intent}>{status.label}</Badge>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div className="min-w-0">
          <dt className="text-text-subtle">Ours</dt>
          <dd className="tabular-nums text-text">{litres(line.ours)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-subtle">BPCL&rsquo;s page</dt>
          <dd className="tabular-nums text-text">{litres(line.theirs)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-subtle">Gap</dt>
          <dd
            className="tabular-nums text-text"
            title={`Allowed to differ by ${formatLitres(line.tolerance)} either way`}
          >
            {line.gap === null || line.gap === undefined
              ? '—'
              : formatLitres(line.gap, { sign: true })}
          </dd>
        </div>
      </dl>
      {line.note ? (
        <p className="break-words text-xs text-text-muted">{line.note}</p>
      ) : null}
    </li>
  );
}
