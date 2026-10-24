import * as React from 'react';

import { Button, Dialog, FieldError, Input, Label, useToast } from '@/components/ui';
import { useAddLeadPhone } from '@/hooks/api/useLeads';
import { phoneBody, phoneProblem } from '@/lib/leads';
import type { LeadRow } from '@dk/shared';

import { LeadBox, errorText } from './shared';

/**
 * "Add number": a share-link lead is known by the link's label until somebody
 * who knows the person gives us their number. With a number the lead can be
 * called and messaged, and the follow-up clock starts counting from then.
 *
 * A number another lead already holds joins the two into one, and the server says
 * which one survived; `onOpenLead` follows it, so the drawer never keeps showing
 * the lead that was folded away.
 */
export function AddPhoneDialog({
  lead,
  onClose,
  onOpenLead,
}: {
  lead: LeadRow | null;
  onClose: () => void;
  onOpenLead: (id: string) => void;
}) {
  return lead ? (
    <AddPhoneForm key={lead.id} lead={lead} onClose={onClose} onOpenLead={onOpenLead} />
  ) : null;
}

function AddPhoneForm({
  lead,
  onClose,
  onOpenLead,
}: {
  lead: LeadRow;
  onClose: () => void;
  onOpenLead: (id: string) => void;
}) {
  const toast = useToast();
  const add = useAddLeadPhone();
  const phoneId = React.useId();
  const [mobile, setMobile] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const problem = phoneProblem(mobile);

  async function submit() {
    if (add.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      const survivor = await add.mutateAsync({ id: lead.id, body: phoneBody(mobile) });
      if (survivor === lead.id) {
        toast.success('Number added.');
      } else {
        toast.success('Number added. This person was already a lead, so the two are now one.');
        onOpenLead(survivor);
      }
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add number"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={add.isPending}>
            Add number
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
        <LeadBox lead={lead} />
        <div>
          <Label htmlFor={phoneId} required>
            Mobile number
          </Label>
          <Input
            id={phoneId}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            invalid={touched && problem !== null}
            placeholder="98765 43210"
          />
        </div>
        <FieldError message={touched ? (problem ?? undefined) : undefined} />
        <p className="text-xs text-text-muted">
          Use the number you know for this person. If another lead already has it, the two become
          one.
        </p>
      </form>
    </Dialog>
  );
}
