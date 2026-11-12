import { AlertCircle, DownloadCloud, ListChecks, Plug } from 'lucide-react';
import * as React from 'react';

import {
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  useDeclarationsAction,
  useDeclarationsAdminView,
  useDeclarationsConfig,
  useDeclarationsLive,
} from '@/hooks/api/useDeclarations';
import { ApiError } from '@/lib/api';
import { formatDateTime, istTodayYmd } from '@/lib/format';
import { dealerCodeLabel, type DeclarationsAdminView } from '@dk/shared';
import type { DeclarationsAdminAction, DeclarationsConfigBody } from '@dk/shared/schemas';

import {
  actionKey,
  actionWords,
  lastReadAt,
  liveRunOf,
  neverUsed,
  orderedStatuses,
  paneRunBusy,
  summaryLine,
  switchOnWords,
  switchTurnedOn,
  type PaneControls,
} from './declarations/format';
import { KindCard } from './declarations/KindCard';
import { FilingsCard, RunsCard } from './declarations/Panels';
import { SwitchesCard } from './declarations/SwitchesCard';
import { WashroomPanel } from './declarations/WashroomPanel';
import type { DealerVaultPaneProps } from './types';

/**
 * A dealer's Dealer Declarations (ADR 0037): the one place per outlet to see and
 * drive the four declarations IndianOil's portal wants kept up to date.
 *
 *  - Safety declaration, every day: MDG ticks every box and files it.
 *  - Washroom cleanliness, every few days: the owner is asked for two photos in
 *    the chat, then MDG files it.
 *  - MDG and Customer Service Standard, once in 7 to 8 years: filled only if empty.
 *  - Branded Fuels, once per outlet: MDG NEVER fills it. If it is empty it is a
 *    task for an admin, drawn first and in the alert colour here.
 *
 * It draws the same live view the owner's box does. Every call returns that view
 * and replaces the cached one, and the server's `declarations:changed` re-reads it.
 */
export function DealerDeclarationsPane({ dealer }: DealerVaultPaneProps) {
  const toast = useToast();
  const viewQ = useDeclarationsAdminView(dealer.id);
  useDeclarationsLive(dealer.id);

  const action = useDeclarationsAction(dealer.id);
  const config = useDeclarationsConfig(dealer.id);
  const [confirming, setConfirming] = React.useState<DeclarationsAdminAction | null>(null);
  // A switch that lets MDG file by itself asks first: the change waits here until it is confirmed.
  const [confirmingSwitch, setConfirmingSwitch] = React.useState<DeclarationsConfigBody | null>(
    null,
  );

  // "A run is working" is measured against the clock, so draw again now and then even when
  // nothing new arrives: a run that has been silent for half an hour is not working.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  function run(a: DeclarationsAdminAction) {
    const words = actionWords(a);
    action.mutate(a, {
      onSuccess: () => {
        setConfirming(null);
        toast.success(words.done);
      },
      onError: (err) => {
        setConfirming(null);
        toast.error(
          err instanceof ApiError ? err.message : 'That did not go through. Please try again.',
        );
      },
    });
  }

  /** Anything that sends something outward asks first; reads and undos act at once. */
  function press(a: DeclarationsAdminAction) {
    if (actionWords(a).confirm) setConfirming(a);
    else run(a);
  }

  function saveSetting(patch: DeclarationsConfigBody) {
    config.mutate(patch, {
      onSuccess: () => {
        setConfirmingSwitch(null);
        toast.success('Saved.');
      },
      onError: (err) => {
        setConfirmingSwitch(null);
        toast.error(
          err instanceof ApiError ? err.message : 'Could not save that setting. It was put back.',
        );
      },
    });
  }

  /** Turning filing on asks first; turning it off, and every other setting, is one tap. */
  function changeSetting(patch: DeclarationsConfigBody) {
    if (switchTurnedOn(patch)) setConfirmingSwitch(patch);
    else saveSetting(patch);
  }

  // No view yet and no error to show: still loading (or waiting for a connection).
  if (viewQ.isLoading || (!viewQ.data && !viewQ.isError)) {
    return (
      <div className="grid gap-3 md:gap-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-28 w-full" />
        <Card>
          <CardContent className="grid gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </CardContent>
        </Card>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // A failed re-read keeps the last good view (react-query v5): only an outlet that never
  // loaded gets the error screen. A later failure is a line above the cards.
  if (viewQ.isError && !viewQ.data) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load the declarations"
        description={viewQ.error instanceof ApiError ? viewQ.error.message : 'Please try again.'}
        cta={
          <Button variant="secondary" size="sm" onClick={() => void viewQ.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!viewQ.data) return null; // unreachable: an error with no view was drawn above
  const view: DeclarationsAdminView = viewQ.data;
  const summary = summaryLine(view);
  const lastRead = lastReadAt(view);
  const now = Date.now();
  const liveRun = liveRunOf(view.runs, now);
  // One browser run at a time per outlet: while one is starting or running,
  // nothing else may start, so a double tap cannot queue two portal logins. Only a run
  // listed as working counts, never the washroom cycle's own "filing" word (the run
  // that was filing it may be long dead; the cards say so and the buttons stay usable).
  const runBusy = paneRunBusy(action.isPending, view.runs, now);
  const pendingKey = action.isPending && action.variables ? actionKey(action.variables) : null;
  const controls: PaneControls = {
    runBusy,
    requestBusy: action.isPending,
    pendingKey,
    checking: pendingKey === 'check' || liveRun?.action === 'check',
    today: istTodayYmd(),
    now,
    onAct: press,
  };
  const asking = confirming ? actionWords(confirming).confirm : null;
  const switchKey = confirmingSwitch ? switchTurnedOn(confirmingSwitch) : null;
  const switchWords = switchKey ? switchOnWords(switchKey) : null;

  const heading = (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold text-text">Declarations</h2>
      <p className="mt-0.5 text-sm text-text-muted">
        Outlet {dealerCodeLabel(dealer.code)} · Pages last read{' '}
        {lastRead ? formatDateTime(lastRead) : 'never'}
      </p>
    </div>
  );

  if (neverUsed(view)) {
    return (
      <div className="grid gap-3 md:gap-4">
        {heading}
        <Card>
          <CardContent>
            <EmptyState
              icon={<Plug width={28} height={28} strokeWidth={1.75} />}
              title={`Declarations are not switched on for ${dealerCodeLabel(dealer.code)}`}
              description="Attach the IndianOil declarations from the Services tab and this pane fills in."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:gap-4">
      {heading}

      {viewQ.isError ? (
        <Callout onRetry={() => void viewQ.refetch()}>
          Could not refresh just now. What is shown is the last reading.
        </Callout>
      ) : null}

      {!view.active ? (
        <Callout>
          Declarations are switched off for this outlet, so nothing is read or filed by itself.
          Switch them on from the Services tab.
        </Callout>
      ) : null}

      <Card
        className={
          summary.intent === 'danger'
            ? 'border-danger/40 bg-danger-soft/40'
            : summary.intent === 'warning'
              ? 'border-warning bg-warning-soft/40'
              : undefined
        }
      >
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge intent={summary.intent}>{summary.label}</Badge>
            {liveRun && !action.isPending ? <Badge intent="info">A run is working</Badge> : null}
          </div>
          <p className="break-words text-sm text-text-muted">{summary.detail}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={runBusy || !view.active}
              loading={controls.checking}
              leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
              onClick={() => press({ action: 'check' })}
            >
              Check now
            </Button>
            <Button
              size="sm"
              disabled={runBusy || !view.active}
              loading={pendingKey === 'sweep'}
              leftIcon={<ListChecks width={14} height={14} strokeWidth={1.75} />}
              onClick={() => press({ action: 'sweep' })}
            >
              Run today’s round
            </Button>
          </div>
          <p className="text-xs text-text-subtle">
            Check now only reads the four pages on IndianOil’s portal. Run today’s round also files
            what is due.
            {liveRun ? ' The buttons come back when the run that is working has ended.' : ''}
          </p>
        </CardContent>
      </Card>

      {orderedStatuses(view.statuses).map((status) => (
        <KindCard key={status.kind} status={status} view={view} controls={controls}>
          {status.kind === 'washroom' ? <WashroomPanel view={view} controls={controls} /> : null}
        </KindCard>
      ))}

      <FilingsCard history={view.history} />
      <SwitchesCard config={view.config} disabled={config.isPending} onChange={changeSetting} />
      <RunsCard runs={view.runs} />

      <ConfirmDialog
        open={confirmingSwitch !== null}
        title={switchWords?.title ?? ''}
        description={switchWords?.body}
        confirmLabel={switchWords?.confirm}
        loading={config.isPending}
        onCancel={() => setConfirmingSwitch(null)}
        onConfirm={() => {
          if (confirmingSwitch) saveSetting(confirmingSwitch);
        }}
      />

      <ConfirmDialog
        open={confirming !== null}
        title={asking?.title ?? ''}
        description={asking?.body}
        confirmLabel={asking?.confirm}
        confirmVariant={asking?.danger ? 'danger' : 'primary'}
        loading={action.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) run(confirming);
        }}
      />
    </div>
  );
}
