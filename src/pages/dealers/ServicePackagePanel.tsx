import { AlertTriangle, CheckCircle2, Circle, Clock, MinusCircle, PackageCheck } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardSubtitle,
  CardTitle,
  KeyValueList,
  Skeleton,
  Spinner,
  useToast,
} from '@/components/ui';
import { useServicePackageQuery, useStartServicePackage } from '@/hooks/api/useServicePackage';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Intent } from '@/lib/statusIntent';
import {
  serviceLabel,
  type Dealer,
  type ServicePackageStatus,
  type ServicePackageStepView,
} from '@dk/shared';

/**
 * The standard package on the dealer's Services tab: the eight services every
 * Indian Oil outlet gets, set up by the server from one button.
 *
 * Before it starts: what it does, what is attached already, and the button.
 * While it works: each step in plain words, how far a long step is, and — when a
 * step needs a person — what to do and "Try again". When it is done: what the
 * server worked out (the day close, where the dues start, the litres delivered
 * since the inspection), and the reminder that tanker density and water test
 * wait for Start services.
 */

const STATUS: Record<ServicePackageStatus, { label: string; intent: Intent }> = {
  running: { label: 'Working', intent: 'info' },
  waiting: { label: 'Waiting on the dealer', intent: 'warning' },
  blocked: { label: 'Needs you', intent: 'danger' },
  ready: { label: 'Ready for review', intent: 'success' },
  released: { label: 'Started', intent: 'success' },
};

function StepIcon({ state }: { state: ServicePackageStepView['state'] }) {
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

function Step({ step }: { step: ServicePackageStepView }) {
  const muted = step.state === 'pending';
  return (
    <li className="flex gap-2.5 py-2">
      <span className="mt-0.5 shrink-0">
        <StepIcon state={step.state} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={muted ? 'text-sm text-text-muted' : 'text-sm font-medium text-text'}>
          {step.label}
          {step.state === 'running' && step.progress ? (
            <span className="ml-2 font-normal text-text-muted">
              {step.progress.done} of {step.progress.total}
            </span>
          ) : null}
        </p>
        {step.message && step.state !== 'blocked' && step.state !== 'waiting' ? (
          <p className="mt-0.5 break-words text-xs text-text-muted">{step.message}</p>
        ) : null}
        {step.message && (step.state === 'blocked' || step.state === 'waiting') ? (
          <Callout intent={step.state === 'blocked' ? 'warning' : 'info'} className="mt-1.5">
            {step.message}
          </Callout>
        ) : null}
        {step.notes.length > 0 ? (
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-warning-strong md:text-warning">
            {step.notes.map((n) => (
              <li key={n} className="break-words">
                {n}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

export function ServicePackagePanel({ dealer }: { dealer: Dealer }) {
  const toast = useToast();
  const { data, isLoading } = useServicePackageQuery(dealer.id);
  const start = useStartServicePackage(dealer.id);
  const [showSteps, setShowSteps] = React.useState(false);

  const onStart = () => {
    start.mutate(undefined, {
      onSuccess: () =>
        toast.success(
          data?.setup ? 'Trying again. The step begins within a minute.' : 'Setting up the eight services. The first step begins within a minute.',
        ),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not start. Please try again.'),
    });
  };

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const { setup, services, cannotStart } = data;
  const attachedCount = services.filter((s) => s.attached).length;
  const status = setup ? STATUS[setup.status] : null;
  // A finished setup folds its steps away; everything else shows them.
  const finished = setup?.status === 'ready' || setup?.status === 'released';
  const stepsOpen = !finished || showSteps;
  const notes = setup ? setup.steps.flatMap((s) => s.notes) : [];
  const canPress = !cannotStart && (!setup || setup.status === 'blocked' || setup.status === 'waiting');

  return (
    <Card>
      <CardHeader
        padding="comfortable"
        action={status ? <Badge intent={status.intent}>{status.label}</Badge> : undefined}
      >
        <div>
          <CardTitle>Standard package</CardTitle>
          <CardSubtitle>
            The eight services every Indian Oil outlet gets, with their starting figures worked out from the
            portals.
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!setup ? (
          <div className="space-y-3">
            <p className="text-sm text-text">
              One press attaches all eight on the same schedules as every other outlet, finds the pump&rsquo;s day
              close, reads every tanker invoice since the last inspection for the DSR, and runs each service once.
              Nothing reaches the dealer until you press Start services.
            </p>
            <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {services.map((s) => (
                <li key={s.serviceId} className="flex items-center gap-2">
                  {s.attached ? (
                    <CheckCircle2 width={14} height={14} strokeWidth={1.75} className="shrink-0 text-success" />
                  ) : (
                    <Circle width={14} height={14} strokeWidth={1.75} className="shrink-0 text-text-muted" />
                  )}
                  <span className={s.attached ? 'text-text' : 'text-text-muted'}>
                    {serviceLabel(s.serviceId).en}
                    {s.attached ? ' (attached)' : ''}
                  </span>
                </li>
              ))}
            </ul>
            {attachedCount > 0 && !cannotStart ? (
              <p className="text-xs text-text-muted">
                {attachedCount} of 8 are attached already. Those are left exactly as they are.
              </p>
            ) : null}
          </div>
        ) : null}

        {setup ? (
          <p className="text-xs text-text-muted">
            {setup.startedBy.kind === 'auto'
              ? 'Started by itself once both logins worked'
              : `Started by ${setup.startedBy.name ?? 'an admin'}`}
            , {formatDateTime(setup.startedAt)}.
          </p>
        ) : null}

        {setup && setup.found.length > 0 ? (
          <KeyValueList
            items={setup.found.map((f) => ({ key: f.label, label: f.label, value: f.value }))}
            labelWidth="200px"
          />
        ) : null}

        {setup && setup.held.length > 0 ? (
          <Callout intent="info">
            {setup.held.map((id) => serviceLabel(id).en).join(' and ')} wait for Start services: they act for the
            dealer, so they are attached paused.
          </Callout>
        ) : null}

        {setup?.status === 'ready' ? (
          <Callout intent="info">
            Every step is done. Look over the first DSR and anything listed below, then press Start services in the
            Setup card.
          </Callout>
        ) : null}

        {/* A finished setup folds its steps away, so what they noted is lifted
            out here: these are exactly the things to read before starting. */}
        {finished && notes.length > 0 ? (
          <div>
            <p className="text-sm font-medium text-text">Worth a look before you start</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-warning-strong md:text-warning">
              {notes.map((n) => (
                <li key={n} className="break-words">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {setup ? (
          <div>
            {finished ? (
              <Button variant="ghost" size="sm" onClick={() => setShowSteps((v) => !v)}>
                {showSteps ? 'Hide the steps' : 'Show the steps'}
              </Button>
            ) : null}
            {stepsOpen ? (
              <ol className="divide-y divide-border">
                {setup.steps.map((step) => (
                  <Step key={step.key} step={step} />
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}

        {cannotStart && !setup ? <p className="text-sm text-text-muted">{cannotStart}</p> : null}

        {canPress ? (
          <Button
            onClick={onStart}
            loading={start.isPending}
            leftIcon={<PackageCheck width={16} height={16} strokeWidth={1.75} />}
          >
            {!setup ? 'Set up all eight services' : setup.status === 'waiting' ? 'Check again now' : 'Try again'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
