import * as React from 'react';

import { Button, Dialog, FieldError, Label, Select, Textarea, useToast } from '@/components/ui';
import { useCloseLead } from '@/hooks/api/useLeads';
import { CLOSE_HINTS, NOTE_MAX, closeBody, closeProblem, statusLabel } from '@/lib/leads';
import { LEAD_ADMIN_CLOSE_REASONS, type LeadAdminCloseReason, type LeadRow } from '@dk/shared';

import { LeadBox, errorText } from './shared';

/**
 * "Close lead": stop chasing this person. The reasons are the four a person
 * can give; "client" is only ever the system's, when an outlet is approved.
 *
 * Closing takes the lead off every list but Closed and stops every alert about
 * it. "Asked to stop" also puts the number on the WhatsApp stop list, and the
 * hint says so before it is picked. A lead that said no opens again by itself if
 * they write, tap "Call me", ask for a call-back or register; "wrong number" and
 * "not a lead" stay closed until somebody reopens them.
 */
export function CloseLeadDialog({ lead, onClose }: { lead: LeadRow | null; onClose: () => void }) {
  return lead ? <CloseLeadForm key={lead.id} lead={lead} onClose={onClose} /> : null;
}

function CloseLeadForm({ lead, onClose }: { lead: LeadRow; onClose: () => void }) {
  const toast = useToast();
  const close = useCloseLead();
  const reasonId = React.useId();
  const noteId = React.useId();
  const [reason, setReason] = React.useState('');
  const [note, setNote] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const form = { reason, note };
  const problem = closeProblem(form);

  async function submit() {
    if (close.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await close.mutateAsync({ id: lead.id, body: closeBody(form) });
      toast.success('Lead closed.');
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Close lead"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={close.isPending}>
            Close lead
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
          <Label htmlFor={reasonId} required>
            Why
          </Label>
          <Select
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            invalid={touched && !reason}
          >
            <option value="">Choose…</option>
            {LEAD_ADMIN_CLOSE_REASONS.map((r) => (
              <option key={r} value={r}>
                {statusLabel(r)}
              </option>
            ))}
          </Select>
          {reason ? (
            <p className="mt-1 text-xs text-text-muted">{CLOSE_HINTS[reason as LeadAdminCloseReason]}</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor={noteId} hint="Optional">
            Note
          </Label>
          <Textarea
            id={noteId}
            rows={2}
            value={note}
            maxLength={NOTE_MAX + 50}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: has a tie-up with another company."
          />
        </div>
        <FieldError message={touched ? (problem ?? undefined) : undefined} />
      </form>
    </Dialog>
  );
}
