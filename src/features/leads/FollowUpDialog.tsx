import * as React from 'react';

import { Button, Dialog, FieldError, Input, Label, Textarea, useToast } from '@/components/ui';
import { useSetLeadFollowUp } from '@/hooks/api/useLeads';
import {
  NOTE_MAX,
  followUpBody,
  followUpProblem,
  moveIntoWindow,
  parseWhen,
  quickPicks,
  reminderLine,
  whenInput,
  whenWords,
} from '@/lib/leads';
import type { LeadRow } from '@dk/shared';

import { LeadBox, errorText } from './shared';

/**
 * "Set follow-up": choose when somebody should get in touch next, instead of
 * the time the system would pick. Date and time are India time, with three
 * one-tap choices for the usual ones.
 *
 * It does not log a contact and does not stop the system: the lead stays on the
 * list and is raised again at this time, at any hour: reminders go out day and
 * night. The form says when the reminder will come.
 */
export function FollowUpDialog({ lead, onClose }: { lead: LeadRow | null; onClose: () => void }) {
  return lead ? <FollowUpForm key={lead.id} lead={lead} onClose={onClose} /> : null;
}

function FollowUpForm({ lead, onClose }: { lead: LeadRow; onClose: () => void }) {
  const toast = useToast();
  const set = useSetLeadFollowUp();
  const dayId = React.useId();
  const timeId = React.useId();
  const noteId = React.useId();
  const [openedAt] = React.useState(() => Date.now());
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('');
  const [note, setNote] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const form = { date, time, note };
  const problem = followUpProblem(form, Date.now());
  const at = parseWhen(form);
  const picks = React.useMemo(() => quickPicks(openedAt), [openedAt]);

  function pick(ms: number) {
    const w = whenInput(ms);
    setDate(w.date);
    setTime(w.time);
  }

  async function submit() {
    if (set.isPending) return;
    setTouched(true);
    if (followUpProblem(form, Date.now())) return;
    try {
      await set.mutateAsync({ id: lead.id, body: followUpBody(form) });
      toast.success(`Follow-up set for ${whenWords(moveIntoWindow(at ?? 0), Date.now(), true)}.`);
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Set follow-up"
      footerBelow="row"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={set.isPending}>
            Set follow-up
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

        <div className="flex flex-wrap gap-2">
          {picks.map((p) => (
            <Button key={p.id} size="sm" variant="secondary" onClick={() => pick(p.at)}>
              {p.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={dayId} required>
              Day
            </Label>
            <Input
              id={dayId}
              type="date"
              value={date}
              min={whenInput(openedAt).date}
              onChange={(e) => setDate(e.target.value)}
              invalid={touched && !date}
            />
          </div>
          <div>
            <Label htmlFor={timeId} required>
              Time
            </Label>
            <Input
              id={timeId}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              invalid={touched && !time}
            />
          </div>
        </div>
        <p className="-mt-1 text-xs text-text-muted">
          India time. {at !== null ? reminderLine(at, Date.now()) : ''}
        </p>

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
            placeholder="For example: he is travelling until Monday."
          />
        </div>

        <FieldError message={touched ? (problem ?? undefined) : undefined} />
      </form>
    </Dialog>
  );
}
