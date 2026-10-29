import * as React from 'react';

import { Button, Callout, Dialog, FieldError, Label, Textarea, useToast } from '@/components/ui';
import { DealerReceivesBox } from '@/features/payments/DealerReceivesBox';
import { useRestartBilling } from '@/hooks/api/useBilling';
import { useOnboardingConfigQuery } from '@/hooks/api/useOnboarding';
import {
  RESTART_REASON_MAX,
  restartBillingAction,
  restartBillingBody,
  restartReasonProblem,
  restartWords,
} from '@/lib/billingRelease2';
import { istTodayYmd } from '@/lib/format';
import { dealerCodeLabel, type OutletSetupAdmin } from '@dk/shared';

import { ForOutlet } from './BillingDialogs';

/**
 * "Bill this outlet again", for an outlet whose billing ended when its first month
 * was given back. A super-admin only, with a reason that is written to the log.
 *
 * Nothing goes to the owner now. The new month starts TODAY: the next daily run raises
 * a bill at the monthly price for it and sends it as a payment link (Razorpay's
 * SMS and email, and the bill on WhatsApp). "What the dealer receives" says so before
 * the press. Until the monthly price is known the amount is not shown (never "₹0") and
 * the button stays off. A refusal comes back from the server in its own words and the form
 * stays open.
 */
export function RestartBillingDialog({
  outlet,
  onClose,
}: {
  outlet: OutletSetupAdmin | null;
  onClose: () => void;
}) {
  return outlet ? <RestartForm key={outlet.dealerId} outlet={outlet} onClose={onClose} /> : null;
}

function RestartForm({ outlet, onClose }: { outlet: OutletSetupAdmin; onClose: () => void }) {
  const toast = useToast();
  const restart = useRestartBilling();
  const config = useOnboardingConfigQuery(true);
  const reasonId = React.useId();
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const problem = restartReasonProblem(reason);
  const today = istTodayYmd();
  // Not known until the settings arrive: the amount stays hidden and the button off till then.
  const price = config.data?.monthlyPricePaise ?? null;
  const priceKnown = typeof price === 'number' && price > 0;

  async function submit() {
    if (restart.isPending || !priceKnown) return;
    setTouched(true);
    if (problem) return;
    try {
      await restart.mutateAsync({ dealerId: outlet.dealerId, ...restartBillingBody(reason) });
      toast.success(
        `${dealerCodeLabel(outlet.code)}: billing starts again. The next daily run raises the bill.`,
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open
      onClose={restart.isPending ? () => {} : onClose}
      title="Bill this outlet again"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={restart.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            loading={restart.isPending}
            disabled={!priceKnown}
          >
            Bill again
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ForOutlet outlet={outlet} />
        <Callout intent="info">{restartWords(today)}</Callout>
        {priceKnown ? (
          <DealerReceivesBox action={restartBillingAction(price)} />
        ) : (
          <p className="text-sm text-text-muted">
            {config.isError
              ? 'The monthly price could not be loaded, so billing cannot start again yet. Close this and try again.'
              : 'Loading the monthly price…'}
          </p>
        )}
        <div>
          <Label htmlFor={reasonId} required>
            Why
          </Label>
          <Textarea
            id={reasonId}
            rows={3}
            value={reason}
            maxLength={RESTART_REASON_MAX + 50}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: the owner called on 30 Oct and wants to carry on."
            invalid={touched && !!problem}
          />
          <FieldError message={touched ? (problem ?? undefined) : undefined} />
        </div>
      </form>
    </Dialog>
  );
}
