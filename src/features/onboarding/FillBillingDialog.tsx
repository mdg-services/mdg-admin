import * as React from 'react';

import { Button, Callout, Dialog, FieldError, useToast } from '@/components/ui';
import { useDealerQuery } from '@/hooks/api/useDealers';
import { useSaveBillingForDealer } from '@/hooks/api/useOnboarding';
import { ApiError } from '@/lib/api';
import { billingSaveBody, setupRefusalWords } from '@/lib/onboarding';
import {
  type BillToDraft,
  type BillToProblems,
  EMPTY_BILL_TO,
  billToDraftFrom,
  billToForOutlet,
  checkBillTo,
} from '@/pages/payments/format';
import { dealerCodeLabel, type OutletSetupAdmin } from '@dk/shared';

import { BillToFields } from '../payments/BillToFields';

import { ForOutlet, errorText } from './SetupDialogs';

/**
 * Fill in, or change, the bill-to details for the dealer: the name and address
 * the GST invoice prints, the state, and the GSTIN if they have one.
 *
 * The boxes and their rules are the Payments page's "Bill to" (`BillToFields`,
 * `checkBillTo`): the same check on the GSTIN (shape, a known state, the check
 * character), and the state locked to the GSTIN's own while there is one. That is
 * what the owner's billing card does too, and the server saves both through one
 * function, so an open bill is brought up to date in either case.
 *
 * The server refuses before the first sign-in (the owner has not opened the app),
 * while the oil company is not chosen (`COMPANY_FIRST`), and once the payment is in
 * (the details are locked); a refusal comes back as a toast with the form left open. The dealer's chat gets one plain line that the
 * team filled in their bill details, and the card shows them read-only with a
 * small "filled in by MDG's team" note.
 *
 * `outlet` is the outlet the form is about; `null` is closed.
 */
export function FillBillingDialog({
  outlet,
  onClose,
}: {
  outlet: OutletSetupAdmin | null;
  onClose: () => void;
}) {
  return outlet ? <FillBillingForm key={outlet.dealerId} outlet={outlet} onClose={onClose} /> : null;
}

function FillBillingForm({ outlet, onClose }: { outlet: OutletSetupAdmin; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveBillingForDealer();
  // The outlet's own GSTIN (from its file) goes in the box when no details are saved yet.
  const dealerQ = useDealerQuery(outlet.dealerId);
  const [draft, setDraft] = React.useState<BillToDraft>(
    outlet.billing ? billToDraftFrom(outlet.billing) : EMPTY_BILL_TO,
  );
  // Once per opening, and never over what was typed.
  const [filled, setFilled] = React.useState(!!outlet.billing);
  // Problems wait for a press of Save: showing them against untouched boxes is a scolding.
  const [attempted, setAttempted] = React.useState(false);

  React.useEffect(() => {
    if (filled || !dealerQ.data) return;
    setDraft((d) => billToForOutlet(d, dealerQ.data.gst, false));
    setFilled(true);
  }, [filled, dealerQ.data]);

  const check = checkBillTo(draft, true);
  const shown: BillToProblems = attempted && check.kind === 'bad' ? check.problems : {};
  const label = dealerCodeLabel(outlet.code);
  const change = !!outlet.billing;

  async function submit() {
    if (save.isPending) return;
    setAttempted(true);
    if (check.kind !== 'ok') return;
    try {
      await save.mutateAsync({ dealerId: outlet.dealerId, body: billingSaveBody(check.billTo) });
      toast.success(`${label}: billing details saved.`);
      onClose();
    } catch (err) {
      // 409 COMPANY_FIRST: the oil company is not chosen yet, so billing waits for it.
      toast.error((err instanceof ApiError && setupRefusalWords(err.code)) || errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={save.isPending ? () => {} : onClose}
      title={change ? 'Change billing details' : 'Fill billing details'}
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending}>
            Save details
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        noValidate
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ForOutlet outlet={outlet} />
        <BillToFields value={draft} onChange={setDraft} problems={shown} required />
        <FieldError message={shown.form} />
        {outlet.payment.state === 'sent' ? (
          <Callout intent="info">
            A bill has already been sent. Saving brings that bill’s “bill to” up to date as well.
          </Callout>
        ) : null}
        <p className="text-xs text-text-muted">
          The dealer sees these in their chat with a note that MDG’s team filled them in, and can
          still change them until the payment is in. Their chat gets a line saying the team did it.
        </p>
      </form>
    </Dialog>
  );
}
