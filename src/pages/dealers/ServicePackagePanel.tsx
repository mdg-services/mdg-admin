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
  HowThisWorks,
  Input,
  KeyValueList,
  Label,
  Skeleton,
  Spinner,
  useToast,
} from '@/components/ui';
import { PackageProgress } from '@/features/onboarding/PackageProgress';
import { useSaveHpclInspection, useServicePackageQuery, useStartServicePackage } from '@/hooks/api/useServicePackage';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { istStamp } from '@/lib/intake';
import { nextTryText } from '@/lib/setupProgress';
import type { Intent } from '@/lib/statusIntent';
import {
  serviceLabel,
  type Dealer,
  type HpclInspectionEntry,
  type ServicePackageStatus,
  type ServicePackageStepView,
} from '@dk/shared';

/**
 * The standard package on the dealer's Services tab: the services every Indian Oil
 * outlet gets (or an HPCL pump's own), set up by the server by itself once the logins
 * work (ADR 0050), or from one button.
 *
 * An HPCL pump's setup asks the owner for their last inspection report and waits:
 * a person types the inspection's date and time from it here, and only then does
 * the setup attach anything (owner, 15 Nov 2026).
 *
 * Before it starts: what it does, what is attached already, and the button. Once it
 * has started: the services as services (`PackageProgress`) — running, getting ready
 * with the next try, or needing a person with what to do — then what the server
 * worked out (the day close, where the dues start, the litres delivered since the
 * inspection), the AI's read of anything worth a look, and every step folded away
 * behind "Show every step".
 */

const STATUS: Record<ServicePackageStatus, { label: string; intent: Intent }> = {
  running: { label: 'Working', intent: 'info' },
  waiting: { label: 'Getting ready', intent: 'info' },
  blocked: { label: 'Needs you', intent: 'danger' },
  ready: { label: 'All set up', intent: 'success' },
  released: { label: 'All set up', intent: 'success' },
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
        {step.state === 'pending' && step.waitsFor.length > 0 ? (
          <p className="mt-0.5 break-words text-xs text-text-subtle">After: {step.waitsFor.join('; ')}</p>
        ) : null}
        {step.state === 'blocked' || step.state === 'waiting' ? (
          <Callout intent={step.state === 'blocked' ? 'warning' : 'info'} className="mt-1.5">
            {step.watch?.headline ?? step.message}
            {step.watch?.action ? <span className="block text-xs">{step.watch.action}</span> : null}
            {step.state === 'waiting' ? (
              <span className="block text-xs">
                {nextTryText(step.retryAt, Date.now())}
                {step.tries > 1 ? ` · tried ${step.tries} times` : ''}
              </span>
            ) : null}
            {step.watch?.by === 'ai' ? <span className="block text-[11px] opacity-80">Judged by the AI watch.</span> : null}
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

/** Today in India, `YYYY-MM-DD`: an inspection cannot be later than this. */
function istToday(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

/**
 * An HPCL pump's last inspection, typed from the owner's copy of the officer's report.
 * Saving lets the setup carry on from its inspection step; saving again works the DSR's
 * starting figures out again.
 */
function HpclInspectionForm({ dealerId, entry }: { dealerId: string; entry: HpclInspectionEntry }) {
  const toast = useToast();
  const save = useSaveHpclInspection(dealerId);
  const [date, setDate] = React.useState(entry.date ?? '');
  const [time, setTime] = React.useState(entry.time ?? '');
  const typed = !!entry.date && !!entry.time;

  const onSave = () => {
    save.mutate(
      { date, time },
      {
        onSuccess: () => toast.success('Saved. The setup carries on from the inspection within a minute.'),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not save. Please try again.'),
      },
    );
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium text-text">Last inspection, from the owner&rsquo;s report</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Type the date and time the officer wrote on the report. The DSR&rsquo;s starting figures are read from
          HPCL CRIS at that moment.
          {typed
            ? ` Saved as ${entry.date} at ${entry.time}${entry.enteredBy ? ` by ${entry.enteredBy}` : ''}${
                entry.enteredAt ? `, ${formatDateTime(entry.enteredAt)}` : ''
              }.`
            : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="hpcl-inspection-date" required>
            Date
          </Label>
          <Input
            id="hpcl-inspection-date"
            type="date"
            value={date}
            max={istToday()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="hpcl-inspection-time" required>
            Time
          </Label>
          <Input id="hpcl-inspection-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Button onClick={onSave} loading={save.isPending} disabled={!date || !time}>
          {typed ? 'Save again' : 'Save'}
        </Button>
      </div>
    </div>
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
          data?.setup ? 'Trying again. The step begins within a minute.' : 'Setting up the services. The first step begins within a minute.',
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
  const hpcl = data.company === 'hpcl';
  const attachedCount = services.filter((s) => s.attached).length;
  const status = setup ? STATUS[setup.status] : null;
  const started = !!data.servicesStartedAt;
  // Steps are folded away: the services above say where things stand, and a step that
  // needs a person is shown there too. "Show every step" is for the curious.
  const stepsOpen = showSteps;
  const canPress = !cannotStart && (!setup || setup.status === 'blocked');

  return (
    <Card>
      <CardHeader
        padding="comfortable"
        action={status ? <Badge intent={status.intent}>{status.label}</Badge> : undefined}
      >
        <div>
          <CardTitle>{setup ? 'Getting the services ready' : 'Standard package'}</CardTitle>
          <CardSubtitle>
            {hpcl
              ? "HPCL's services, with the DSR's starting figures read from HPCL CRIS at the inspection on the owner's report."
              : setup
                ? `The ${services.length} services every Indian Oil outlet gets. Most run from the start; four need figures worked out from the portals first.`
                : `The ${services.length} services every Indian Oil outlet gets, with their starting figures worked out from the portals.`}
          </CardSubtitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!setup ? (
          <div className="space-y-3">
            {hpcl ? (
              <p className="text-sm text-text">
                One press checks the HPCL login and asks the owner, in the chat, for a photo of
                their last inspection report. Nothing is attached until you type the
                inspection&rsquo;s date and time from it here. Then it attaches HPCL&rsquo;s
                services, works the DSR&rsquo;s starting figures out from HPCL CRIS and lists them
                for you to compare with the report. Nothing reaches the dealer until you press Start
                services, and an HPCL pump&rsquo;s watch lasts until the team ends it.
              </p>
            ) : (
              <p className="text-sm text-text">
                This starts by itself once both logins work. It attaches all {services.length} on
                the same schedules as every other outlet, and the services start straight away; it
                then finds the pump&rsquo;s day close and reads every tanker invoice since the last
                inspection for the DSR, and those four come on as each is ready. Anything that
                cannot finish is retried by itself and only comes to you when a person is needed.
              </p>
            )}
            <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {services.map((s) => (
                <li key={s.serviceId} className="flex items-center gap-2">
                  {s.attached ? (
                    <CheckCircle2
                      width={14}
                      height={14}
                      strokeWidth={1.75}
                      className="shrink-0 text-success"
                    />
                  ) : (
                    <Circle
                      width={14}
                      height={14}
                      strokeWidth={1.75}
                      className="shrink-0 text-text-muted"
                    />
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
                {attachedCount} of {services.length} are attached already. Those are left exactly as
                they are.
              </p>
            ) : null}
          </div>
        ) : null}

        {setup ? (
          <p className="text-xs text-text-muted">
            {setup.startedBy.kind === 'auto'
              ? hpcl
                ? 'Started by itself once the HPCL login worked'
                : 'Started by itself once both logins worked'
              : `Started by ${setup.startedBy.name ?? 'an admin'}`}
            , {formatDateTime(setup.startedAt)}.
            {started ? ` Services running since ${istStamp(data.servicesStartedAt)}.` : ''}
          </p>
        ) : null}

        {hpcl ? (
          <HowThisWorks surface="admin-service-package-hpcl" label="Setting up an HPCL pump" />
        ) : null}

        {hpcl && setup && data.inspection?.canEnter ? (
          <HpclInspectionForm dealerId={dealer.id} entry={data.inspection} />
        ) : null}

        {setup && !hpcl ? <PackageProgress dealerId={dealer.id} state={data} /> : null}

        {setup && !started && setup.held.length > 0 ? (
          <p className="text-xs text-text-muted">
            {setup.held.map((id) => serviceLabel(id).en).join(', ')} act for the dealer, so they
            switch on when the services start
            {data.autoStart === 'soon' ? ', by themselves within a minute' : ''}.
          </p>
        ) : null}

        {setup && setup.found.length > 0 ? (
          <KeyValueList
            items={setup.found.map((f) => ({ key: f.label, label: f.label, value: f.value }))}
            labelWidth="200px"
          />
        ) : null}

        {setup ? (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setShowSteps((v) => !v)}>
              {showSteps ? 'Hide the steps' : 'Show every step'}
            </Button>
            {stepsOpen || hpcl ? (
              <ol className="divide-y divide-border">
                {setup.steps.map((step) => (
                  <Step key={step.key} step={step} />
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}

        {cannotStart && !setup ? <p className="text-sm text-text-muted">{cannotStart}</p> : null}

        {canPress && (!setup || hpcl) ? (
          <Button
            onClick={onStart}
            loading={start.isPending}
            leftIcon={<PackageCheck width={16} height={16} strokeWidth={1.75} />}
          >
            {!setup
              ? hpcl
                ? "Set up HPCL's services"
                : `Set up all ${services.length} services now`
              : 'Try again'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
