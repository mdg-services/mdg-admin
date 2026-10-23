import * as React from 'react';

import { Button, Dialog, FieldError, useToast } from '@/components/ui';
import { useDealersQuery } from '@/hooks/api/useDealers';
import { useUpdateBillTo } from '@/hooks/api/usePayments';
import {
  type BillToDraft,
  type BillToProblems,
  billToDraftFrom,
  billToForOutlet,
  billToState,
  checkBillTo,
  taxSplitHint,
} from '@/pages/payments/format';
import type { AdminPayment } from '@dk/shared';

import { BillToFields } from './BillToFields';

/**
 * Say who the GST invoice is made out to, or correct it — for a payment that
 * has no invoice yet. Once the invoice is issued the name and address on it are
 * the legal record, so the drawer stops offering this and the server refuses.
 *
 * Name, address and state are all required here (unlike on the "Request a
 * payment" form, where the whole section can wait): this is the step that lets
 * the invoice be made. When the payment has no bill-to yet the outlet's own
 * GSTIN is filled in from its record, as the request form does.
 *
 * `payment` is the one being edited; `null` is closed.
 */
export function BillToDialog({
  payment,
  onClose,
}: {
  payment: AdminPayment | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const update = useUpdateBillTo();
  // The same request the "Request a payment" form makes, so it is already cached.
  const dealersQ = useDealersQuery({ pageSize: 200 });
  const [draft, setDraft] = React.useState<BillToDraft>(billToDraftFrom(null));
  // The outlet's GSTIN goes in once per opening, and never over what was typed.
  const [filled, setFilled] = React.useState(false);
  // Problems wait for a press of Save: showing them against untouched boxes is a scolding.
  const [attempted, setAttempted] = React.useState(false);

  // Start from what is saved, once per opening. The payment is fetched again in
  // the background (a refocused window does it), and that must not put back what
  // was saved while somebody is typing — so only a different payment, or a
  // reopening, starts the boxes over.
  const openedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = payment?.id ?? null;
    if (id === openedFor.current) return;
    openedFor.current = id;
    setDraft(billToDraftFrom(payment?.billTo));
    setFilled(false);
    setAttempted(false);
  }, [payment]);

  React.useEffect(() => {
    if (!payment || filled || payment.billTo || !dealersQ.data) return;
    const gst = dealersQ.data.items.find((d) => d.id === payment.dealerId)?.gst;
    setDraft((d) => billToForOutlet(d, gst, false));
    setFilled(true);
  }, [payment, filled, dealersQ.data]);

  const check = checkBillTo(draft, true);
  const shown: BillToProblems = attempted && check.kind === 'bad' ? check.problems : {};

  async function submit() {
    if (!payment || update.isPending) return;
    setAttempted(true);
    if (check.kind !== 'ok') return;
    try {
      await update.mutateAsync({ id: payment.id, billTo: check.billTo });
      toast.success('Saved who to bill.');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'That did not go through.');
    }
  }

  return (
    <Dialog
      open={!!payment}
      onClose={update.isPending ? () => {} : onClose}
      title={payment?.billTo ? 'Change who to bill' : 'Add who to bill'}
      description={payment ? `Printed on the GST invoice for ${payment.number}.` : undefined}
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={update.isPending}>
            Save
          </Button>
        </>
      }
    >
      {payment ? (
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <BillToFields value={draft} onChange={setDraft} problems={shown} required />
          {/* What the state does to this payment's tax, before it is saved. */}
          <p className="text-xs tabular-nums text-text-muted">
            {taxSplitHint(payment.amountPaise, billToState(draft))}
          </p>
          <FieldError message={shown.form} />
        </form>
      ) : null}
    </Dialog>
  );
}
