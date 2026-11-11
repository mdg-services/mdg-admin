import {
  AlertCircle,
  ClipboardCheck,
  DownloadCloud,
  FlaskConical,
  MessageSquarePlus,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';
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
  useMockDrillAction,
  useMockDrillAdminView,
  useMockDrillConfig,
  useMockDrillLive,
} from '@/hooks/api/useMockDrill';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatYmd } from '@/lib/format';
import { dealerCodeLabel, type MockDrillAdminView } from '@dk/shared';
import type { MockDrillAdminAction } from '@dk/shared/schemas';

import { availableActions, isRunLive, statusLine } from './mockDrill/format';
import { HistoryCard, PortalCard, RunsCard, SetupCard, SwitchesCard } from './mockDrill/Panels';
import { PhotoStrip } from './mockDrill/Photos';
import { ReviewModal } from './mockDrill/ReviewModal';
import type { DealerVaultPaneProps } from './types';

/** A run that started longer ago than this and still says RUNNING is a dead record, not work in flight. */
const RUN_LIVE_WINDOW_MS = 30 * 60 * 1000;

type Confirming = 'ask_owner' | 'test_fill' | 'submit' | 'retry' | 'cancel';

/** What each pressed button says before it does anything outward, and what it says afterwards. */
const CONFIRM_WORDS: Record<
  Confirming,
  { title: string; body: React.ReactNode; confirm: string; danger?: boolean; done: string }
> = {
  ask_owner: {
    title: 'Ask the owner about a mock drill?',
    body: 'This puts the Mock Drill box in the owners’ chat (and the manager’s). They see it as a new message and decide whether a drill has been done.',
    confirm: 'Ask owner',
    done: 'The box was posted to the owner’s chat.',
  },
  test_fill: {
    title: 'Run a test fill?',
    body: 'This signs in to IndianOil’s site, fills the mock drill form, and reads it back to check every box. It does NOT submit anything. It takes about a minute.',
    confirm: 'Run test fill',
    done: 'Test fill started. It fills the form and stops before Submit.',
  },
  submit: {
    title: 'File this report on IndianOil’s site?',
    body: 'This signs in to IndianOil’s site and submits the approved report under the outlet’s name. The Field Officer there approves it next. It cannot be taken back from here.',
    confirm: 'File now',
    done: 'Filing started. This section updates when IndianOil has answered.',
  },
  retry: {
    title: 'Try filing again?',
    body: 'This signs in to IndianOil’s site again and submits the report under the outlet’s name. If the portal already holds a report waiting for approval, it will refuse and say so.',
    confirm: 'Retry',
    done: 'Trying again. This section updates when IndianOil has answered.',
  },
  cancel: {
    title: 'Drop this drill?',
    body: 'The drill that is open for this outlet is closed. If the owner wants to file it, they start again from the beginning. Nothing is sent to IndianOil.',
    confirm: 'Drop it',
    danger: true,
    done: 'The drill was dropped.',
  },
};

/**
 * A dealer's Mock Drill (ADR 0034): the one place per outlet to see and drive it.
 *
 * The owner is asked which emergency was practised and for two photos; the system
 * writes the rest of the report. The first time (or when the owner says it was a
 * new kind of drill) an admin checks the photos against the details here, and
 * only then is it filed on IndianOil's site for the Field Officer to approve.
 *
 * It draws the same live view the owner's box does. Every call returns that view
 * and replaces the cached one, and the server's `mockDrill:changed` re-reads it.
 */
export function DealerMockDrillPane({ dealer }: DealerVaultPaneProps) {
  const toast = useToast();
  const viewQ = useMockDrillAdminView(dealer.id);
  useMockDrillLive(dealer.id);

  const action = useMockDrillAction(dealer.id);
  const config = useMockDrillConfig(dealer.id);
  const [confirming, setConfirming] = React.useState<Confirming | null>(null);
  const [reviewId, setReviewId] = React.useState<string | null>(null);

  function run(kind: Confirming) {
    const body: MockDrillAdminAction = { action: kind };
    action.mutate(body, {
      onSuccess: () => {
        setConfirming(null);
        toast.success(CONFIRM_WORDS[kind].done);
      },
      onError: (err) => {
        setConfirming(null);
        toast.error(
          err instanceof ApiError ? err.message : 'That did not go through. Please try again.',
        );
      },
    });
  }

  function check() {
    action.mutate(
      { action: 'check' },
      {
        onSuccess: () =>
          toast.success(
            'Reading the portal. It takes about a minute and this section will refresh.',
          ),
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.message : 'Could not start the check. Please try again.',
          ),
      },
    );
  }

  function changeSwitch(patch: { autoSubmit?: boolean; reviewReused?: boolean }) {
    config.mutate(patch, {
      onSuccess: () => toast.success('Saved.'),
      onError: (err) =>
        toast.error(
          err instanceof ApiError ? err.message : 'Could not save that setting. It was put back.',
        ),
    });
  }

  if (viewQ.isLoading) {
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

  if (viewQ.isError || !viewQ.data) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load the mock drill"
        description={viewQ.error instanceof ApiError ? viewQ.error.message : 'Please try again.'}
        cta={
          <Button variant="secondary" size="sm" onClick={() => void viewQ.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const view: MockDrillAdminView = viewQ.data;
  const status = statusLine(view);
  const can = availableActions(view);
  const now = Date.now();
  const liveRun = view.runs.some(
    (r) => isRunLive(r) && now - new Date(r.startedAt).getTime() < RUN_LIVE_WINDOW_MS,
  );
  // One browser run at a time per outlet: while one is starting or running,
  // nothing else may start, so a double tap cannot queue two portal logins.
  const runBusy = action.isPending || liveRun;
  const reviewing = view.toReview.find((s) => s.id === reviewId) ?? null;
  const waitingForMe = view.toReview.length > 0;
  const pendingKind = action.isPending && action.variables ? action.variables.action : null;
  const asking = confirming ? CONFIRM_WORDS[confirming] : null;

  return (
    <div className="grid gap-3 md:gap-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-text">Mock drill</h2>
        <p className="mt-0.5 text-sm text-text-muted">
          Outlet {dealerCodeLabel(dealer.code)} · Portal last read{' '}
          {view.portal.checkedAt ? formatDateTime(view.portal.checkedAt) : 'never'}
        </p>
      </div>

      {!view.active ? (
        <Callout>
          The service is switched off for this outlet, so nothing is filed by itself. Switch it on
          from the Services tab.
        </Callout>
      ) : null}

      <Card
        className={status.intent === 'danger' ? 'border-danger/40 bg-danger-soft/40' : undefined}
      >
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge intent={status.intent}>{status.label}</Badge>
            {liveRun ? <Badge intent="info">A run is working</Badge> : null}
          </div>
          <p className="break-words text-sm text-text-muted">{status.detail}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={runBusy || confirming !== null}
              loading={pendingKind === 'ask_owner'}
              leftIcon={<MessageSquarePlus width={14} height={14} strokeWidth={1.75} />}
              onClick={() => setConfirming('ask_owner')}
            >
              Ask owner
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={runBusy}
              loading={pendingKind === 'check' || (liveRun && view.runs[0]?.action === 'check')}
              leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
              onClick={check}
            >
              Check now
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={runBusy}
              loading={pendingKind === 'test_fill'}
              leftIcon={<FlaskConical width={14} height={14} strokeWidth={1.75} />}
              onClick={() => setConfirming('test_fill')}
            >
              Test fill
            </Button>
            {can.fileNow ? (
              <Button
                size="sm"
                disabled={runBusy}
                loading={pendingKind === 'submit'}
                leftIcon={<Send width={14} height={14} strokeWidth={1.75} />}
                onClick={() => setConfirming('submit')}
              >
                File now
              </Button>
            ) : null}
            {can.retry ? (
              <Button
                size="sm"
                disabled={runBusy}
                loading={pendingKind === 'retry'}
                leftIcon={<RotateCcw width={14} height={14} strokeWidth={1.75} />}
                onClick={() => setConfirming('retry')}
              >
                Retry
              </Button>
            ) : null}
            {can.cancel ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={action.isPending}
                leftIcon={<XCircle width={14} height={14} strokeWidth={1.75} />}
                onClick={() => setConfirming('cancel')}
              >
                Cancel drill
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-text-subtle">
            Test fill fills IndianOil’s form and reads it back. It does not submit.
          </p>
        </CardContent>
      </Card>

      {waitingForMe
        ? view.toReview.map((s) => (
            <Card key={s.id} className="border-warning bg-warning-soft/40">
              <CardContent className="grid gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-base font-semibold text-text">
                      <ClipboardCheck
                        width={18}
                        height={18}
                        strokeWidth={1.75}
                        className="shrink-0"
                        aria-hidden
                      />
                      Waiting for you to check
                    </p>
                    <p className="mt-0.5 break-words text-sm text-text-muted">
                      {s.dependent?.scenarioLabel ?? 'A mock drill'}
                      {s.confirmedDay
                        ? ` · done on ${formatYmd(s.confirmedDay, { weekday: true })}`
                        : ''}
                      {' · sent '}
                      {formatDateTime(s.createdAt)}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setReviewId(s.id)}>
                    Check it
                  </Button>
                </div>
                {s.dependent ? <PhotoStrip photos={s.dependent.photos} /> : null}
              </CardContent>
            </Card>
          ))
        : null}

      <PortalCard portal={view.portal} />
      <SetupCard setup={view.setup} />
      <SwitchesCard
        autoSubmit={view.autoSubmit}
        reviewReused={view.reviewReused}
        disabled={config.isPending}
        onChange={changeSwitch}
      />
      <HistoryCard history={view.history} />
      <RunsCard runs={view.runs} />

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

      {reviewing ? (
        <ReviewModal
          open
          onClose={() => setReviewId(null)}
          dealerId={dealer.id}
          view={view}
          submission={reviewing}
        />
      ) : null}
    </div>
  );
}
