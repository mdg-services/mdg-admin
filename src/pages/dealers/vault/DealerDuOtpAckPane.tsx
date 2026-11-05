import {
  AlertCircle,
  DownloadCloud,
  MessageSquarePlus,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import * as React from 'react';

import {
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
  useAskDuOtp,
  useCheckDuOtp,
  useDuOtpAdminView,
  useDuOtpLive,
  useSubmitDuOtp,
} from '@/hooks/api/useDuOtp';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { dealerCodeLabel, type DuOtpAdminView, type DuOtpGroupView } from '@dk/shared';

import { GroupCard } from './duOtp/GroupCard';
import { CertificateCard, RecentCard, RunsCard } from './duOtp/Panels';
import { useDuOtpRunWatcher } from './duOtp/useDuOtpRunWatcher';
import type { DealerVaultPaneProps } from './types';

/**
 * A dealer's DU OTP acknowledgements (ADR 0033): the one place per outlet to see
 * and drive all of it.
 *
 * When a dispensing unit is opened with an OTP, IndianOil's portal lists the
 * event and the dealer must acknowledge it, or supply to the outlet is blocked
 * ("Pending OTP"). MDG reads the list on the water-ingress login, tells the
 * owners in chat, collects the reasons and papers step by step, and then fills the
 * portal's row. This pane shows each open unit with everything gathered, lets an
 * admin answer any step the owner has not, and files it.
 *
 * It draws the same live view the owner's box does. Every answer returns that
 * view and replaces the cached one, and the server's `duOtp:changed` re-reads it,
 * so nothing here is a snapshot of when the page was opened.
 */
export function DealerDuOtpAckPane({ dealer }: DealerVaultPaneProps) {
  const toast = useToast();
  const viewQ = useDuOtpAdminView(dealer.id);
  useDuOtpLive(dealer.id);

  const check = useCheckDuOtp(dealer.id);
  const ask = useAskDuOtp(dealer.id);
  const submit = useSubmitDuOtp(dealer.id);
  // Both `check` and `submit` answer a run id and then drive IndianOil's portal,
  // so the pane watches the run and says what happened when it ends.
  const runWatch = useDuOtpRunWatcher(dealer.id);
  const [confirmingAsk, setConfirmingAsk] = React.useState(false);

  // One browser run at a time per outlet: while ours is starting or being watched
  // nothing else may start, so a double tap cannot queue two portal logins.
  const runBusy = check.isPending || submit.isPending || runWatch.busy;
  const checking = check.isPending || runWatch.kind === 'check';

  function runCheck() {
    check.mutate(undefined, {
      onSuccess: (res) => {
        runWatch.watch(res.runId, 'check');
        toast.success('Reading the portal list. It takes about a minute and this section will refresh.');
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : 'Could not start the check'),
    });
  }

  function runGroup(group: DuOtpGroupView, dryRun: boolean) {
    submit.mutate(
      { group: group.key, dryRun },
      {
        onSuccess: (res) => {
          runWatch.watch(res.runId, dryRun ? 'testFill' : 'submit', group.key);
          toast.success(
            dryRun
              ? 'Test fill started. It fills the portal row and stops before Submit.'
              : 'Filing started. This section updates when IndianOil has answered.',
          );
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError
              ? err.message
              : dryRun
                ? 'Could not start the test fill'
                : 'Could not start the filing',
          ),
      },
    );
  }

  function askOwner() {
    ask.mutate(undefined, {
      onSuccess: ({ posted }) => {
        setConfirmingAsk(false);
        if (posted > 0) {
          toast.success(
            posted === 1 ? 'Posted the box to the owner’s chat.' : `Posted the box to ${posted} owner chats.`,
          );
        } else {
          toast.info('Nothing was posted. No owner chat was reached.');
        }
      },
      onError: (err) => {
        setConfirmingAsk(false);
        toast.error(err instanceof ApiError ? err.message : 'Could not post the box');
      },
    });
  }

  /** Which of a group's two buttons started the run in flight, so only that one spins. */
  function activeKindFor(group: DuOtpGroupView): 'submit' | 'testFill' | null {
    if (submit.isPending && submit.variables?.group === group.key) {
      return submit.variables.dryRun ? 'testFill' : 'submit';
    }
    if (runWatch.group === group.key && (runWatch.kind === 'submit' || runWatch.kind === 'testFill')) {
      return runWatch.kind;
    }
    return null;
  }

  if (viewQ.isLoading) {
    return (
      <div className="grid gap-3 md:gap-4">
        <Skeleton className="h-12 w-full" />
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

  if (viewQ.isError) {
    return (
      <EmptyState
        icon={<AlertCircle width={28} height={28} strokeWidth={1.75} />}
        title="Could not load the DU OTP acknowledgements"
        description={viewQ.error instanceof ApiError ? viewQ.error.message : 'Please try again.'}
        cta={
          <Button variant="secondary" size="sm" onClick={() => void viewQ.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const view = viewQ.data!;
  const open = view.groups.length;

  const checkButton = (
    <Button
      variant="secondary"
      size="sm"
      loading={checking}
      disabled={runBusy}
      leftIcon={<DownloadCloud width={14} height={14} strokeWidth={1.75} />}
      onClick={runCheck}
    >
      Check now
    </Button>
  );

  return (
    <div className="grid gap-3 md:gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text">DU OTP acknowledgement</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Outlet {dealerCodeLabel(dealer.code)} · Last read{' '}
            {view.lastCheckedAt ? formatDateTime(view.lastCheckedAt) : 'never'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {checkButton}
          <Button
            variant="secondary"
            size="sm"
            disabled={open === 0 || ask.isPending}
            leftIcon={<MessageSquarePlus width={14} height={14} strokeWidth={1.75} />}
            onClick={() => setConfirmingAsk(true)}
          >
            Ask the owner
          </Button>
        </div>
      </div>

      <SupplyLine blocked={view.supplyBlockedForOtp} />

      {view.lastCheckFailure ? (
        <Card className="border-danger/40 bg-danger-soft/40">
          <CardContent className="flex items-start gap-3">
            <AlertCircle width={18} height={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">
                The last read of IndianOil’s list failed
              </p>
              <p className="break-words text-sm text-text-muted">{view.lastCheckFailure}</p>
              <p className="mt-0.5 text-xs text-text-subtle">
                {view.lastCheckedAt
                  ? `What is shown below is from the last good read, ${formatDateTime(view.lastCheckedAt)}.`
                  : 'The list has never been read successfully for this outlet.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!view.active ? (
        <Callout>
          The service is switched off for this outlet, so nothing is read or filed by itself. Switch it on
          from the Services tab.
        </Callout>
      ) : null}

      <p className="text-xs text-text-subtle">
        {view.autoSubmit
          ? 'Filing is automatic: an event is filed the moment the owner presses Submit.'
          : 'Filing is manual: nothing is filed until someone presses Submit to IndianOil here.'}
      </p>

      {open === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<ShieldCheck width={28} height={28} strokeWidth={1.75} />}
              title="Nothing is waiting on IndianOil"
              description={
                view.lastCheckedAt
                  ? 'The portal’s list had no open OTP event at the last read. A new one is picked up on the next water-ingress login, or when you check now.'
                  : 'The portal’s list has not been read for this outlet yet.'
              }
              cta={checkButton}
            />
          </CardContent>
        </Card>
      ) : (
        view.groups.map((group) => (
          <GroupCard
            key={group.key}
            dealerId={dealer.id}
            group={group}
            view={view}
            runBusy={runBusy}
            activeKind={activeKindFor(group)}
            onRun={runGroup}
          />
        ))
      )}

      <CertificateCard view={view} />
      <RecentCard recent={view.recent} />
      <RunsCard runs={view.runs} />

      <ConfirmDialog
        open={confirmingAsk}
        title="Post the box to the owner again?"
        description={
          <>
            This puts the step-by-step box in the owners’ chat once more, for the {open} unit
            {open === 1 ? '' : 's'} still open. The owners see it as a new message.
          </>
        }
        confirmLabel="Post it"
        loading={ask.isPending}
        onCancel={() => setConfirmingAsk(false)}
        onConfirm={askOwner}
      />
    </div>
  );
}

/**
 * Whether IndianOil is holding supply for a pending OTP — from the last RO Supply
 * Status read. Three states, never two: a red line when it is blocked, a quiet
 * line when it is not, and an honest "not known" when that read has not said.
 * Treating unknown as fine would make the pane calmer and is the one thing it
 * must not do.
 */
function SupplyLine({ blocked }: { blocked: DuOtpAdminView['supplyBlockedForOtp'] }) {
  if (blocked === true) {
    return (
      <Card className="border-danger/40 bg-danger-soft/40">
        <CardContent className="flex items-start gap-3">
          <XCircle width={20} height={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-base font-semibold text-text">IndianOil has blocked supply: Pending OTP</p>
            <p className="text-sm text-text-muted">
              This outlet cannot buy fuel until every event below is acknowledged on the portal.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <p className="text-sm text-text-muted">
      {blocked === false
        ? 'Supply is not blocked for a pending OTP, as of the last RO supply status read.'
        : 'Whether supply is blocked for a pending OTP is not known yet. It comes from the RO supply status read.'}
    </p>
  );
}
