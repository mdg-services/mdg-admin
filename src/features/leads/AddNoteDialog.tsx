import * as React from 'react';

import { Button, Dialog, FieldError, Label, Textarea, useToast } from '@/components/ui';
import { useAddLeadNote } from '@/hooks/api/useLeads';
import { NOTE_MAX, noteBody, noteProblem } from '@/lib/leads';
import type { LeadRow } from '@dk/shared';

import { LeadBox, errorText } from './shared';

/**
 * "Add note": something the next person should know. It goes on the lead's log
 * and does not move the follow-up: use "Log contact" for a call that happened.
 */
export function AddNoteDialog({ lead, onClose }: { lead: LeadRow | null; onClose: () => void }) {
  return lead ? <AddNoteForm key={lead.id} lead={lead} onClose={onClose} /> : null;
}

function AddNoteForm({ lead, onClose }: { lead: LeadRow; onClose: () => void }) {
  const toast = useToast();
  const add = useAddLeadNote();
  const noteId = React.useId();
  const [text, setText] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const problem = noteProblem(text);

  async function submit() {
    if (add.isPending) return;
    setTouched(true);
    if (problem) return;
    try {
      await add.mutateAsync({ id: lead.id, body: noteBody(text) });
      toast.success('Note added.');
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add note"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={add.isPending}>
            Add note
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
          <Label htmlFor={noteId} required>
            Note
          </Label>
          <Textarea
            id={noteId}
            rows={4}
            value={text}
            maxLength={NOTE_MAX + 50}
            onChange={(e) => setText(e.target.value)}
            invalid={touched && problem !== null}
            placeholder="For example: owns two pumps, the second one is at Deogarh."
          />
        </div>
        <FieldError message={touched ? (problem ?? undefined) : undefined} />
        <p className="text-xs text-text-muted">
          Your team sees this on the lead. It does not change when the lead is next due.
        </p>
      </form>
    </Dialog>
  );
}
