import { RefreshCw } from 'lucide-react';
import * as React from 'react';

import {
  ActionRow,
  Button,
  Card,
  CardContent,
  CardHeader,
  ConfirmDialog,
  Dialog,
  DownloadButton,
  EmptyState,
  FieldError,
  filenameFromUrl,
  Label,
  Textarea,
  useToast,
} from '@/components/ui';
import { useRunNow } from '@/hooks/api/useDealerServices';
import {
  useApproveLoadPlan,
  useDismissLoadPlan,
  useDrawLoadPlanCard,
  useLoadPlanCard,
} from '@/hooks/api/useLoadPlanner';
import { ApiError } from '@/lib/api';
import { dealerCodeLabel, type Dealer, type LoadPlan } from '@dk/shared';

import { approveConfirmDescription, canActOnPlan, cannotActReason, dismissReasonProblem } from './format';
import { useLoadPlannerRunWatcher } from './useLoadPlannerRunWatcher';

/**
 * The dealer's card and what an admin does with it: draw it, send it, dismiss
 * the plan with a reason, or re-run the planner on demand.
 *
 * Approve and Dismiss share one gate — {@link canActOnPlan} — and the reason it
 * is disabled is printed under the buttons rather than left for the admin to
 * guess: a plan already sent, dismissed or replaced has nothing left to decide.
 */
export function CardActions({
  dealer,
  plan,
  dealerServiceId,
}: {
  dealer: Dealer;
  plan: LoadPlan;
  dealerServiceId: string | null;
}) {
  const toast = useToast();
  const cardQ = useLoadPlanCard(plan.id);
  const draw = useDrawLoadPlanCard(plan.id);
  const approve = useApproveLoadPlan(dealer.id);
  const dismiss = useDismissLoadPlan(dealer.id);
  const runNow = useRunNow(dealer.id);
  const runWatch = useLoadPlannerRunWatcher(dealer.id);

  const [approveOpen, setApproveOpen] = React.useState(false);
  const [dismissOpen, setDismissOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [reasonTouched, setReasonTouched] = React.useState(false);

  const canAct = canActOnPlan(plan);
  const disabledReason = cannotActReason(plan);
  const label = dealerCodeLabel(dealer.code);
  const reasonProblem = reasonTouched ? dismissReasonProblem(reason) : null;
  const running = runNow.isPending || runWatch.busy;

  function closeDismiss() {
    setDismissOpen(false);
    setReason('');
    setReasonTouched(false);
  }

  function onDraw() {
    draw.mutate(undefined, {
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not draw the card'),
    });
  }

  function onApprove() {
    approve.mutate(plan.id, {
      onSuccess: (res) => {
        setApproveOpen(false);
        toast.success(res.alreadyShared ? 'Already sent — nothing new to send.' : `Sent to ${label}'s chat.`);
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not send the plan'),
    });
  }

  function onDismiss() {
    const problem = dismissReasonProblem(reason);
    setReasonTouched(true);
    if (problem) return;
    dismiss.mutate(
      { planId: plan.id, reason: reason.trim() },
      {
        onSuccess: () => {
          closeDismiss();
          toast.success('Dismissed — nothing was sent to the dealer.');
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not dismiss the plan'),
      },
    );
  }

  function onRunNow() {
    if (!dealerServiceId) return;
    runNow.mutate(
      { dsId: dealerServiceId },
      {
        onSuccess: (res) => {
          runWatch.watch(res.runId);
          toast.success('Running — this takes a few seconds. The pane refreshes when it lands.');
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not start the run'),
      },
    );
  }

  return (
    <Card>
      <CardHeader
        action={
          <Button variant="secondary" size="sm" loading={running} disabled={!dealerServiceId} onClick={onRunNow}>
            Run now
          </Button>
        }
      >
        <p className="text-base font-semibold text-text">Send to the dealer</p>
        <p className="text-sm text-text-muted">The card the dealer will see, and what to do with this plan.</p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {cardQ.isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-text-muted">Loading the card…</div>
        ) : cardQ.data ? (
          <img
            src={cardQ.data.url}
            alt={`Load plan card for ${label}`}
            className="w-full max-w-sm rounded-md border border-border bg-surface-2"
          />
        ) : (
          <EmptyState title="No card drawn yet" description="Draw the card the dealer will see before approving." />
        )}

        <ActionRow below="wrap" align="start">
          <Button
            variant="secondary"
            size="sm"
            loading={draw.isPending}
            leftIcon={cardQ.data ? <RefreshCw width={14} height={14} strokeWidth={1.75} /> : undefined}
            onClick={onDraw}
          >
            {cardQ.data ? 'Reload image' : 'Draw card'}
          </Button>
          {cardQ.data ? (
            <DownloadButton
              url={cardQ.data.downloadUrl}
              filename={filenameFromUrl(cardQ.data.downloadUrl, `load-plan-${dealer.code}.png`)}
              contentType="image/png"
              kind="image"
              size="sm"
            />
          ) : null}
        </ActionRow>

        <ActionRow below="stack" align="end" className="border-t border-border pt-3">
          <Button variant="ghost" disabled={!canAct} onClick={() => setDismissOpen(true)}>
            Dismiss
          </Button>
          <Button disabled={!canAct || !cardQ.data} onClick={() => setApproveOpen(true)}>
            Approve and send to {label}
          </Button>
        </ActionRow>
        {disabledReason ? (
          <p className="text-xs text-text-subtle">{disabledReason}</p>
        ) : !cardQ.data ? (
          <p className="text-xs text-text-subtle">Draw the card before it can be sent.</p>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={approveOpen}
        onCancel={() => setApproveOpen(false)}
        onConfirm={onApprove}
        title="Send this plan?"
        description={approveConfirmDescription(label)}
        confirmLabel="Send"
        loading={approve.isPending}
      />

      <Dialog
        open={dismissOpen}
        onClose={dismiss.isPending ? () => {} : closeDismiss}
        title="Dismiss this plan"
        description="Say why, in your own words. Nothing is sent to the dealer."
        footer={
          <>
            <Button variant="secondary" onClick={closeDismiss} disabled={dismiss.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={dismiss.isPending} onClick={onDismiss}>
              Dismiss
            </Button>
          </>
        }
      >
        <Label htmlFor="load-plan-dismiss-reason" required>
          Reason
        </Label>
        <Textarea
          id="load-plan-dismiss-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Dealer asked to skip this delivery — tanker already booked directly…"
          rows={3}
          invalid={!!reasonProblem}
        />
        <FieldError message={reasonProblem ?? undefined} />
      </Dialog>
    </Card>
  );
}
