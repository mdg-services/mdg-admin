import { CheckCircle2, XCircle } from 'lucide-react';
import * as React from 'react';

import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import type { ServiceRunStep } from '@/types/serviceRun';

interface Props {
  steps: ServiceRunStep[];
}

/**
 * Whether a 'start' step is the latest entry that has no matching 'ok'/'error'
 * for the same step name later in the list. We render a spinner for it.
 */
function isInFlight(steps: ServiceRunStep[], index: number): boolean {
  const step = steps[index];
  if (!step || step.status !== 'start') return false;
  for (let i = index + 1; i < steps.length; i += 1) {
    const later = steps[i];
    if (!later) continue;
    if (
      later.name === step.name &&
      (later.status === 'ok' || later.status === 'error')
    ) {
      return false;
    }
  }
  return true;
}

export function RunStepTimeline({ steps }: Props) {
  if (steps.length === 0) return null;

  return (
    <ol className="relative ml-2 border-l border-border pl-4">
      {steps.map((step, idx) => {
        const inFlight = isInFlight(steps, idx);
        return (
          <li
            key={`${step.name}-${idx}-${step.status}`}
            className="relative mb-3 last:mb-0"
          >
            <span
              className={cn(
                'absolute -left-[1.4rem] flex h-5 w-5 items-center justify-center rounded-full bg-surface',
                step.status === 'error' && 'text-red-600',
                step.status === 'ok' && 'text-green-600',
              )}
              aria-hidden
            >
              <StepIcon status={step.status} inFlight={inFlight} />
            </span>

            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium text-text">{step.name}</span>
              {typeof step.durationMs === 'number' ? (
                <span className="text-xs text-text-muted">
                  {formatDuration(step.durationMs)}
                </span>
              ) : null}
              {inFlight ? (
                <span className="text-xs text-info">running</span>
              ) : null}
            </div>

            {step.message ? (
              <p className="mt-0.5 text-xs text-text-muted">{step.message}</p>
            ) : null}

            {step.status === 'error' && step.error ? (
              <details className="mt-2 rounded-md border border-border bg-surface-2 p-2 text-xs">
                <summary className="cursor-pointer select-none font-medium text-red-600">
                  Error details
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-xs text-text">
                  {step.error.message}
                  {step.error.stack ? `\n\n${step.error.stack}` : ''}
                </pre>
              </details>
            ) : null}

            <StepMeta meta={step.meta} status={step.status} />
          </li>
        );
      })}
    </ol>
  );
}

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Renders a step's `meta` as a compact, muted key/value block. Unobtrusive by
 * default (collapsed behind a toggle); expanded automatically on error steps so
 * the failure `code`/`hint`/`phase` are visible without a click.
 */
function StepMeta({
  meta,
  status,
}: {
  meta: ServiceRunStep['meta'];
  status: ServiceRunStep['status'];
}) {
  if (!meta) return null;
  const entries = Object.entries(meta);
  if (entries.length === 0) return null;

  return (
    <details className="mt-1.5 text-xs" open={status === 'error'}>
      <summary className="cursor-pointer select-none text-text-subtle hover:text-text-muted">
        Details
      </summary>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 overflow-x-auto rounded-sm bg-surface-2 p-2 font-mono text-text-muted">
        {entries.map(([key, value]) => (
          <React.Fragment key={key}>
            <dt className="whitespace-nowrap text-text-subtle">{key}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words">
              {formatMetaValue(value)}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </details>
  );
}

function StepIcon({
  status,
  inFlight,
}: {
  status: ServiceRunStep['status'];
  inFlight: boolean;
}) {
  if (status === 'ok') {
    return (
      <CheckCircle2
        width={18}
        height={18}
        strokeWidth={1.75}
        className="text-green-600"
      />
    );
  }
  if (status === 'error') {
    return (
      <XCircle
        width={18}
        height={18}
        strokeWidth={1.75}
        className="text-red-600"
      />
    );
  }
  // 'start'
  if (inFlight) {
    return <Spinner size={16} className="text-info" />;
  }
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-text-subtle"
      aria-hidden
    />
  );
}
