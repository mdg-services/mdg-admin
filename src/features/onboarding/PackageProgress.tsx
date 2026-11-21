import { AlertTriangle, CheckCircle2, Clock, Hourglass, Sparkles } from 'lucide-react';

import { Button, Spinner, useToast } from '@/components/ui';
import { useStartServicePackage } from '@/hooks/api/useServicePackage';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  figureRows,
  generalRows,
  nextTryText,
  serviceCounts,
  type Readiness,
  type ReadinessRow,
} from '@/lib/setupProgress';
import type { ServicePackageState } from '@dk/shared';

/**
 * Where the services stand, as services rather than steps (ADR 0050): the four whose
 * starting figures are worked out from the portals, one line each — ready, working,
 * waiting for something outside (with its next try), after another service, or
 * needing a person (with what to do and one "Try again"). Problems in the steps that
 * belong to no one service (the logins, attaching, the first runs) come first.
 *
 * Used on the Setup card (`compact`: only what is not ready, and nothing at all once
 * everything is) and at the top of the Services tab's package card (every service).
 */
export function PackageProgress({
  dealerId,
  state,
  compact = false,
  now = Date.now(),
  className,
}: {
  dealerId: string;
  state: ServicePackageState;
  compact?: boolean;
  now?: number;
  className?: string;
}) {
  const toast = useToast();
  const retry = useStartServicePackage(dealerId);
  const setup = state.setup;
  if (!setup) return null;

  const rows = [...generalRows(setup), ...figureRows(setup)];
  const shown = compact ? rows.filter((r) => r.readiness.kind !== 'ready') : rows;
  const needsYou = rows.some((r) => r.readiness.kind === 'needs_you');
  const { running, gettingReady } = serviceCounts(state);
  const review = setup.review && setup.review.verdict === 'look' ? setup.review : null;
  if (compact && shown.length === 0 && !review) return null;

  const onRetry = () =>
    retry.mutate(undefined, {
      onSuccess: () => toast.success('Trying again. It begins within a minute.'),
      onError: (err) =>
        toast.error(
          err instanceof ApiError ? err.message : 'Could not try again. Please try again.',
        ),
    });

  return (
    <section aria-label="Getting the services ready" className={cn('grid gap-2', className)}>
      {state.servicesStartedAt || compact ? (
        <p className="text-xs text-text-muted">
          {running} of {state.services.length} services running
          {gettingReady > 0 ? ` · ${gettingReady} getting ready` : ''}
        </p>
      ) : null}
      {shown.length > 0 ? (
        <ul className="grid gap-2">
          {shown.map((r) => (
            <Row key={r.key} row={r} now={now} />
          ))}
        </ul>
      ) : null}
      {needsYou ? (
        <div>
          <Button size="sm" variant="secondary" loading={retry.isPending} onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
      {review ? (
        <div className="rounded-md border border-border p-2.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text">
            <Sparkles
              width={14}
              height={14}
              strokeWidth={1.75}
              className="shrink-0 text-info"
              aria-hidden
            />
            {review.headline}
          </p>
          {review.points.length > 0 ? (
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-text-muted">
              {review.points.map((p) => (
                <li key={p} className="break-words">
                  {p}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-1.5 text-[11px] text-text-subtle">
            {review.by === 'ai'
              ? 'Read by the AI from what the setup noted.'
              : 'What the setup noted.'}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function RowIcon({ r }: { r: Readiness }) {
  const common = { width: 16, height: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;
  switch (r.kind) {
    case 'ready':
      return <CheckCircle2 {...common} className="text-success" />;
    case 'working':
      return <Spinner size={16} />;
    case 'waiting':
      return <Clock {...common} className="text-warning" />;
    case 'after':
      return <Hourglass {...common} className="text-text-muted" />;
    case 'needs_you':
      return <AlertTriangle {...common} className="text-danger" />;
  }
}

function Row({ row, now }: { row: ReadinessRow; now: number }) {
  const r = row.readiness;
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 shrink-0">
        <RowIcon r={r} />
      </span>
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <p className="text-sm font-medium text-text">
          {row.name}
          {r.kind === 'ready' ? (
            <span className="font-normal text-text-muted"> · running</span>
          ) : null}
          {r.kind === 'needs_you' ? (
            <span className="font-normal text-danger">
              {' '}
              · {r.dealer ? 'needs the dealer' : 'needs you'}
            </span>
          ) : null}
        </p>
        {r.kind === 'working' || r.kind === 'after' ? (
          <p className="text-xs text-text-muted">{r.detail}</p>
        ) : null}
        {r.kind === 'waiting' ? (
          <p className="text-xs text-text-muted">
            {r.detail}{' '}
            <span className="whitespace-nowrap text-text-subtle">
              · {nextTryText(r.retryAt, now)}
            </span>
          </p>
        ) : null}
        {r.kind === 'needs_you' ? (
          <>
            <p className="text-xs text-text">{r.detail}</p>
            {r.action ? <p className="text-xs text-text-muted">{r.action}</p> : null}
          </>
        ) : null}
      </div>
    </li>
  );
}
