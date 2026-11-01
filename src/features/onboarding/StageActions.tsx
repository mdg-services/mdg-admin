import * as React from 'react';

import { ActionRow, Button, ConfirmDialog, useToast } from '@/components/ui';
import { DealerReceivesBox } from '@/features/payments/DealerReceivesBox';
import { RecordPaymentDialog } from '@/features/payments/RecordPaymentDialog';
import { useResumeBilling } from '@/hooks/api/useBilling';
import { useChangeWatch, useCloseOutletSetup } from '@/hooks/api/useOnboarding';
import { cn } from '@/lib/cn';
import {
  closeBody,
  stageActions,
  watchBody,
  type DealerTabId,
  type MainActionId,
} from '@/lib/onboarding';
import { dealerCodeLabel, type OutletSetupAdmin } from '@dk/shared';

import { PauseBillingDialog, SendBillDialog } from './BillingDialogs';
import { CloseDialog } from './CloseDialog';
import { DoItForDealer } from './DoItForDealer';
import { LogCallDialog } from './LogCallDialog';
import { ExtendWatchDialog, StartServicesDialog } from './SetupDialogs';

/**
 * The buttons an outlet's onboarding offers at its current stage, and the forms
 * behind them. One component, used by the Onboarding page's rows and by the
 * Setup card on the dealer's Info tab, so the two can never offer different
 * things for the same outlet.
 *
 * WHICH buttons is `stageActions` (`lib/onboarding.ts`): the stage decides, and
 * every admin sees every button (owner's decision of 24 Oct). Under them,
 * "Do it for the dealer" (`DoItForDealer`) offers the dealer's own step for the
 * open stage.
 *
 * Only one form is open at a time. The forms mount only while open, so a page of
 * fifty rows holds no fifty dialogs.
 */
export function StageActions({
  outlet,
  layout = 'wrap',
  className,
  onGoToTab,
  compact = false,
  alsoShow = [],
  callFirst = false,
  withoutPrimary = false,
}: {
  outlet: OutletSetupAdmin;
  /**
   * `wrap` is a row of buttons that wraps, for a card. `stack` is one button
   * under another at the same width, for a narrow table column, where a wrapped
   * row of different widths looks like a ragged mistake.
   */
  layout?: 'wrap' | 'stack';
  className?: string;
  /**
   * On the dealer's own page (the Setup card): switch its tab, for the links to the
   * Team and Services tabs. Left out on the Onboarding page, where they are links.
   */
  onGoToTab?: (tab: DealerTabId) => void;
  /**
   * The Dealers page's Onboarding view: only the stage's primary button (plus
   * `alsoShow`) and Log call; Do it for the dealer only on a row that has no
   * primary button (the dealer's move). The rest stay on the outlet's Setup card
   * and the Onboarding page, so a list of twenty rows is not a wall of buttons.
   * The forms behind every button stay mounted the same way.
   */
  compact?: boolean;
  /** In `compact`, the other buttons this row's next step needs (Extend at the end of a watch, Close after "not interested"). */
  alsoShow?: readonly MainActionId[];
  /** The row's next step is a call: Log call comes first, as the blue button. */
  callFirst?: boolean;
  /**
   * In `compact`, leave the stage's primary button out: the row's next step is done
   * somewhere else (held messages are checked on the Onboarding page, and "End
   * watch" beside them would invite ending the watch with messages unread).
   */
  withoutPrimary?: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = React.useState<MainActionId | null>(null);
  // ── reminders and calls ── a call can be logged at every step before live or closed.
  const [calling, setCalling] = React.useState(false);
  const canLogCall = outlet.stage !== 'live' && outlet.stage !== 'lost';
  const closeOutlet = useCloseOutletSetup();
  const watch = useChangeWatch();
  const resumeBilling = useResumeBilling();

  const specs = stageActions(outlet).filter(
    (a) => !compact || (a.primary && !withoutPrimary) || alsoShow.includes(a.id),
  );
  const dismiss = () => setOpen(null);
  const label = dealerCodeLabel(outlet.code);

  async function endWatch() {
    try {
      await watch.mutateAsync({ dealerId: outlet.dealerId, body: watchBody({ action: 'end' }) });
      toast.success(`${label} is live.`);
      dismiss();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'That did not go through.');
    }
  }

  // ── billing ── give back exactly the services a pause for non-payment stopped.
  async function resume() {
    try {
      await resumeBilling.mutateAsync(outlet.dealerId);
      toast.success(`${label}: services resumed.`);
      dismiss();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'That did not go through.');
    }
  }

  if (specs.length === 0 && !canLogCall) return null;

  const logCall = canLogCall ? (
    <Button
      key="log-call"
      size="sm"
      variant={callFirst ? 'primary' : 'ghost'}
      onClick={() => setCalling(true)}
    >
      Log call…
    </Button>
  ) : null;
  const showDoIt = !compact || !specs.some((a) => a.primary);

  return (
    <div className={cn('grid gap-2.5', className)}>
      {specs.length > 0 || canLogCall ? (
        <ActionRow
          below="wrap"
          align="start"
          className={layout === 'stack' ? 'flex-col !items-stretch' : undefined}
        >
          {callFirst ? logCall : null}
          {specs.map((a) => (
            <Button
              key={a.id}
              size="sm"
              variant={
                a.primary && !callFirst ? 'primary' : a.id === 'close' ? 'ghost' : 'secondary'
              }
              onClick={() => setOpen(a.id)}
            >
              {a.label}
            </Button>
          ))}
          {callFirst ? null : logCall}
        </ActionRow>
      ) : null}

      {/* ── do it for the dealer ── the dealer's own step for the open stage */}
      {showDoIt ? <DoItForDealer outlet={outlet} layout={layout} onGoToTab={onGoToTab} /> : null}

      <LogCallDialog
        target={
          calling
            ? { kind: 'outlet', dealerId: outlet.dealerId, code: outlet.code, ownerName: outlet.ownerName }
            : null
        }
        onClose={() => setCalling(false)}
        // "Not interested" offers Close next (any admin may close an outlet), but
        // never once services have started: that outlet is a client, not a lead.
        {...(outlet.stage === 'watch' ? {} : { onNotInterested: () => setOpen('close') })}
      />
      {/* ── billing ── */}
      <SendBillDialog outlet={open === 'send_bill' ? outlet : null} onClose={dismiss} />
      <RecordPaymentDialog
        target={open === 'record_payment' ? { kind: 'setup', outlet } : null}
        onClose={dismiss}
      />
      <PauseBillingDialog outlet={open === 'pause_billing' ? outlet : null} onClose={dismiss} />
      <ConfirmDialog
        open={open === 'resume_billing'}
        onCancel={dismiss}
        onConfirm={() => void resume()}
        loading={resumeBilling.isPending}
        title={`Resume the services for ${label}?`}
        description={
          <div className="grid gap-3">
            <p>
              Brings back exactly the services the pause stopped. A service that was paused for
              another reason stays paused.
            </p>
            <DealerReceivesBox action={{ kind: 'resume_services' }} />
          </div>
        }
        confirmLabel="Resume services"
        size="md"
      />
      {/* ── /billing ── */}
      <StartServicesDialog
        outlet={open === 'start_services' || open === 'start_anyway' ? outlet : null}
        onClose={dismiss}
        onGoToTab={onGoToTab}
      />
      <ExtendWatchDialog outlet={open === 'extend_watch' ? outlet : null} onClose={dismiss} />
      <ConfirmDialog
        open={open === 'end_watch'}
        onCancel={dismiss}
        onConfirm={() => void endWatch()}
        loading={watch.isPending}
        title={`End the watch for ${label}?`}
        description="The outlet becomes Live and the strip on the dealer's chat goes away."
        confirmLabel="End watch"
      />
      <CloseDialog
        open={open === 'close'}
        title="Close this onboarding"
        confirmLabel="Close onboarding"
        subject={
          <>
            <span className="font-medium">{label}</span>
            {outlet.ownerName ? (
              <span className="text-text-muted"> · {outlet.ownerName}</span>
            ) : null}
          </>
        }
        pending={closeOutlet.isPending}
        onClose={dismiss}
        onSubmit={(reason) =>
          closeOutlet.mutateAsync({ dealerId: outlet.dealerId, body: closeBody(reason) })
        }
      />
    </div>
  );
}
