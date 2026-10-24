import * as React from 'react';

import { Button, Dialog, FieldError, Label, Textarea, useToast } from '@/components/ui';
import { useReopenLead } from '@/hooks/api/useLeads';
import { NOTE_MAX, reopenBody, reopenProblem } from '@/lib/leads';
import type { LeadRow } from '@dk/shared';

import { LeadBox, errorText } from './shared';

/**
 * "Reopen": put a closed lead back on the list, and the system starts chasing
 * it again. Not offered for a client.
 *
 * It does NOT take anybody off the WhatsApp stop list. A lead that asked us to
 * stop stays on it, so reopening one is a reason to call, never to send a
 * promotion; the form says so, because that is the part a person would assume
 * the other way.
 */
export function ReopenLeadDialog({ lead, onClose }: { lead: LeadRow | null; onClose: () => void }) {
  return lead ? <ReopenLeadForm key={lead.id} lead={lead} onClose={onClose} /> : null;
}

function ReopenLeadForm({ lead, onClose }: { lead: LeadRow; onClose: () => void }) {
  const toast = useToast();
  const reopen = useReopenLead();
  const noteId = React.useId();
  const [note, setNote] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const problem = reopenProblem(note);

  async function submit() {
    if (reopen.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await reopen.mutateAsync({ id: lead.id, body: reopenBody(note) });
      toast.success('Lead opened again.');
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Reopen lead"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={reopen.isPending}>
            Reopen
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
        <p className="text-sm text-text">
          The lead goes back on the list and is chased again, starting now.
        </p>
        {lead.optedOut ? (
          <p className="text-sm text-text">
            They are on the WhatsApp stop list, and reopening does not take them off. No promotion
            reaches them. A phone call is fine.
          </p>
        ) : null}
        <div>
          <Label htmlFor={noteId} hint="Optional">
            Why
          </Label>
          <Textarea
            id={noteId}
            rows={2}
            value={note}
            maxLength={NOTE_MAX + 50}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: he called back and wants to talk."
          />
        </div>
        <FieldError message={touched ? (problem ?? undefined) : undefined} />
      </form>
    </Dialog>
  );
}
