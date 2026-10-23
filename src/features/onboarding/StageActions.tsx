import * as React from 'react';

import { ActionRow, Button, ConfirmDialog, useToast } from '@/components/ui';
import { useChangeWatch, useCloseOutletSetup } from '@/hooks/api/useOnboarding';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import {
  availableActions,
  closeBody,
  needsSuperAdminNote,
  watchBody,
  type StageActionId,
} from '@/lib/onboarding';
import { dealerCodeLabel, type OutletSetupAdmin } from '@dk/shared';

import { CloseDialog } from './CloseDialog';
import {
  BillSentDialog,
  ExtendWatchDialog,
  PaymentReceivedDialog,
  StartServicesDialog,
} from './SetupDialogs';

/**
 * The buttons an outlet's onboarding offers at its current stage, and the forms
 * behind them. One component, used by the Onboarding page's rows and by the
 * Setup card on the dealer's Info tab, so the two can never offer different
 * things for the same outlet.
 *
 * WHICH buttons is `availableActions` (`lib/onboarding.ts`): the stage decides,
 * and a plain admin does not see the super-admin's (recording a payment). When
 * the next move is a super-admin's and the person looking is not one, a line
 * says so instead of leaving them with nothing to press and no reason.
 *
 * Only one form is open at a time. The forms mount only while open, so a page of
 * fifty rows holds no fifty dialogs.
 */
export function StageActions({
  outlet,
  layout = 'wrap',
  className,
}: {
  outlet: OutletSetupAdmin;
  /**
   * `wrap` is a row of buttons that wraps, for a card. `stack` is one button
   * under another at the same width, for a narrow table column, where a wrapped
   * row of different widths looks like a ragged mistake.
   */
  layout?: 'wrap' | 'stack';
  className?: string;
}) {
  const toast = useToast();
  const isSuperAdmin = useIsSuperAdmin();
  const [open, setOpen] = React.useState<StageActionId | null>(null);
  const closeOutlet = useCloseOutletSetup();
  const watch = useChangeWatch();

  const specs = availableActions(outlet, isSuperAdmin);
  const note = needsSuperAdminNote(outlet, isSuperAdmin);
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

  if (specs.length === 0 && !note) return null;

  return (
    <div className={className}>
      {specs.length > 0 ? (
        <ActionRow
          below="wrap"
          align="start"
          className={layout === 'stack' ? 'flex-col !items-stretch' : undefined}
        >
          {specs.map((a) => (
            <Button
              key={a.id}
              size="sm"
              variant={a.primary ? 'primary' : a.id === 'close' ? 'ghost' : 'secondary'}
              onClick={() => setOpen(a.id)}
            >
              {a.label}
            </Button>
          ))}
        </ActionRow>
      ) : null}
      {note ? <p className="mt-1.5 text-xs text-text-muted">{note}</p> : null}

      <BillSentDialog outlet={open === 'send_bill' ? outlet : null} onClose={dismiss} />
      <PaymentReceivedDialog outlet={open === 'record_payment' ? outlet : null} onClose={dismiss} />
      <StartServicesDialog
        outlet={open === 'start_services' || open === 'start_anyway' ? outlet : null}
        onClose={dismiss}
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
