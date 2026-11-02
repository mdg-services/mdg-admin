import { AlertTriangle, CheckCircle2, Circle, Clock, MinusCircle } from 'lucide-react';

import {
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Spinner,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { ClaimStepView } from '@dk/shared';

/**
 * The claim's steps, in the look of the Services tab's standard-package list
 * (`ServicePackagePanel`): an icon for where each one stands, its words, and — for
 * a step that is waiting or stuck — the sentence in a callout.
 *
 * The helpers are copied rather than shared for the reason `ttDensity/format.ts`
 * gives: the package's are private to its panel, and a shared version would need
 * the step type and the copy as parameters, which reads worse than two short files.
 */

function StepIcon({ state }: { state: ClaimStepView['state'] }) {
  const common = { width: 16, height: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;
  switch (state) {
    case 'done':
      return <CheckCircle2 {...common} className="text-success" />;
    case 'skipped':
      return <MinusCircle {...common} className="text-text-muted" />;
    case 'running':
      return <Spinner size={16} />;
    case 'waiting':
      return <Clock {...common} className="text-warning" />;
    case 'blocked':
      return <AlertTriangle {...common} className="text-danger" />;
    default:
      return <Circle {...common} className="text-text-muted" />;
  }
}

function Step({ step }: { step: ClaimStepView }) {
  const muted = step.state === 'pending';
  const callout = step.state === 'blocked' || step.state === 'waiting';
  return (
    <li className="flex gap-2.5 py-2">
      <span className="mt-0.5 shrink-0">
        <StepIcon state={step.state} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={muted ? 'text-sm text-text-muted' : 'text-sm font-medium text-text'}>
          {step.label}
        </p>
        {step.message && !callout ? (
          <p className="mt-0.5 break-words text-xs text-text-muted">{step.message}</p>
        ) : null}
        {step.message && callout ? (
          <Callout intent={step.state === 'blocked' ? 'warning' : 'info'} className="mt-1.5">
            {step.message}
          </Callout>
        ) : null}
        {step.at && (step.state === 'done' || step.state === 'skipped') ? (
          <p className="mt-0.5 text-xs text-text-subtle">{formatDateTime(step.at)}</p>
        ) : null}
      </div>
    </li>
  );
}

export function ClaimTimeline({ steps }: { steps: readonly ClaimStepView[] }) {
  return (
    <Card>
      <CardHeader padding="comfortable">
        <div>
          <CardTitle>Progress</CardTitle>
          <CardSubtitle>Where this claim has got to, step by step.</CardSubtitle>
        </div>
      </CardHeader>
      <CardContent>
        {steps.length === 0 ? (
          <p className="text-sm text-text-muted">The first step begins within a minute.</p>
        ) : (
          <ol className="divide-y divide-border">
            {steps.map((step) => (
              <Step key={step.key} step={step} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
